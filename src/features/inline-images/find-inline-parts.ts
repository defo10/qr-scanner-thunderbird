import { scannableImageMime } from '../image-scan';
import type { MessagePartInfo } from '../../platform/tb-api';

export interface InlineImagePart {
  readonly partName: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
}

const isInline = (p: MessagePartInfo) =>
  (p.headers['content-id']?.length ?? 0) > 0 ||
  (p.headers['content-disposition'] ?? []).some(d => /^\s*inline\b/i.test(d));

export function findInlineImageParts(root: MessagePartInfo): InlineImagePart[] {
  const found: InlineImagePart[] = [];
  const walk = (p: MessagePartInfo) => {
    const mime = p.contentType.toLowerCase().startsWith('image/') ? scannableImageMime(p.contentType, p.name) : null;
    if (mime !== null && p.partName !== '' && isInline(p)) {
      found.push({ partName: p.partName, name: p.name, mime, size: p.size });
    }
    p.parts.forEach(walk);
  };
  walk(root);
  return found;
}
