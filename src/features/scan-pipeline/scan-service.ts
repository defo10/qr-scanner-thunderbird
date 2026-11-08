import type { TbApi } from '../../platform/tb-api';
import { runScan, type ScanSettings, type ScanTb } from './orchestrator';
import type { WorkerClient } from './worker-client';

export interface ScanServiceDeps {
  readonly tb: ScanTb & Pick<TbApi, 'onScanPortConnected'>;
  readonly worker: WorkerClient;
  readonly settings: () => ScanSettings;
}

// Scans run only for a display script that holds an open port, i.e. only for
// a message that is on screen; nothing listens for new mail.
export function startScanService(deps: ScanServiceDeps): void {
  deps.tb.onScanPortConnected(port => {
    if (port.tabId === undefined) return;
    const ctx = { tb: deps.tb, worker: deps.worker, settings: deps.settings(), tabId: port.tabId };
    runScan(ctx, event => port.post(event)).catch((e: unknown) => console.error('scan failed', e));
  });
}
