import type { ReaderOptions, ReadInputBarcodeFormat, ReadResult } from 'zxing-wasm/reader';
import type { CodeFormat } from '../../shared/types';

export const ALL_CODE_FORMATS: readonly CodeFormat[] = ['DataMatrix', 'QRCode', 'MicroQRCode', 'rMQRCode', 'Aztec', 'PDF417'];

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

// - returnErrors makes zxing also report symbols it located but could not
//   decode; callers use their count to decide whether a costlier pass is worth it.
// - Plain text mode keeps control characters (GS1 separator \x1D, ISO 15434
//   record separators) in `text`.
export function toZxingOptions(formats: readonly CodeFormat[]): ReaderOptions {
  return {
    formats: formats.flatMap(f => ZXING_FORMATS[f]),
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: 255,
    textMode: 'Plain',
    returnErrors: true,
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
