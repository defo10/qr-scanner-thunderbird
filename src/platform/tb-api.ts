export type ScanPort = messenger.runtime.Port;

const SCAN_PORT_NAME = 'scan';
const DISPLAY_SCRIPT_ID = 'qr-scanner-display';

// - TB 128 MV3 offers only scripting.messageDisplay (needs the `scripting` and
//   `messagesRead` permissions); messageDisplayScripts is not usable there.
// - Registrations outlive event-page suspension, and registering an existing id
//   rejects the whole call, so register only when missing.
export async function registerDisplayScript(files: { js: string[]; css?: string[] }): Promise<void> {
  const api = messenger.scripting.messageDisplay;
  const existing = await api.getRegisteredScripts({ ids: [DISPLAY_SCRIPT_ID] });
  if (existing.length > 0) return;
  await api.registerScripts([{ id: DISPLAY_SCRIPT_ID, ...files }]);
}

// Must be called synchronously at background top level: runtime.onConnect is
// what wakes the suspended event page when a message display script connects.
export function onScanPortConnected(listener: (port: ScanPort) => void): void {
  messenger.runtime.onConnect.addListener(port => {
    if (port.name === SCAN_PORT_NAME) listener(port);
  });
}

export function connectScanPort(): ScanPort {
  return messenger.runtime.connect({ name: SCAN_PORT_NAME });
}
