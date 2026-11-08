import { loadImage, createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadDecoder, type DecodePixels, type Pixels } from '../../src/features/decode';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));

export async function imageFixture(name: string): Promise<Pixels> {
  const img = await loadImage(await readFile(`${fixturesDir}images/${name}`));
  const g = createCanvas(img.width, img.height).getContext('2d');
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, img.width, img.height);
  return { data, width, height };
}

let decoder: Promise<DecodePixels> | undefined;

export function nodeDecoder(): Promise<DecodePixels> {
  decoder ??= readFile(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
    .then(bytes => WebAssembly.compile(bytes))
    .then(loadDecoder);
  return decoder;
}
