import { createWorkerRuntime } from '../../src/features/scan-pipeline';
import type { SpawnWorker } from '../../src/platform/worker-host';
import type { WorkerRequest, WorkerResponse } from '../../src/shared/worker-protocol';
import { nodeRasterImage } from '../helpers/load-fixture';

export interface FakeWorkerHost {
  readonly spawn: SpawnWorker;
  readonly spawnCount: () => number;
  readonly scannedJobs: () => number;
}

// Runs the real worker runtime in-process, with a Node rasterizer in place of
// createImageBitmap/OffscreenCanvas.
export function createFakeWorkerHost(): FakeWorkerHost {
  let spawned = 0;
  let jobs = 0;
  const spawn: SpawnWorker = () => {
    spawned++;
    const listeners: ((r: WorkerResponse) => void)[] = [];
    let terminated = false;
    const runtime = createWorkerRuntime({ rasterImage: nodeRasterImage }, r => {
      if (!terminated) setTimeout(() => listeners.forEach(l => l(r)), 0);
    });
    return {
      post: (message: WorkerRequest) => {
        if (message.type === 'scan') jobs++;
        setTimeout(() => void runtime(message), 0);
      },
      onMessage: l => listeners.push(l),
      onError: () => undefined,
      terminate: () => { terminated = true; },
    };
  };
  return { spawn, spawnCount: () => spawned, scannedJobs: () => jobs };
}
