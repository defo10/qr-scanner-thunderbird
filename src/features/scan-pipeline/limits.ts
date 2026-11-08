import type { Settings } from '../settings';

const MB = 1024 * 1024;

// Checked against the size Thunderbird reports, before any download.
export function sizeLimitExceeded(sizeBytes: number, settings: Pick<Settings, 'maxAttachmentMB'>): { sizeMB: number; limitMB: number } | null {
  if (sizeBytes <= settings.maxAttachmentMB * MB) return null;
  return { sizeMB: Math.round((sizeBytes / MB) * 10) / 10, limitMB: settings.maxAttachmentMB };
}
