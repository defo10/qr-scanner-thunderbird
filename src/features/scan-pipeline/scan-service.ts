import type { ScanPort, TbApi } from '../../platform/tb-api';
import { runScan, type ScanSettings, type ScanTb } from './orchestrator';
import { createScanCache } from './session-cache';
import type { WorkerClient } from './worker-client';

export interface ScanServiceDeps {
  readonly tb: ScanTb & Pick<TbApi, 'onScanPortConnected' | 'onScanActionClicked' | 'setScanActionEnabled' | 'sessionStore'>;
  readonly worker: WorkerClient;
  readonly htmlParser: DOMParser;
  readonly settings: () => Promise<ScanSettings>;
  readonly onSettingsChanged: (listener: () => void) => void;
}

interface Display {
  readonly port: ScanPort;
  readonly controller: AbortController;
  scanning: boolean;
}

// - Scans run only for a display script that holds an open port, i.e. only
//   for a message that is on screen; nothing listens for new mail.
// - The port is the scan's lifetime: its disconnect aborts the scan, and a new
//   port from the same tab replaces (and aborts) the tab's previous one.
// - With automatic scanning off, the port is kept and the scan starts when
//   the toolbar button is clicked in that tab; the button is enabled only
//   then. Listeners are registered synchronously so events wake the page.
export function startScanService(deps: ScanServiceDeps): void {
  const cache = createScanCache(deps.tb.sessionStore);
  const displays = new Map<number, Display>();

  const scan = (tabId: number, display: Display, settings: ScanSettings) => {
    if (display.scanning) return;
    display.scanning = true;
    const ctx = { tb: deps.tb, worker: deps.worker, cache, signal: display.controller.signal, htmlParser: deps.htmlParser, settings, tabId };
    runScan(ctx, event => display.port.post(event)).catch((e: unknown) => console.error('scan failed', e));
  };

  deps.tb.onScanPortConnected(port => {
    const tabId = port.tabId;
    if (tabId === undefined) return;
    displays.get(tabId)?.controller.abort();
    const display: Display = { port, controller: new AbortController(), scanning: false };
    displays.set(tabId, display);
    port.onDisconnect(() => {
      display.controller.abort();
      if (displays.get(tabId) === display) displays.delete(tabId);
    });
    void deps.settings().then(settings => {
      if (settings.autoScan) scan(tabId, display, settings);
      else display.port.post({ type: 'manual-available' });
    });
  });

  deps.tb.onScanActionClicked(tabId => {
    const display = displays.get(tabId);
    if (display) void deps.settings().then(settings => scan(tabId, display, settings));
  });

  const syncScanAction = () => deps.settings().then(s => deps.tb.setScanActionEnabled(!s.autoScan)).catch(() => undefined);
  deps.onSettingsChanged(() => void syncScanAction());
  void syncScanAction();
}
