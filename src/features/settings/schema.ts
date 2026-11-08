import type { CodeFormat } from '../../shared/types';

export const CODE_FORMATS: readonly CodeFormat[] = ['DataMatrix', 'QRCode', 'MicroQRCode', 'rMQRCode', 'Aztec', 'PDF417'];

export interface Settings {
  readonly formats: readonly CodeFormat[];
  readonly scanInlineImages: boolean;
  readonly scanPdfs: boolean;
  readonly maxAttachmentMB: number;
  readonly maxImageMegapixels: number;
  readonly maxPdfPages: number;
  readonly perAttachmentTimeoutSec: number;
}

export type NumericSetting = 'maxAttachmentMB' | 'maxImageMegapixels' | 'maxPdfPages' | 'perAttachmentTimeoutSec';

export const NUMERIC_RANGES: Readonly<Record<NumericSetting, { readonly min: number; readonly max: number }>> = {
  maxAttachmentMB: { min: 1, max: 100 },
  maxImageMegapixels: { min: 5, max: 200 },
  maxPdfPages: { min: 1, max: 200 },
  perAttachmentTimeoutSec: { min: 5, max: 300 },
};

export const DEFAULT_SETTINGS: Settings = {
  formats: CODE_FORMATS,
  scanInlineImages: true,
  scanPdfs: true,
  maxAttachmentMB: 10,
  maxImageMegapixels: 40,
  maxPdfPages: 20,
  perAttachmentTimeoutSec: 30,
};

// Stored settings are untrusted input (older versions, manual edits): unknown
// keys are dropped, wrong types fall back to defaults and numbers are clamped
// to their range. An empty format list means the defaults, since scanning for
// nothing is never what a user wants.
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const formats = Array.isArray(r.formats) ? CODE_FORMATS.filter(f => (r.formats as unknown[]).includes(f)) : [];
  return {
    formats: formats.length > 0 ? formats : DEFAULT_SETTINGS.formats,
    scanInlineImages: typeof r.scanInlineImages === 'boolean' ? r.scanInlineImages : DEFAULT_SETTINGS.scanInlineImages,
    scanPdfs: typeof r.scanPdfs === 'boolean' ? r.scanPdfs : DEFAULT_SETTINGS.scanPdfs,
    maxAttachmentMB: clampSetting('maxAttachmentMB', r.maxAttachmentMB),
    maxImageMegapixels: clampSetting('maxImageMegapixels', r.maxImageMegapixels),
    maxPdfPages: clampSetting('maxPdfPages', r.maxPdfPages),
    perAttachmentTimeoutSec: clampSetting('perAttachmentTimeoutSec', r.perAttachmentTimeoutSec),
  };
}

export function clampSetting(key: NumericSetting, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  const { min, max } = NUMERIC_RANGES[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}
