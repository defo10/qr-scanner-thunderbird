import type { DecodeOptions, DecodePixels, Pixels } from '../decode';
import type { DecodedCode } from '../../shared/types';

export type RasterImage = (bytes: ArrayBuffer, mime: string) => Promise<Pixels>;

// Animated GIFs decode to their first frame.
export const rasterImageInBrowser: RasterImage = async (bytes, mime) => {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D context unavailable');
    g.drawImage(bitmap, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data, width, height };
  } finally {
    bitmap.close();
  }
};

export async function scanImage(
  bytes: ArrayBuffer,
  mime: string,
  opts: DecodeOptions,
  deps: { rasterImage: RasterImage; decode: DecodePixels },
): Promise<DecodedCode[]> {
  const pixels = await deps.rasterImage(bytes, mime);
  return (await deps.decode(pixels, opts)).codes;
}
