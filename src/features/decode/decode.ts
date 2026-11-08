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

export type DecodePixels = (img: Pixels, opts: DecodeOptions) => Promise<DecodedCode[]>;

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

async function decodePixels(img: Pixels, opts: DecodeOptions): Promise<DecodedCode[]> {
  // An empty format list means "all formats" to zxing.
  if (opts.formats.length === 0) return [];
  const results = await readBarcodes(img as ImageData, toZxingOptions(opts.formats));
  return results.filter(r => r.isValid).map(toDecodedCode).filter(c => c !== null);
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

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
