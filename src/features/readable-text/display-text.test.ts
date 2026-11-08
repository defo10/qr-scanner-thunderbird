import { describe, expect, it } from 'vitest';
import { aDecodedCode } from '../../../tests/helpers/builders';
import { imageFixture, nodeDecoder } from '../../../tests/helpers/load-fixture';
import { ALL_CODE_FORMATS } from '../decode';
import { toDisplay } from './display-text';

describe('toDisplay', () => {
  it('shows GS1 as bracketed HRI while Copy keeps the raw string', () => {
    const raw = '01040123456789011725123110ABC123\x1D21XYZ789';

    const display = toDisplay(aDecodedCode({ text: raw, contentKind: 'GS1', symbologyId: ']d2' }));

    expect(display).toEqual({
      kind: 'gs1',
      text: '(01)04012345678901(17)251231(10)ABC123(21)XYZ789',
      copy: raw,
      hri: '(01)04012345678901(17)251231(10)ABC123(21)XYZ789',
    });
  });

  it('treats a GS1 symbology identifier as GS1 even without a GS1 content kind', () => {
    const display = toDisplay(aDecodedCode({ text: '0104012345678901', contentKind: 'Text', symbologyId: ']Q3' }));

    expect(display.hri).toBe('(01)04012345678901');
  });

  it('falls back to control pictures when a GS1 string cannot be parsed', () => {
    const display = toDisplay(aDecodedCode({ text: '23ABC\x1D99X', contentKind: 'GS1', symbologyId: ']d2' }));

    expect(display).toEqual({ kind: 'gs1', text: '23ABC␝99X', copy: '23ABC\x1D99X', hri: null });
  });

  it('displays and copies the binary fixture as the same Base64 string', async () => {
    const decode = await nodeDecoder();
    const { codes: [binary] } = await decode(await imageFixture('datamatrix-binary.png'), { formats: ALL_CODE_FORMATS });

    const display = toDisplay(binary!);

    expect(display.kind).toBe('binary');
    expect(display.text).toBe('AAH/gMhhYmM=');
    expect(display.copy).toBe('AAH/gMhhYmM=');
  });

  it('shows ISO 15434 separators as control pictures while Copy yields the raw characters', () => {
    const raw = '[)>\x1E06\x1DP12345\x1DQ10\x1E\x04';

    const display = toDisplay(aDecodedCode({ text: raw, contentKind: 'ISO15434', symbologyId: ']d1' }));

    expect(display.text).toBe('[)>␞06␝P12345␝Q10␞␄');
    expect(display.copy).toBe(raw);
  });

  it('keeps line breaks of multi-line text readable', () => {
    const display = toDisplay(aDecodedCode({ text: 'BEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD' }));

    expect(display.text).toBe('BEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD');
  });

  it('marks http(s) text as a URL', () => {
    expect(toDisplay(aDecodedCode({ text: 'https://example.org/' })).kind).toBe('url');
  });
});
