import { describe, expect, it } from 'vitest';
import { loadSettings } from './load-settings';
import { DEFAULT_SETTINGS, normalizeSettings } from './schema';

const storeWith = (value: unknown) => ({ get: (key: string) => Promise.resolve(key === 'settings' ? value : undefined) });

describe('settings', () => {
  it('uses the defaults when nothing is stored', async () => {
    expect(await loadSettings(storeWith(undefined))).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range stored limits', async () => {
    const settings = await loadSettings(storeWith({ maxAttachmentMB: 0, maxImageMegapixels: 1000, maxPdfPages: -3, perAttachmentTimeoutSec: 4.6 }));

    expect(settings).toMatchObject({ maxAttachmentMB: 1, maxImageMegapixels: 200, maxPdfPages: 1, perAttachmentTimeoutSec: 5 });
  });

  it('falls back to defaults for values of the wrong type', () => {
    expect(normalizeSettings({ maxAttachmentMB: '20', scanInlineImages: 'yes', formats: 'QRCode' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps known formats in canonical order and drops unknown ones', () => {
    expect(normalizeSettings({ formats: ['QRCode', 'EAN13', 'DataMatrix'] }).formats).toEqual(['DataMatrix', 'QRCode']);
  });

  it('enables all formats instead of none', () => {
    expect(normalizeSettings({ formats: [] }).formats).toEqual(DEFAULT_SETTINGS.formats);
  });
});
