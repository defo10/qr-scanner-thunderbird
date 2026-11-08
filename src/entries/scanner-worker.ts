import { rasterImageInBrowser } from '../features/image-scan';
import { createWorkerRuntime } from '../features/scan-pipeline';
import type { WorkerRequest, WorkerResponse } from '../shared/worker-protocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const handle = createWorkerRuntime({ rasterImage: rasterImageInBrowser }, r => scope.postMessage(r));
scope.onmessage = e => void handle(e.data);
