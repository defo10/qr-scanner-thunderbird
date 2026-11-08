import type { CodeFormat, DecodedCode, ErrorReason } from './types';

export interface JobDecodeOptions {
  readonly formats: readonly CodeFormat[];
}

export type ImageJob = {
  readonly kind: 'image';
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly decode: JobDecodeOptions;
  /** Larger images are downscaled to this size before decoding. */
  readonly maxMegapixels: number;
};

export type WorkerRequest =
  | { readonly type: 'init'; readonly wasm: WebAssembly.Module }
  | ({ readonly type: 'scan'; readonly jobId: number } & ImageJob);

export type WorkerResponse =
  | { readonly jobId: number; readonly type: 'codes'; readonly codes: readonly DecodedCode[]; readonly page?: number }
  | { readonly jobId: number; readonly type: 'done' }
  | { readonly jobId: number; readonly type: 'error'; readonly reason: ErrorReason };
