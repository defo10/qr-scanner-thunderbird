import type { ReaderOptions, ReadInputBarcodeFormat, ReadResult } from 'zxing-wasm/reader';
import type { CodeFormat } from '../../shared/types';

// zxing's symbology-wide "QRCode" also matches Micro QR and rMQR, so the QR
// toggle maps to the two model variants only.
const ZXING_FORMATS: Record<CodeFormat, ReadInputBarcodeFormat[]> = {
  DataMatrix: ['DataMatrix'],
  QRCode: ['QRCodeModel1', 'QRCodeModel2'],
  MicroQRCode: ['MicroQRCode'],
  rMQRCode: ['RMQRCode'],
  Aztec: ['Aztec'],
  PDF417: ['PDF417'],
};

// Plain text mode keeps control characters (GS1 separator \x1D, ISO 15434
// record separators) in `text`.
export function toZxingOptions(formats: readonly CodeFormat[]): ReaderOptions {
  return {
    formats: formats.flatMap(f => ZXING_FORMATS[f]),
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 255,
    textMode: 'Plain',
  };
}

export function toCodeFormat(r: Pick<ReadResult, 'format' | 'symbology'>): CodeFormat | null {
  switch (r.symbology) {
    case 'DataMatrix':
    case 'Aztec':
    case 'PDF417':
      return r.symbology;
    case 'QRCode':
      if (r.format === 'MicroQRCode') return 'MicroQRCode';
      if (r.format === 'RMQRCode') return 'rMQRCode';
      return 'QRCode';
    default:
      return null;
  }
}
