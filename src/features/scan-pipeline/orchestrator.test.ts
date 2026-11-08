import { describe, expect, it } from 'vitest';
import {
  aFileAttachment, aMessageWith, anImageAttachment, aRunningScanService, corruptPng, fixture,
} from '../../../tests/helpers/builders';

describe('scanning the image attachments of a displayed message', () => {
  it('streams the start, the decoded Data Matrix and the end of the scan, in that order', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(anImageAttachment('label.png', fixture('datamatrix-gs1.png'))));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 1 },
      {
        type: 'codes',
        source: { kind: 'attachment', name: 'label.png', partName: '1.2' },
        codes: [expect.objectContaining({ format: 'DataMatrix', text: '01040123456789011725123110ABC123\x1D21XYZ789' })],
      },
      { type: 'scan-finished' },
    ]);
  });

  it('reports idle for a message without image attachments', async () => {
    const { mail, workers } = aRunningScanService();
    const id = mail.deliver(aMessageWith(
      aFileAttachment('invoice.pdf', 'application/pdf'),
      aFileAttachment('notes.txt', 'text/plain'),
    ));

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'idle' }]);
    expect(mail.attachmentDownloads()).toEqual([]);
    expect(workers.spawnCount()).toBe(0);
  });

  it('skips a message flagged as junk', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver({ ...aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))), junk: true });

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'idle' }]);
    expect(mail.attachmentDownloads()).toEqual([]);
  });

  it('skips a message in the junk folder', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver({
      ...aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))),
      folderSpecialUse: ['junk'],
    });

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'idle' }]);
    expect(mail.attachmentDownloads()).toEqual([]);
  });

  it('skips when several messages are selected', async () => {
    const { mail } = aRunningScanService();
    const first = mail.deliver(aMessageWith(anImageAttachment('a.png', fixture('datamatrix-plain.png'))));
    const second = mail.deliver(aMessageWith(anImageAttachment('b.png', fixture('qr-url.png'))));

    const events = await mail.display(first, second).events;

    expect(events).toEqual([{ type: 'idle' }]);
  });

  it('scans a generically typed attachment by its image file extension', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(anImageAttachment('scan.JPG', fixture('datamatrix-plain.png'), 'application/octet-stream')));

    const events = await mail.display(id).events;

    expect(events).toContainEqual(expect.objectContaining({
      type: 'codes',
      codes: [expect.objectContaining({ text: 'HELLO-DATAMATRIX-123' })],
    }));
  });

  it('ignores SVG and TIFF attachments without reporting an error', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(
      aFileAttachment('logo.svg', 'image/svg+xml'),
      aFileAttachment('fax.tiff', 'image/tiff'),
      anImageAttachment('label.png', fixture('datamatrix-plain.png')),
    ));

    const events = await mail.display(id).events;

    expect(events.map(e => e.type)).toEqual(['scan-started', 'codes', 'scan-finished']);
    expect(events[0]).toEqual({ type: 'scan-started', sourceCount: 1 });
  });

  it('reports a corrupt image as unreadable and still scans the next attachment', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(
      anImageAttachment('broken.png', corruptPng()),
      anImageAttachment('label.png', fixture('qr-url.png')),
    ));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 2 },
      { type: 'source-error', source: { kind: 'attachment', name: 'broken.png', partName: '1.2' }, reason: 'unreadable' },
      {
        type: 'codes',
        source: { kind: 'attachment', name: 'label.png', partName: '1.3' },
        codes: [expect.objectContaining({ format: 'QRCode', text: 'https://evil.example/login?next=%2F' })],
      },
      { type: 'scan-finished' },
    ]);
  });

  it('emits no codes event for an image without a code', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(anImageAttachment('photo.png', fixture('no-code.png'))));

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'scan-started', sourceCount: 1 }, { type: 'scan-finished' }]);
  });

  it('does nothing when new mail arrives; only displaying a message starts a scan', async () => {
    const { mail, workers } = aRunningScanService();

    mail.receiveNewMail(aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mail.newMailListenerCount()).toBe(0);
    expect(mail.attachmentDownloads()).toEqual([]);
    expect(workers.spawnCount()).toBe(0);
  });
});
