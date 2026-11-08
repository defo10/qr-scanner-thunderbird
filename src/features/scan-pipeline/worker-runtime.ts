import { loadDecoder, type DecodePixels } from '../decode';
import { scanImage, type RasterImage } from '../image-scan';
import type { WorkerRequest, WorkerResponse } from '../../shared/worker-protocol';

export type PostResponse = (response: WorkerResponse) => void;

// Worker-side message handler. Jobs that arrive while the decoder is still
// being instantiated wait for it.
export function createWorkerRuntime(deps: { rasterImage: RasterImage }, post: PostResponse): (request: WorkerRequest) => Promise<void> {
  let decoder: Promise<DecodePixels> | undefined;

  return async request => {
    if (request.type === 'init') {
      decoder = loadDecoder(request.wasm);
      return;
    }
    const { jobId } = request;
    if (!decoder) throw new Error('scan job received before init');
    const decode = await decoder;
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
  };
}
