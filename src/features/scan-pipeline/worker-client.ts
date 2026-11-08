import type { SpawnWorker, WorkerHandle } from '../../platform/worker-host';
import type { DecodedCode, ErrorReason } from '../../shared/types';
import type { ImageJob, WorkerResponse } from '../../shared/worker-protocol';

export type JobOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: ErrorReason };

export type OnCodes = (codes: readonly DecodedCode[], page?: number) => void;

export interface WorkerClient {
  run(job: ImageJob, onCodes: OnCodes): Promise<JobOutcome>;
}

interface ActiveJob {
  readonly id: number;
  readonly onCodes: OnCodes;
  readonly finish: (outcome: JobOutcome) => void;
}

// - One worker runs one job at a time; concurrent callers are queued.
// - The worker is spawned lazily and replaced after it crashes.
// - The WASM module is compiled once and handed to every worker, so a
//   respawn only pays for instantiation.
export function createWorkerClient(deps: { spawn: SpawnWorker; loadWasm: () => Promise<WebAssembly.Module> }): WorkerClient {
  let wasm: Promise<WebAssembly.Module> | undefined;
  let worker: WorkerHandle | undefined;
  let active: ActiveJob | undefined;
  let nextJobId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const onResponse = (r: WorkerResponse) => {
    if (!active || r.jobId !== active.id) return;
    if (r.type === 'codes') active.onCodes(r.codes, r.page);
    else if (r.type === 'done') active.finish({ ok: true });
    else active.finish({ ok: false, reason: r.reason });
  };

  const onCrash = () => {
    worker?.terminate();
    worker = undefined;
    active?.finish({ ok: false, reason: 'unreadable' });
  };

  const ensureWorker = async (): Promise<WorkerHandle> => {
    if (worker) return worker;
    wasm ??= deps.loadWasm();
    const module = await wasm;
    const spawned = deps.spawn();
    spawned.onMessage(onResponse);
    spawned.onError(onCrash);
    spawned.post({ type: 'init', wasm: module });
    worker = spawned;
    return spawned;
  };

  const runNow = async (job: ImageJob, onCodes: OnCodes): Promise<JobOutcome> => {
    const w = await ensureWorker();
    const id = nextJobId++;
    const outcome = await new Promise<JobOutcome>(finish => {
      active = { id, onCodes, finish };
      w.post({ type: 'scan', jobId: id, ...job }, [job.bytes]);
    });
    active = undefined;
    return outcome;
  };

  return {
    run(job, onCodes) {
      const result = queue.then(() => runNow(job, onCodes));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
