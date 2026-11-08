import type { Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { codeFreeScene, placeAt, renderSymbol, withQuietZone } from '../../../scripts/lib/fixture-art';
import { fixtureBytes, nodeDecoder, nodeRasterImage } from '../../../tests/helpers/load-fixture';
import type { DecodePixels } from '../decode';
import { CODE_FORMATS } from '../settings';
import { fitWithin, scanImage } from './raster-image';

const pngBytes = (c: Canvas) => new Uint8Array(c.toBuffer('image/png')).buffer;

/** The real decoder, recording the size of every image it is given. */
async function recordingDecoder() {
  const decode = await nodeDecoder();
  const calls: { width: number; height: number }[] = [];
  const recording: DecodePixels = (img, opts) => {
    calls.push({ width: img.width, height: img.height });
    return decode(img, opts);
  };
  return { decode: recording, calls };
}

describe('scanImage', () => {
  it('downscales an image above the megapixel cap to the cap and still decodes it', async () => {
    const { decode, calls } = await recordingDecoder();
    const bytes = fixtureBytes('datamatrix-plain.png').slice().buffer;

    const codes = await scanImage(bytes, 'image/png', { formats: CODE_FORMATS, maxMegapixels: 0.02 }, { rasterImage: nodeRasterImage, decode });

    expect(codes.map(c => c.text)).toEqual(['HELLO-DATAMATRIX-123']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.width * calls[0]!.height).toBeLessThanOrEqual(20_000);
  });

  it('decodes a code-free 12 MP image exactly once, at native resolution', async () => {
    const { decode, calls } = await recordingDecoder();

    const codes = await scanImage(pngBytes(codeFreeScene(4000, 3000, 2)), 'image/png', { formats: CODE_FORMATS, maxMegapixels: 40 }, { rasterImage: nodeRasterImage, decode });

    expect(codes).toEqual([]);
    expect(calls).toEqual([{ width: 4000, height: 3000 }]);
  });

  it('finds a Data Matrix in a 12 MP image that is too small to read at 4 MP', async () => {
    const { decode } = await recordingDecoder();
    const scene = codeFreeScene(4000, 3000, 9);
    placeAt(scene, withQuietZone(await renderSymbol({ bcid: 'datamatrix', text: 'SMALL-LABEL-0042', scale: 1 }), 6), 1900, 1400);

    const codes = await scanImage(pngBytes(scene), 'image/png', { formats: CODE_FORMATS, maxMegapixels: 40 }, { rasterImage: nodeRasterImage, decode });

    expect(codes.map(c => c.text)).toEqual(['SMALL-LABEL-0042']);
  });
});

describe('fitWithin', () => {
  it('keeps images within the cap unchanged', () => {
    expect(fitWithin(4000, 3000, 40e6)).toEqual({ width: 4000, height: 3000 });
  });

  it('scales a 60 MP image down to at most 40 MP, keeping the aspect ratio', () => {
    const { width, height } = fitWithin(9000, 6667, 40e6);

    expect(width * height).toBeLessThanOrEqual(40e6);
    expect(width / height).toBeCloseTo(9000 / 6667, 2);
  });
});
