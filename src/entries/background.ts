import { ALL_CODE_FORMATS } from '../features/decode';
import { createWorkerClient, startScanService } from '../features/scan-pipeline';
import { defaultTbApi } from '../platform/tb-api';
import { compileWasm, spawnScannerWorker } from '../platform/worker-host';

const tb = defaultTbApi();
const worker = createWorkerClient({
  spawn: spawnScannerWorker,
  loadWasm: () => compileWasm(tb.extensionUrl('zxing_reader.wasm')),
});

startScanService({ tb, worker, settings: () => ({ formats: ALL_CODE_FORMATS }) });
void tb.registerDisplayScript({ js: ['display.js'] });
