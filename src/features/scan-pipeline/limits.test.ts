import { describe, expect, it } from 'vitest';
import {
  aMessageWith, anImageAttachment, aRunningScanService, defaultScanSettings, fixture, reportedAsMegabytes,
} from '../../../tests/helpers/builders';

describe('limits', () => {
  it('skips an attachment above the size limit without downloading it', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(reportedAsMegabytes(anImageAttachment('big-scan.png', fixture('datamatrix-plain.png')), 12)));

    const events = await mail.display(id).events;

    expect(mail.attachmentDownloads()).toEqual([]);
    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 1 },
      {
        type: 'source-error',
        source: { kind: 'attachment', name: 'big-scan.png', partName: '1.2' },
        reason: 'too-large',
        detail: { sizeMB: 12, limitMB: 10 },
      },
      { type: 'scan-finished' },
    ]);
  });

  it('scans the same attachment once the size limit is raised', async () => {
    const { mail } = aRunningScanService({ settings: { ...defaultScanSettings, maxAttachmentMB: 20 } });
    const id = mail.deliver(aMessageWith(reportedAsMegabytes(anImageAttachment('big-scan.png', fixture('datamatrix-plain.png')), 12)));

    const events = await mail.display(id).events;

    expect(mail.attachmentDownloads()).toHaveLength(1);
    expect(events.map(e => e.type)).toEqual(['scan-started', 'codes', 'scan-finished']);
  });

  it('reports a timeout for an attachment that hangs and still scans the next one', async () => {
    const { mail } = aRunningScanService({ hangOnJob: 1, settings: { ...defaultScanSettings, perAttachmentTimeoutSec: 0.05 } });
    const id = mail.deliver(aMessageWith(
      anImageAttachment('stuck.png', fixture('datamatrix-plain.png')),
      anImageAttachment('label.png', fixture('qr-url.png')),
    ));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 2 },
      {
        type: 'source-error',
        source: { kind: 'attachment', name: 'stuck.png', partName: '1.2' },
        reason: 'timeout',
        detail: { seconds: 0.05 },
      },
      {
        type: 'codes',
        source: { kind: 'attachment', name: 'label.png', partName: '1.3' },
        codes: [expect.objectContaining({ text: 'https://evil.example/login?next=%2F' })],
      },
      { type: 'scan-finished' },
    ]);
  });
});
