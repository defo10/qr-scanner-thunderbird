import { loadImage, createCanvas } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadDecoder, type DecodePixels, type Pixels } from '../../src/features/decode';
import type { RasterImage } from '../../src/features/image-scan';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`${fixturesDir}images/${name}`));
}

export const nodeRasterImage: RasterImage = async bytes => {
  const img = await loadImage(Buffer.from(bytes));
  const g = createCanvas(img.width, img.height).getContext('2d');
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, img.width, img.height);
  return { data, width, height };
};

export async function imageFixture(name: string): Promise<Pixels> {
  const bytes = fixtureBytes(name);
  return nodeRasterImage(bytes.buffer as ArrayBuffer, 'image/png');
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
