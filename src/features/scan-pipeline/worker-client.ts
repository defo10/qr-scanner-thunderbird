import type { SpawnWorker, WorkerHandle } from '../../platform/worker-host';
import type { DecodedCode, ErrorReason } from '../../shared/types';
import type { PageCount, ScanJob, WorkerResponse } from '../../shared/worker-protocol';

export type JobOutcome =
  | { readonly status: 'done'; readonly pages?: PageCount }
  | { readonly status: 'error'; readonly reason: ErrorReason }
  | { readonly status: 'aborted' };

export type OnCodes = (codes: readonly DecodedCode[], page?: number) => void;

export interface RunOptions {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

export interface WorkerClient {
  run(job: ScanJob, onCodes: OnCodes, options: RunOptions): Promise<JobOutcome>;
}

export interface WorkerClientDeps {
  readonly spawn: SpawnWorker;
  readonly loadWasm: () => Promise<WebAssembly.Module>;
  readonly idleTimeoutMs?: number;
}

interface ActiveJob {
  readonly id: number;
  readonly onCodes: OnCodes;
  readonly finish: (outcome: JobOutcome) => void;
}

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

// - One worker runs one job at a time; concurrent callers are queued.
// - Terminating is the only way to stop a running WASM call, so an abort or a
//   timeout terminates the worker, but only while one of its jobs is in
//   flight; an idle worker is kept for the next job. An idle worker is
//   released after idleTimeoutMs to free its memory.
// - The timeout starts when the job reaches the worker, not while it waits in
//   the queue.
// - Workers are spawned lazily and replaced after termination or a crash.
//   The WASM module is compiled once and handed to every new worker, so a
//   respawn only pays for instantiation.
export function createWorkerClient(deps: WorkerClientDeps): WorkerClient {
  const idleTimeoutMs = deps.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let wasm: Promise<WebAssembly.Module> | undefined;
  let worker: WorkerHandle | undefined;
  let active: ActiveJob | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let nextJobId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const discardWorker = () => {
    worker?.terminate();
    worker = undefined;
  };

  const onResponse = (r: WorkerResponse) => {
    if (!active || r.jobId !== active.id) return;
    if (r.type === 'codes') active.onCodes(r.codes, r.page);
    else if (r.type === 'done') active.finish(r.pages ? { status: 'done', pages: r.pages } : { status: 'done' });
    else active.finish({ status: 'error', reason: r.reason });
  };

  const onCrash = () => {
    discardWorker();
    active?.finish({ status: 'error', reason: 'unreadable' });
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

  const runNow = async (job: ScanJob, onCodes: OnCodes, { signal, timeoutMs }: RunOptions): Promise<JobOutcome> => {
    if (signal.aborted) return { status: 'aborted' };
    clearTimeout(idleTimer);
    const w = await ensureWorker();
    const id = nextJobId++;
    const stop = (outcome: JobOutcome) => {
      if (active?.id !== id) return;
      discardWorker();
      active.finish(outcome);
    };
    const onAbort = () => stop({ status: 'aborted' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await new Promise<JobOutcome>(finish => {
      active = { id, onCodes, finish };
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => stop({ status: 'error', reason: 'timeout' }), timeoutMs);
      w.post({ type: 'scan', jobId: id, ...job }, [job.bytes]);
    });
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    active = undefined;
    idleTimer = setTimeout(discardWorker, idleTimeoutMs);
    return outcome;
  };

  return {
    run(job, onCodes, options) {
      const result = queue.then(() => runNow(job, onCodes, options));
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
