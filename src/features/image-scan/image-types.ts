const MIME_BY_TYPE: Record<string, string> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'image/bmp': 'image/bmp',
  'image/x-ms-bmp': 'image/bmp',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download']);

// Mail clients often label attachments generically, so the file extension is
// only trusted when the declared type carries no information. SVG, TIFF and
// other image types yield null and are skipped.
export function scannableImageMime(contentType: string, fileName: string): string | null {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (GENERIC_TYPES.has(type)) {
    const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
    return MIME_BY_EXTENSION[ext] ?? null;
  }
  return MIME_BY_TYPE[type] ?? null;
}
