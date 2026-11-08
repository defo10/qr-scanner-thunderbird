import type { DecodeOptions, DecodePixels, Pixels } from '../decode';
import type { DecodedCode } from '../../shared/types';

/** Rasterizes an encoded image, downscaled to fit `maxPixels`. */
export type RasterImage = (bytes: ArrayBuffer, mime: string, maxPixels: number) => Promise<Pixels>;

// Keeps the aspect ratio; never upscales.
export function fitWithin(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const k = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)) };
}

// Animated GIFs decode to their first frame.
export const rasterImageInBrowser: RasterImage = async (bytes, mime, maxPixels) => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxPixels);
    if (width !== bitmap.width) console.debug(`downscaled ${bitmap.width}x${bitmap.height} to ${width}x${height}`);
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D context unavailable');
    g.drawImage(bitmap, 0, 0, width, height);
    const { data } = g.getImageData(0, 0, width, height);
    return { data, width, height };
  } finally {
    bitmap.close();
  }
};

// One pass at native resolution (capped). A cheaper low-resolution first pass
// was rejected: zxing gives no sign of a code that is too small to read at the
// lower resolution, so such codes would be missed.
export async function scanImage(
  bytes: ArrayBuffer,
  mime: string,
  opts: DecodeOptions & { readonly maxMegapixels: number },
  deps: { rasterImage: RasterImage; decode: DecodePixels },
): Promise<DecodedCode[]> {
  const pixels = await deps.rasterImage(bytes, mime, opts.maxMegapixels * 1e6);
  return deps.decode(pixels, { formats: opts.formats });
}
