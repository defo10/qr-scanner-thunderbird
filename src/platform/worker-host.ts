import type { WorkerRequest, WorkerResponse } from '../shared/worker-protocol';

export interface WorkerHandle {
  post(message: WorkerRequest, transfer?: Transferable[]): void;
  onMessage(listener: (response: WorkerResponse) => void): void;
  /** Uncaught errors inside the worker, including failed module loading. */
  onError(listener: (message: string) => void): void;
  terminate(): void;
}

export type SpawnWorker = () => WorkerHandle;

export const spawnScannerWorker: SpawnWorker = () => {
  const worker = new Worker('scanner-worker.js', { type: 'module' });
  return {
    post: (message, transfer = []) => worker.postMessage(message, transfer),
    onMessage: listener => worker.addEventListener('message', e => listener(e.data as WorkerResponse)),
    onError: listener => worker.addEventListener('error', e => {
      e.preventDefault();
      listener(e.message);
    }),
    terminate: () => worker.terminate(),
  };
};

// - The URL is the extension's own packaged file; this is not a network fetch.
// - compileStreaming would depend on the file being served as application/wasm.
export async function compileWasm(url: string): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await (await fetch(url)).arrayBuffer());
}
