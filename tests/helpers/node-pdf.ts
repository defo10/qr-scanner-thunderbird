import { createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PdfRuntime, RenderTarget } from '../../src/features/pdf-scan';

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pdf');

export function pdfFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

function canvasTarget(width: number, height: number): RenderTarget {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  return {
    context: context as unknown as CanvasRenderingContext2D,
    pixels: () => ({ data: context.getImageData(0, 0, width, height).data, width, height }),
    release: () => { canvas.width = 0; canvas.height = 0; },
  };
}

let runtime: Promise<PdfRuntime> | undefined;

/** The legacy pdf.js build, run in-thread like in the extension's worker, rendering onto @napi-rs/canvas. */
export function nodePdfRuntime(): Promise<PdfRuntime> {
  runtime ??= (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    return {
      pdfjs,
      documentOptions: {
        cMapUrl: `${join(pdfjsRoot, 'cmaps')}/`,
        standardFontDataUrl: `${join(pdfjsRoot, 'standard_fonts')}/`,
        wasmUrl: `${join(pdfjsRoot, 'wasm')}/`,
        iccUrl: `${join(pdfjsRoot, 'iccs')}/`,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
      },
      createRenderTarget: canvasTarget,
    };
  })();
  return runtime;
}

/** Wraps a runtime to record the size of every page render. */
export function recordingRenders(base: PdfRuntime): { runtime: PdfRuntime; renders: { width: number; height: number }[] } {
  const renders: { width: number; height: number }[] = [];
  return {
    renders,
    runtime: {
      ...base,
      createRenderTarget: (width, height) => {
        renders.push({ width, height });
        return base.createRenderTarget(width, height);
      },
    },
  };
}
