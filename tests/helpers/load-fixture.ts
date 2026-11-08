import { loadImage, createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDecoder, type DecodePixels, type Pixels } from '../../src/features/decode';
import { fitWithin, type RasterImage } from '../../src/features/image-scan';

// Path-based on purpose: DOM test environments replace the global URL class.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, 'images', name)));
}

/** Node counterpart of the worker's createImageBitmap/OffscreenCanvas rasterizer. */
export const nodeRasterImage: RasterImage = async (bytes, _mime, maxPixels) => {
  const img = await loadImage(Buffer.from(bytes));
  const { width, height } = fitWithin(img.width, img.height, maxPixels);
  const g = createCanvas(width, height).getContext('2d');
  g.drawImage(img, 0, 0, width, height);
  const { data } = g.getImageData(0, 0, width, height);
  return { data, width, height };
};

export async function imageFixture(name: string): Promise<Pixels> {
  const bytes = fixtureBytes(name);
  return nodeRasterImage(bytes.buffer as ArrayBuffer, 'image/png', Infinity);
}

let wasm: Promise<WebAssembly.Module> | undefined;

export function nodeZxingWasm(): Promise<WebAssembly.Module> {
  wasm ??= readFile(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
    .then(bytes => WebAssembly.compile(bytes));
  return wasm;
}

let decoder: Promise<DecodePixels> | undefined;

export function nodeDecoder(): Promise<DecodePixels> {
  decoder ??= nodeZxingWasm().then(loadDecoder);
  return decoder;
}
