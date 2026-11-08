import { scannableImageMime } from '../image-scan';

export interface DataUriImage {
  readonly index: number;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export const MAX_DATA_URIS = 50;

// - DOMParser yields an inert document: no scripts run and no images load, so
//   remote http(s) sources in the mail are never fetched.
// - Only data: URIs of scannable raster types are returned (no SVG); malformed
//   ones are skipped. `index` counts every data:image URI in document order.
export function findDataUriImages(html: string, parser: DOMParser, limit = MAX_DATA_URIS): DataUriImage[] {
  const doc = parser.parseFromString(html, 'text/html');
  const srcs = [...doc.querySelectorAll('img[src]')]
    .map(img => img.getAttribute('src') ?? '')
    .filter(src => /^data:image\//i.test(src.trim()))
    .slice(0, limit);
  return srcs.flatMap((src, index) => {
    const parsed = parseDataUri(src.trim());
    return parsed ? [{ index, ...parsed }] : [];
  });
}

function parseDataUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^,;]+)((?:;[^,;]*)*),(.*)$/is.exec(uri);
  if (!match) return null;
  const [, type = '', params = '', payload = ''] = match;
  const mime = scannableImageMime(type, '');
  if (mime === null) return null;
  try {
    if (/;base64/i.test(params)) {
      const binary = atob(payload.replace(/\s+/g, ''));
      return { mime, bytes: Uint8Array.from(binary, c => c.charCodeAt(0)) };
    }
    return { mime, bytes: Uint8Array.from(decodeURIComponent(payload), c => c.charCodeAt(0) & 0xff) };
  } catch {
    return null;
  }
}
