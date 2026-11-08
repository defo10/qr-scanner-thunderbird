import { mkdir, writeFile } from 'node:fs/promises';
import type { Canvas } from '@napi-rs/canvas';
import {
  blankCanvas, codeFreeScene, inverted, photoLike, placeAt, renderSymbol, rotated, withQuietZone,
} from './lib/fixture-art';

import { pdfFixtures } from './lib/pdf-fixtures';

const OUT = 'tests/fixtures/images';
const PDF_OUT = 'tests/fixtures/pdf';

const dm = (text: string, scale = 4) => renderSymbol({ bcid: 'datamatrix', text, scale });

async function multiple(): Promise<Canvas> {
  const { canvas } = blankCanvas(720, 300);
  placeAt(canvas, withQuietZone(await dm('MULTI-A'), 10), 20, 40);
  placeAt(canvas, withQuietZone(await dm('MULTI-B'), 10), 260, 80);
  placeAt(canvas, withQuietZone(await dm('MULTI-C'), 10), 500, 40);
  return canvas;
}

const fixtures: Record<string, () => Promise<Canvas>> = {
  'datamatrix-plain': async () => withQuietZone(await dm('HELLO-DATAMATRIX-123'), 20),
  'datamatrix-gs1': async () => withQuietZone(
    await renderSymbol({ bcid: 'gs1datamatrix', text: '(01)04012345678901(17)251231(10)ABC123(21)XYZ789' }), 20),
  // 10x10 modules at 2 px per module.
  'datamatrix-small': async () => withQuietZone(await dm('AB12', 1), 8),
  'datamatrix-rotated-30': async () => rotated(await dm('ROTATED-30'), 30),
  'datamatrix-multiple': multiple,
  'datamatrix-inverted': async () => inverted(await dm('INVERTED-DM')),
  'datamatrix-binary': async () => withQuietZone(
    await renderSymbol({ bcid: 'datamatrix', text: '^000^001^255^128^200abc', parse: true }), 20),
  'datamatrix-photo': async () => photoLike(await dm('PHOTO-LABEL-0815', 5), 42),
  'qr-url': async () => withQuietZone(await renderSymbol({ bcid: 'qrcode', text: 'https://evil.example/login?next=%2F' }), 20),
  'microqr': async () => withQuietZone(await renderSymbol({ bcid: 'microqrcode', text: '12345' }), 20),
  'rmqr': async () => withQuietZone(await renderSymbol({ bcid: 'rectangularmicroqrcode', text: 'RMQR-42', version: 'R11x43' }), 20),
  'aztec': async () => withQuietZone(await renderSymbol({ bcid: 'azteccode', text: 'AZTEC-TICKET-7' }), 20),
  'pdf417': async () => withQuietZone(await renderSymbol({ bcid: 'pdf417', text: 'PDF417-BOARDING-PASS', scale: 2 }), 20),
  'no-code': () => Promise.resolve(codeFreeScene(800, 600, 1)),
};

await mkdir(OUT, { recursive: true });
for (const [name, make] of Object.entries(fixtures)) {
  const canvas = await make();
  await writeFile(`${OUT}/${name}.png`, canvas.toBuffer('image/png'));
  console.log(`${name}.png ${canvas.width}x${canvas.height}`);
}

await mkdir(PDF_OUT, { recursive: true });
for (const [name, make] of Object.entries(pdfFixtures)) {
  const bytes = await make();
  await writeFile(`${PDF_OUT}/${name}.pdf`, bytes);
  console.log(`${name}.pdf ${bytes.length} bytes`);
}
