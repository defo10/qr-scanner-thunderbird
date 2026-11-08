import { scannableImageMime } from '../image-scan';
import type { AttachmentInfo } from '../../platform/tb-api';
import type { SourceRef } from '../../shared/types';

export interface PlannedSource {
  readonly ref: SourceRef;
  readonly partName: string;
  readonly mime: string;
  readonly size: number;
}

export function planSources(attachments: readonly AttachmentInfo[]): PlannedSource[] {
  return attachments.flatMap(a => {
    const mime = scannableImageMime(a.contentType, a.name);
    if (mime === null) return [];
    return [{ ref: { kind: 'attachment', name: a.name, partName: a.partName }, partName: a.partName, mime, size: a.size }];
  });
}
