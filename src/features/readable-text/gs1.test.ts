import { describe, expect, it } from 'vitest';
import { toHri } from './gs1';

describe('toHri', () => {
  it('brackets a pharma element string with fixed and variable fields', () => {
    expect(toHri('01040123456789011725123110ABC123\x1D21XYZ789'))
      .toBe('(01)04012345678901(17)251231(10)ABC123(21)XYZ789');
  });

  it('ends a variable-length field at the end of the string without a trailing separator', () => {
    expect(toHri('0104012345678901' + '10LOT-7')).toBe('(01)04012345678901(10)LOT-7');
  });

  it('reads four-digit trade measure AIs', () => {
    expect(toHri('0104012345678901' + '3103000750')).toBe('(01)04012345678901(3103)000750');
  });

  it('tolerates a leading separator and a separator after a fixed-length field', () => {
    expect(toHri('\x1D0104012345678901\x1D17251231')).toBe('(01)04012345678901(17)251231');
  });

  it('returns null for an unknown AI', () => {
    expect(toHri('0104012345678901' + '23ABC')).toBeNull();
  });

  it('returns null when a fixed-length field is cut short', () => {
    expect(toHri('01040123')).toBeNull();
  });

  it('returns null when a variable-length field exceeds its maximum', () => {
    expect(toHri('10' + 'X'.repeat(21))).toBeNull();
  });
});
