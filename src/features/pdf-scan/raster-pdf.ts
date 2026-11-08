import type { DecodeOptions, DecodePixels } from '../decode';
import type { DecodedCode } from '../../shared/types';
import type { PdfRuntime } from './render-target';

export const PDF_DPI = 200;
const POINTS_PER_INCH = 72;

export interface PdfScanOptions extends DecodeOptions {
  readonly maxPages: number;
  readonly maxMegapixels: number;
}

export type PdfScanResult =
  | { readonly status: 'done'; readonly scanned: number; readonly total: number }
  | { readonly status: 'error'; readonly reason: 'encrypted-pdf' | 'unreadable' };

// Render scale for a page of the given size in points: PDF_DPI, lowered so the
// render stays within the pixel cap.
export function renderScale(widthPt: number, heightPt: number, maxPixels: number): number {
  const scale = PDF_DPI / POINTS_PER_INCH;
  const pixels = widthPt * scale * heightPt * scale;
  return pixels <= maxPixels ? scale : Math.sqrt(maxPixels / (widthPt * heightPt));
}

// - One decode pass per page at PDF_DPI; codes are reported page by page.
// - Only the first maxPages pages are rendered; the result tells how many
//   pages the document has.
// - Each page's canvas and resources are released before the next page, so
//   memory stays bounded by one rendered page.
export async function scanPdf(
  bytes: ArrayBuffer,
  opts: PdfScanOptions,
  deps: { runtime: PdfRuntime; decode: DecodePixels },
  onPage: (page: number, codes: DecodedCode[]) => void,
): Promise<PdfScanResult> {
  const { pdfjs, documentOptions } = deps.runtime;
  const task = pdfjs.getDocument({ ...documentOptions, data: new Uint8Array(bytes) });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => undefined);
    return { status: 'error', reason: e instanceof pdfjs.PasswordException ? 'encrypted-pdf' : 'unreadable' };
  }
  try {
    const total = doc.numPages;
    const scanned = Math.min(total, opts.maxPages);
    for (let n = 1; n <= scanned; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale(base.width, base.height, opts.maxMegapixels * 1e6) });
      const target = deps.runtime.createRenderTarget(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvasContext: target.context, canvas: null, viewport }).promise;
        onPage(n, await deps.decode(target.pixels(), { formats: opts.formats }));
      } finally {
        target.release();
        page.cleanup();
      }
    }
    return { status: 'done', scanned, total };
  } catch {
    return { status: 'error', reason: 'unreadable' };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
