import bwipjs from 'bwip-js/node';
import { PDFDocument, PDFHexString, PDFName, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import { codeFreeScene, renderSymbol, withQuietZone } from './fixture-art';

const A4: [number, number] = [595.28, 841.89];
const MM = 72 / 25.4;

// Fixed metadata keeps the output byte-identical across runs.
async function newDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer('qr-scanner fixtures');
  return doc;
}

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: false });

/** Draws a Data Matrix as vector path; `moduleMm` is the side of one module. */
function drawVectorDm(page: PDFPage, text: string, x: number, yTop: number, moduleMm: number) {
  const svg = bwipjs.toSVG({ bcid: 'datamatrix', text, scale: 1 });
  const d = /<path d="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error('bwip-js returned no path');
  // bwip-js uses 2 SVG units per module at scale 1.
  page.drawSvgPath(d, { x, y: yTop, scale: (moduleMm * MM) / 2, color: rgb(0, 0, 0), borderWidth: 0 });
}

async function addTextPage(doc: PDFDocument, heading: string): Promise<PDFPage> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText(heading, { x: 50, y: 790, size: 18, font });
  for (let i = 0; i < 40; i++) {
    page.drawText(`Line ${i + 1}: Qty 3 x Item ${1000 + i} at 19.99 EUR, total 59.97 EUR, VAT included.`, { x: 50, y: 750 - i * 17, size: 10, font });
  }
  return page;
}

export const pdfFixtures: Record<string, () => Promise<Uint8Array>> = {
  'datamatrix-vector': async () => {
    const doc = await newDocument();
    const page = await addTextPage(doc, 'Shipping label');
    drawVectorDm(page, 'VECTOR-DM-0001', 400, 800, 0.8);
    return save(doc);
  },
  'datamatrix-raster': async () => {
    const doc = await newDocument();
    const page = await addTextPage(doc, 'Prescription');
    const png = await doc.embedPng(withQuietZone(await renderSymbol({ bcid: 'datamatrix', text: 'RASTER-DM-0002' }), 8).toBuffer('image/png'));
    page.drawImage(png, { x: 400, y: 650, width: 30 * MM, height: 30 * MM });
    return save(doc);
  },
  // 0.3 mm modules: about 2.4 px per module at 200 DPI.
  'datamatrix-small': async () => {
    const doc = await newDocument();
    const page = await addTextPage(doc, 'Small label');
    drawVectorDm(page, 'SMALL-PDF-DM', 450, 820, 0.3);
    return save(doc);
  },
  'mixed-3-pages': async () => {
    const doc = await newDocument();
    drawVectorDm(await addTextPage(doc, 'Page one'), 'PAGE-ONE-DM', 400, 800, 0.8);
    await addTextPage(doc, 'Page two, no code');
    drawVectorDm(await addTextPage(doc, 'Page three'), 'PAGE-THREE-DM', 400, 800, 0.8);
    return save(doc);
  },
  'pages-25': async () => {
    const doc = await newDocument();
    for (let i = 1; i <= 25; i++) await addTextPage(doc, `Page ${i} of 25`);
    return save(doc);
  },
  'invoice-10-pages': async () => {
    const doc = await newDocument();
    for (let i = 1; i <= 10; i++) await addTextPage(doc, `Invoice page ${i}`);
    return save(doc);
  },
  // A Standard security handler whose /U entry matches no password: readers
  // must ask for one. The content itself is not encrypted, which is enough for
  // the password check that comes first.
  'encrypted': async () => {
    const doc = await newDocument();
    await addTextPage(doc, 'Secret');
    const { context } = doc;
    const bytes32 = (fill: string) => PDFHexString.of(fill.repeat(64));
    context.trailerInfo.Encrypt = context.register(context.obj({
      Filter: PDFName.of('Standard'), V: 1, R: 2, Length: 40, P: -44, O: bytes32('a'), U: bytes32('b'),
    }));
    context.trailerInfo.ID = context.obj([PDFHexString.of('0'.repeat(32)), PDFHexString.of('0'.repeat(32))]);
    return save(doc);
  },
  'truncated': async () => {
    const full = await pdfFixtures['mixed-3-pages']!();
    return full.slice(0, Math.floor(full.length / 3));
  },
};

export async function photoPdfPage(): Promise<Uint8Array> {
  const doc = await newDocument();
  const page = doc.addPage(A4);
  const jpg = await doc.embedJpg(codeFreeScene(1600, 1200, 5).toBuffer('image/jpeg', 80));
  page.drawImage(jpg, { x: 40, y: 300, width: 515, height: 386 });
  return save(doc);
}
