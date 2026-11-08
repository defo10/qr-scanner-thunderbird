import { describe, expect, it } from 'vitest';
import { nodeDecoder } from '../../../tests/helpers/load-fixture';
import { nodePdfRuntime, pdfFixture, recordingRenders } from '../../../tests/helpers/node-pdf';
import { CODE_FORMATS } from '../settings';
import { renderScale, scanPdf } from './raster-pdf';

const a4At200Dpi = { width: 1654, height: 2339 };
const defaults = { formats: CODE_FORMATS, maxPages: 20, maxMegapixels: 40 };

async function scan(fixture: string, options = defaults) {
  const decode = await nodeDecoder();
  const { runtime, renders } = recordingRenders(await nodePdfRuntime());
  const pages: { page: number; texts: string[] }[] = [];
  const result = await scanPdf(pdfFixture(fixture).slice().buffer, options, { runtime, decode }, (page, codes) => {
    pages.push({ page, texts: codes.map(c => c.text) });
  });
  return { result, pages, renders };
}

describe('scanPdf', () => {
  it('decodes a Data Matrix drawn as vector graphics', async () => {
    const { result, pages } = await scan('datamatrix-vector.pdf');

    expect(result).toEqual({ status: 'done', scanned: 1, total: 1 });
    expect(pages).toEqual([{ page: 1, texts: ['VECTOR-DM-0001'] }]);
  });

  it('decodes a Data Matrix embedded as an image', async () => {
    const { pages } = await scan('datamatrix-raster.pdf');

    expect(pages).toEqual([{ page: 1, texts: ['RASTER-DM-0002'] }]);
  });

  it('finds a small Data Matrix in the single 200 DPI pass', async () => {
    const { pages, renders } = await scan('datamatrix-small.pdf');

    expect(pages).toEqual([{ page: 1, texts: ['SMALL-PDF-DM'] }]);
    expect(renders).toEqual([a4At200Dpi]);
  });

  it('reports codes page by page', async () => {
    const { pages } = await scan('mixed-3-pages.pdf');

    expect(pages).toEqual([
      { page: 1, texts: ['PAGE-ONE-DM'] },
      { page: 2, texts: [] },
      { page: 3, texts: ['PAGE-THREE-DM'] },
    ]);
  });

  it('renders a code-free 10-page invoice exactly once per page, at 200 DPI', async () => {
    const { result, renders } = await scan('invoice-10-pages.pdf');

    expect(result).toEqual({ status: 'done', scanned: 10, total: 10 });
    expect(renders).toEqual(Array.from({ length: 10 }, () => a4At200Dpi));
  });

  it('renders only the first pages up to the page limit', async () => {
    const { result, renders } = await scan('pages-25.pdf');

    expect(result).toEqual({ status: 'done', scanned: 20, total: 25 });
    expect(renders).toHaveLength(20);
  });

  it('keeps every page render within the megapixel cap', async () => {
    const { renders } = await scan('datamatrix-vector.pdf', { ...defaults, maxMegapixels: 1 });

    expect(renders[0]!.width * renders[0]!.height).toBeLessThanOrEqual(1_000_000 + renders[0]!.width + renders[0]!.height);
  });

  it('reports a password-protected PDF as encrypted', async () => {
    const { result, renders } = await scan('encrypted.pdf');

    expect(result).toEqual({ status: 'error', reason: 'encrypted-pdf' });
    expect(renders).toEqual([]);
  });

  it('reports a truncated PDF as unreadable', async () => {
    const { result } = await scan('truncated.pdf');

    expect(result).toEqual({ status: 'error', reason: 'unreadable' });
  });
});

describe('renderScale', () => {
  it('renders at 200 DPI when the page fits the cap', () => {
    expect(renderScale(595.28, 841.89, 40e6)).toBeCloseTo(200 / 72);
  });

  it('lowers the resolution so the page fits the cap', () => {
    const scale = renderScale(595.28, 841.89, 1e6);

    expect(595.28 * scale * 841.89 * scale).toBeCloseTo(1e6);
  });
});
