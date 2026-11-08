const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-download']);

export function isPdf(contentType: string, fileName: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'application/pdf' || type === 'application/x-pdf') return true;
  return GENERIC_TYPES.has(type) && /\.pdf$/i.test(fileName);
}
