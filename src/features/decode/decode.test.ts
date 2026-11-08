import { describe, expect, it } from 'vitest';
import { imageFixture, nodeDecoder } from '../../../tests/helpers/load-fixture';
import { CODE_FORMATS as ALL_CODE_FORMATS } from '../settings';

const allFormats = { formats: ALL_CODE_FORMATS };

describe('decodePixels', () => {
  it.each([
    ['datamatrix-plain.png', 'DataMatrix', 'HELLO-DATAMATRIX-123', 'Text'],
    ['datamatrix-small.png', 'DataMatrix', 'AB12', 'Text'],
    ['datamatrix-rotated-30.png', 'DataMatrix', 'ROTATED-30', 'Text'],
    ['datamatrix-inverted.png', 'DataMatrix', 'INVERTED-DM', 'Text'],
    ['datamatrix-photo.png', 'DataMatrix', 'PHOTO-LABEL-0815', 'Text'],
    ['qr-url.png', 'QRCode', 'https://evil.example/login?next=%2F', 'Text'],
    ['microqr.png', 'MicroQRCode', '12345', 'Text'],
    ['rmqr.png', 'rMQRCode', 'RMQR-42', 'Text'],
    ['aztec.png', 'Aztec', 'AZTEC-TICKET-7', 'Text'],
    ['pdf417.png', 'PDF417', 'PDF417-BOARDING-PASS', 'Text'],
  ])('decodes %s as %s', async (fixture, format, text, contentKind) => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture(fixture), allFormats);

    expect(codes).toEqual([expect.objectContaining({ format, text, contentKind })]);
  });

  it('keeps the GS1 separator in the raw text of a GS1 Data Matrix', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('datamatrix-gs1.png'), allFormats);

    expect(codes).toEqual([expect.objectContaining({
      format: 'DataMatrix',
      text: '01040123456789011725123110ABC123\x1D21XYZ789',
      contentKind: 'GS1',
      symbologyId: ']d2',
    })]);
  });

  it('reports a binary payload with its exact bytes', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('datamatrix-binary.png'), allFormats);

    expect(codes).toHaveLength(1);
    expect(codes[0]?.contentKind).toBe('Binary');
    expect(Buffer.from(codes[0]?.bytesB64 ?? '', 'base64')).toEqual(Buffer.from([0x00, 0x01, 0xff, 0x80, 0xc8, 0x61, 0x62, 0x63]));
  });

  it('finds every code when an image contains several', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('datamatrix-multiple.png'), allFormats);

    expect(codes.map(c => c.text).sort()).toEqual(['MULTI-A', 'MULTI-B', 'MULTI-C']);
  });

  it('finds nothing in an image without a code', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('no-code.png'), allFormats);

    expect(codes).toEqual([]);
  });

  it('does not report codes of disabled formats', async () => {
    const decode = await nodeDecoder();

    const qrOnlyImage = await imageFixture('qr-url.png');
    const codes = await decode(qrOnlyImage, { formats: ['DataMatrix', 'MicroQRCode'] });

    expect(codes).toEqual([]);
  });

  it('does not report Micro QR codes when only regular QR is enabled', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('microqr.png'), { formats: ['QRCode'] });

    expect(codes).toEqual([]);
  });

  it('reports nothing when no format is enabled', async () => {
    const decode = await nodeDecoder();

    const codes = await decode(await imageFixture('datamatrix-plain.png'), { formats: [] });

    expect(codes).toEqual([]);
  });
});
