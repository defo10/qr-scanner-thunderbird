import { createWorkerClient, startScanService } from '../features/scan-pipeline';
import { loadSettings, SETTINGS_KEY } from '../features/settings';
import { defaultTbApi } from '../platform/tb-api';
import { compileWasm, spawnScannerWorker } from '../platform/worker-host';

const tb = defaultTbApi();
const worker = createWorkerClient({
  spawn: spawnScannerWorker,
  loadWasm: () => compileWasm(tb.extensionUrl('zxing_reader.wasm')),
});

startScanService({
  tb,
  worker,
  htmlParser: new DOMParser(),
  settings: () => loadSettings(tb.localStore),
  onSettingsChanged: listener => tb.onLocalStorageChanged(SETTINGS_KEY, listener),
});
void tb.registerDisplayScript({ js: ['display.js'] });
