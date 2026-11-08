import { createWorkerRuntime } from '../../src/features/scan-pipeline';
import type { SpawnWorker } from '../../src/platform/worker-host';
import type { WorkerRequest, WorkerResponse } from '../../src/shared/worker-protocol';
import { nodeRasterImage } from '../helpers/load-fixture';

export interface FakeWorkerOptions {
  /** 1-based number of the scan job (counted across all workers) that never answers. */
  readonly hangOnJob?: number;
}

// Runs the real worker runtime in-process, with a Node rasterizer in place of
// createImageBitmap/OffscreenCanvas.
export function createFakeWorkerHost(options: FakeWorkerOptions = {}) {
  let spawned = 0;
  let terminated = 0;
  let jobs = 0;
  const jobWaiters = new Map<number, () => void>();

  const spawn: SpawnWorker = () => {
    spawned++;
    const listeners: ((r: WorkerResponse) => void)[] = [];
    let alive = true;
    const runtime = createWorkerRuntime({ rasterImage: nodeRasterImage }, r => {
      if (alive) setTimeout(() => { if (alive) listeners.forEach(l => l(r)); }, 0);
    });
    return {
      post: (message: WorkerRequest) => {
        if (message.type === 'scan') {
          const job = ++jobs;
          jobWaiters.get(job)?.();
          if (job === options.hangOnJob) return;
        }
        setTimeout(() => void runtime(message), 0);
      },
      onMessage: l => listeners.push(l),
      onError: () => undefined,
      terminate: () => {
        if (alive) terminated++;
        alive = false;
      },
    };
  };

  return {
    spawn,
    spawnCount: () => spawned,
    terminationCount: () => terminated,
    /** Resolves once the given scan job (1-based) has been posted to a worker. */
    jobStarted: (job: number) => new Promise<void>(resolve => {
      if (jobs >= job) resolve();
      else jobWaiters.set(job, resolve);
    }),
  };
}

export type FakeWorkerHost = ReturnType<typeof createFakeWorkerHost>;
