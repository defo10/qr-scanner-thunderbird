import type * as Pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Pixels } from '../decode';

export type PdfjsLib = typeof Pdfjs;
type DocumentInitParameters = Extract<NonNullable<Parameters<PdfjsLib['getDocument']>[0]>, { data?: unknown }>;
export type DocumentOptions = Omit<DocumentInitParameters, 'data' | 'url'>;

export interface RenderTarget {
  readonly context: CanvasRenderingContext2D;
  pixels(): Pixels;
  release(): void;
}

/** What scanPdf needs from its environment: pdf.js itself and a canvas to render into. */
export interface PdfRuntime {
  readonly pdfjs: PdfjsLib;
  readonly documentOptions: DocumentOptions;
  createRenderTarget(width: number, height: number): RenderTarget;
}

function offscreenTarget(width: number, height: number): RenderTarget {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D context unavailable');
  return {
    context: context as unknown as CanvasRenderingContext2D,
    pixels: () => ({ data: context.getImageData(0, 0, width, height).data, width, height }),
    // Zeroing the size frees the backing store right away instead of at GC.
    release: () => { canvas.width = 0; canvas.height = 0; },
  };
}

// pdf.js creates helper canvases through this factory; its DOM default needs
// a document, which a worker does not have.
class OffscreenCanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (target.canvas) target.canvas.width = target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}

// SVG filters (transfer functions, soft masks) need a DOM; without one they are
// skipped, which changes colors at most, not the geometry codes depend on.
class NoFilterFactory {
  addFilter() { return 'none'; }
  addHCMFilter() { return 'none'; }
  addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; }
  addKnockoutFilter() { return 'none'; }
  addHighlightHCMFilter() { return 'none'; }
  addSelectionHCMFilter() { return 'none'; }
  addSelectionFilter() { return 'none'; }
  createSelectionStyle() { return null; }
  destroy() {}
}

// Runs pdf.js inside the calling worker instead of a nested one: exposing its
// worker module as `globalThis.pdfjsWorker` makes pdf.js use it in-thread.
// - The legacy build is used because it polyfills recent JS APIs that
//   Thunderbird 128's engine lacks.
// - All resources (cmaps, fonts, wasm decoders) come from the extension; with
//   font faces disabled, glyphs are drawn as paths and nothing touches the DOM.
export async function loadBrowserPdfRuntime(extensionBaseUrl: string): Promise<PdfRuntime> {
  const base = `${extensionBaseUrl}pdfjs/`;
  const pdfjs = (await import(`${base}pdf.mjs`)) as PdfjsLib;
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(`${base}pdf.worker.mjs`);
  return {
    pdfjs,
    documentOptions: {
      cMapUrl: `${base}cmaps/`,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      useWorkerFetch: true,
      disableFontFace: true,
      useSystemFonts: false,
      isImageDecoderSupported: false,
      isOffscreenCanvasSupported: true,
      CanvasFactory: OffscreenCanvasFactory,
      FilterFactory: NoFilterFactory,
      verbosity: 0,
    },
    createRenderTarget: offscreenTarget,
  };
}
