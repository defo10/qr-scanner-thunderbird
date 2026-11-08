import { scannableImageMime } from '../image-scan';
import { isPdf } from '../pdf-scan';
import type { DataUriImage, InlineImagePart } from '../inline-images';
import type { AttachmentInfo } from '../../platform/tb-api';
import type { SourceRef } from '../../shared/types';

export type SourceBytes =
  | { readonly from: 'part'; readonly partName: string }
  | { readonly from: 'memory'; readonly bytes: Uint8Array };

export interface PlannedSource {
  readonly kind: 'image' | 'pdf';
  readonly ref: SourceRef;
  readonly mime: string;
  readonly size: number;
  readonly bytes: SourceBytes;
}

export interface SourceCandidates {
  readonly attachments: readonly AttachmentInfo[];
  readonly inlineParts: readonly InlineImagePart[];
  readonly dataUris: readonly DataUriImage[];
}

// Order: attachments, then cid: parts, then data: URIs. An inline part that is
// also listed as an attachment is scanned once, as the attachment.
export function planSources(c: SourceCandidates, options: { readonly scanImageAttachments: boolean; readonly scanPdfs: boolean }): PlannedSource[] {
  const attachments = c.attachments.flatMap((a): PlannedSource[] => {
    const ref: SourceRef = { kind: 'attachment', name: a.name, partName: a.partName };
    const bytes: SourceBytes = { from: 'part', partName: a.partName };
    const mime = scannableImageMime(a.contentType, a.name);
    if (mime !== null) return options.scanImageAttachments ? [{ kind: 'image', ref, mime, size: a.size, bytes }] : [];
    if (options.scanPdfs && isPdf(a.contentType, a.name)) return [{ kind: 'pdf', ref, mime: 'application/pdf', size: a.size, bytes }];
    return [];
  });
  const listed = new Set(c.attachments.map(a => a.partName));
  const inlineParts = c.inlineParts
    .filter(p => !listed.has(p.partName))
    .map((p): PlannedSource => ({
      kind: 'image',
      ref: { kind: 'inline', name: p.name, partName: p.partName },
      mime: p.mime,
      size: p.size,
      bytes: { from: 'part', partName: p.partName },
    }));
  const dataUris = c.dataUris.map((d): PlannedSource => ({
    kind: 'image',
    ref: { kind: 'inline', name: '', dataUriIndex: d.index },
    mime: d.mime,
    size: d.bytes.byteLength,
    bytes: { from: 'memory', bytes: d.bytes },
  }));
  return [...attachments, ...inlineParts, ...dataUris];
}
