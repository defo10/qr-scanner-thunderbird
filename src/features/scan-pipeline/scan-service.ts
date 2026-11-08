import type { TbApi } from '../../platform/tb-api';
import { runScan, type ScanSettings, type ScanTb } from './orchestrator';
import { createScanCache } from './session-cache';
import type { WorkerClient } from './worker-client';

export interface ScanServiceDeps {
  readonly tb: ScanTb & Pick<TbApi, 'onScanPortConnected' | 'sessionStore'>;
  readonly worker: WorkerClient;
  readonly htmlParser: DOMParser;
  readonly settings: () => ScanSettings;
}

// - Scans run only for a display script that holds an open port, i.e. only
//   for a message that is on screen; nothing listens for new mail.
// - The port is the scan's lifetime: its disconnect aborts the scan, and a new
//   port from the same tab aborts the tab's previous scan.
export function startScanService(deps: ScanServiceDeps): void {
  const cache = createScanCache(deps.tb.sessionStore);
  const running = new Map<number, AbortController>();

  deps.tb.onScanPortConnected(port => {
    const tabId = port.tabId;
    if (tabId === undefined) return;
    running.get(tabId)?.abort();
    const controller = new AbortController();
    running.set(tabId, controller);
    port.onDisconnect(() => controller.abort());

    const ctx = {
      tb: deps.tb,
      worker: deps.worker,
      cache,
      signal: controller.signal,
      htmlParser: deps.htmlParser,
      settings: deps.settings(),
      tabId,
    };
    runScan(ctx, event => port.post(event))
      .catch((e: unknown) => console.error('scan failed', e))
      .finally(() => { if (running.get(tabId) === controller) running.delete(tabId); });
  });
}
