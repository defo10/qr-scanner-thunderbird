import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import type { CodeFormat, DecodedCode } from '../../shared/types';
import { toCodeFormat, toZxingOptions } from './zxing-options';

export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface DecodeOptions {
  readonly formats: readonly CodeFormat[];
}

export interface DecodeResult {
  readonly codes: DecodedCode[];
  // Symbols the detector located but could not decode (e.g. checksum errors).
  // Symbols too blurry or too small to be located at all are not counted, so
  // zero candidates does not prove the absence of a code.
  readonly candidates: number;
}

export type DecodePixels = (img: Pixels, opts: DecodeOptions) => Promise<DecodeResult>;

// - zxing-wasm keeps one module per realm; preparing it here replaces its
//   default loader, which would fetch the .wasm from a public CDN.
// - Taking an already compiled module lets callers compile once and reuse it
//   across workers, paying only for instantiation.
export async function loadDecoder(wasm: WebAssembly.Module): Promise<DecodePixels> {
  await prepareZXingModule({
    overrides: {
      instantiateWasm(imports: WebAssembly.Imports, receiveInstance: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
        void WebAssembly.instantiate(wasm, imports).then(instance => receiveInstance(instance, wasm));
        return {};
      },
    },
    fireImmediately: true,
  });
  return decodePixels;
}

async function decodePixels(img: Pixels, opts: DecodeOptions): Promise<DecodeResult> {
  // An empty format list means "all formats" to zxing.
  if (opts.formats.length === 0) return { codes: [], candidates: 0 };
  const results = await readBarcodes(img as ImageData, toZxingOptions(opts.formats));
  const codes = results.filter(r => r.isValid).map(toDecodedCode).filter(c => c !== null);
  const candidates = results.filter(r => !r.isValid && hasPosition(r)).length;
  return { codes, candidates };
}

function toDecodedCode(r: ReadResult): DecodedCode | null {
  const format = toCodeFormat(r);
  if (format === null) return null;
  return {
    format,
    text: r.text,
    bytesB64: toBase64(r.bytes),
    contentKind: r.contentType,
    symbologyId: r.symbologyIdentifier,
  };
}

function hasPosition({ position: p }: ReadResult): boolean {
  return [p.topLeft, p.topRight, p.bottomLeft, p.bottomRight].some(pt => pt.x !== 0 || pt.y !== 0);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
