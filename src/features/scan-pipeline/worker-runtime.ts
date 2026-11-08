import { loadDecoder, type DecodePixels } from '../decode';
import { scanImage, type RasterImage } from '../image-scan';
import { scanPdf, type PdfRuntime } from '../pdf-scan';
import type { WorkerRequest, WorkerResponse } from '../../shared/worker-protocol';

export type PostResponse = (response: WorkerResponse) => void;

export interface WorkerRuntimeDeps {
  readonly rasterImage: RasterImage;
  readonly loadPdfRuntime: () => Promise<PdfRuntime>;
}

// Worker-side message handler.
// - Jobs that arrive while the decoder is still being instantiated wait for it.
// - pdf.js is loaded on the first PDF job only, so image-only use never pays
//   for it.
export function createWorkerRuntime(deps: WorkerRuntimeDeps, post: PostResponse): (request: WorkerRequest) => Promise<void> {
  let decoder: Promise<DecodePixels> | undefined;
  let pdfRuntime: Promise<PdfRuntime> | undefined;

  return async request => {
    if (request.type === 'init') {
      decoder = loadDecoder(request.wasm);
      return;
    }
    const { jobId } = request;
    if (!decoder) throw new Error('scan job received before init');
    const decode = await decoder;

    if (request.kind === 'image') {
      try {
        const codes = await scanImage(
          request.bytes,
          request.mime,
          { ...request.decode, maxMegapixels: request.maxMegapixels },
          { rasterImage: deps.rasterImage, decode },
        );
        post({ jobId, type: 'codes', codes });
        post({ jobId, type: 'done' });
      } catch {
        post({ jobId, type: 'error', reason: 'unreadable' });
      }
      return;
    }

    let runtime: PdfRuntime;
    try {
      pdfRuntime ??= deps.loadPdfRuntime();
      runtime = await pdfRuntime;
    } catch {
      pdfRuntime = undefined;
      post({ jobId, type: 'error', reason: 'unreadable' });
      return;
    }
    const result = await scanPdf(
      request.bytes,
      { ...request.decode, maxMegapixels: request.maxMegapixels, maxPages: request.maxPages },
      { runtime, decode },
      (page, codes) => post({ jobId, type: 'codes', codes, page }),
    );
    if (result.status === 'done') post({ jobId, type: 'done', pages: { scanned: result.scanned, total: result.total } });
    else post({ jobId, type: 'error', reason: result.reason });
  };
}
