import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { loadDecoder, type Pixels } from '../src/features/decode';
import { CODE_FORMATS as ALL_CODE_FORMATS } from '../src/features/settings';
import { codeFreeScene, photoLike, placeAt, renderSymbol, textPage } from './lib/fixture-art';

const RUNS = Number(process.env.BENCH_RUNS ?? 7);

function pixels(c: Canvas): Pixels {
  const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  return { data, width, height };
}

function scaledToMegapixels(c: Canvas, mp: number): Canvas {
  const k = Math.min(1, Math.sqrt((mp * 1e6) / (c.width * c.height)));
  const out = createCanvas(Math.round(c.width * k), Math.round(c.height * k));
  out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
  return out;
}

async function fixture(name: string): Promise<Canvas> {
  const img = await loadImage(await readFile(`tests/fixtures/images/${name}`));
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

async function photoWithCode(): Promise<Canvas> {
  const scene = codeFreeScene(4000, 3000, 3);
  const label = photoLike(await renderSymbol({ bcid: 'datamatrix', text: 'BENCH-PHOTO-DM', scale: 8 }), 5);
  return placeAt(scene, label, 2100, 1300);
}

const photo12 = codeFreeScene(4000, 3000, 2);
const photo12WithCode = await photoWithCode();
const cases: [string, Canvas][] = [
  ['code-free 12 MP photo-like', photo12],
  ['code-free 12 MP photo-like @ 4 MP', scaledToMegapixels(photo12, 4)],
  ['code-free 4 MP screenshot', textPage(2560, 1600)],
  ['code-free small logo', codeFreeScene(200, 200, 4)],
  ['DM in 12 MP photo', photo12WithCode],
  ['DM in 12 MP photo @ 4 MP', scaledToMegapixels(photo12WithCode, 4)],
  ['datamatrix-plain.png', await fixture('datamatrix-plain.png')],
  ['datamatrix-gs1.png', await fixture('datamatrix-gs1.png')],
  ['datamatrix-photo.png', await fixture('datamatrix-photo.png')],
  ['datamatrix-multiple.png', await fixture('datamatrix-multiple.png')],
  ['qr-url.png', await fixture('qr-url.png')],
];

const wasm = await WebAssembly.compile(await readFile('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
const decode = await loadDecoder(wasm);
const opts = { formats: ALL_CODE_FORMATS };

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? NaN;

console.log(`runs per case: ${RUNS}\n`);
console.log(['case'.padEnd(36), 'size'.padStart(11), 'median ms'.padStart(10), 'p95 ms'.padStart(8), 'codes'.padStart(6)].join(' '));
for (const [name, canvas] of cases) {
  const img = pixels(canvas);
  const times: number[] = [];
  let codes = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    codes = (await decode(img, opts)).length;
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log([
    name.padEnd(36),
    `${img.width}x${img.height}`.padStart(11),
    quantile(times, 0.5).toFixed(1).padStart(10),
    quantile(times, 0.95).toFixed(1).padStart(8),
    String(codes).padStart(6),
  ].join(' '));
}

const { nodePdfRuntime, pdfFixture, recordingRenders } = await import('../tests/helpers/node-pdf');
const { scanPdf } = await import('../src/features/pdf-scan');

console.log(`\n${'pdf'.padEnd(24)} ${'pages'.padStart(5)} ${'median ms/page'.padStart(15)} ${'p95 ms/page'.padStart(12)} ${'peak canvas'.padStart(12)} ${'codes'.padStart(6)}`);
for (const name of ['invoice-10-pages.pdf', 'mixed-3-pages.pdf', 'datamatrix-small.pdf']) {
  const perPage: number[] = [];
  let peak = 0;
  let pages = 0;
  let found = 0;
  for (let i = 0; i < RUNS; i++) {
    const { runtime, renders } = recordingRenders(await nodePdfRuntime());
    found = 0;
    const t0 = performance.now();
    const result = await scanPdf(pdfFixture(name).slice().buffer, { ...opts, maxPages: 20, maxMegapixels: 40 }, { runtime, decode }, (_, codes) => { found += codes.length; });
    pages = result.status === 'done' ? result.scanned : 0;
    perPage.push((performance.now() - t0) / Math.max(1, pages));
    peak = Math.max(peak, ...renders.map(r => r.width * r.height));
  }
  perPage.sort((a, b) => a - b);
  console.log([
    name.padEnd(24),
    String(pages).padStart(5),
    quantile(perPage, 0.5).toFixed(1).padStart(15),
    quantile(perPage, 0.95).toFixed(1).padStart(12),
    `${(peak / 1e6).toFixed(1)} MP`.padStart(12),
    String(found).padStart(6),
  ].join(' '));
}
