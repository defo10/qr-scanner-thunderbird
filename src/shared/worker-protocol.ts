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

export type PdfJob = {
  readonly kind: 'pdf';
  readonly bytes: ArrayBuffer;
  readonly decode: JobDecodeOptions;
  /** Each page render is kept within this size. */
  readonly maxMegapixels: number;
  readonly maxPages: number;
};

export type ScanJob = ImageJob | PdfJob;

export interface PageCount {
  readonly scanned: number;
  readonly total: number;
}

export type WorkerRequest =
  | { readonly type: 'init'; readonly wasm: WebAssembly.Module }
  | ({ readonly type: 'scan'; readonly jobId: number } & ScanJob);

export type WorkerResponse =
  | { readonly jobId: number; readonly type: 'codes'; readonly codes: readonly DecodedCode[]; readonly page?: number }
  | { readonly jobId: number; readonly type: 'done'; readonly pages?: PageCount }
  | { readonly jobId: number; readonly type: 'error'; readonly reason: ErrorReason };
