import { describe, expect, it } from 'vitest';
import { settingsHash } from './settings-hash';

describe('settingsHash', () => {
  it('does not depend on key order', () => {
    expect(settingsHash({ a: 1, b: { c: [1, 2], d: true } })).toBe(settingsHash({ b: { d: true, c: [1, 2] }, a: 1 }));
  });

  it('changes when a value changes', () => {
    expect(settingsHash({ formats: ['QRCode', 'DataMatrix'] })).not.toBe(settingsHash({ formats: ['DataMatrix'] }));
  });
});
