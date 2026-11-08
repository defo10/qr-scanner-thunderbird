import { describe, expect, it, vi } from 'vitest';
import {
  aCidImage, aDataUri, anHtmlMessage, anImageAttachment, aRunningScanService, defaultScanSettings, fixture,
} from '../../../tests/helpers/builders';

describe('scanning images embedded in the message body', () => {
  it('decodes a cid: image of a multipart/related HTML mail and labels it as inline', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(anHtmlMessage(
      '<p>Your label:</p><img src="cid:label123">',
      aCidImage('label123', fixture('datamatrix-plain.png'), { name: 'label.png' }),
    ));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 1 },
      {
        type: 'codes',
        source: { kind: 'inline', name: 'label.png', partName: '1.1.2' },
        codes: [expect.objectContaining({ text: 'HELLO-DATAMATRIX-123' })],
      },
      { type: 'scan-finished' },
    ]);
  });

  it('scans an image that is both inline and listed as an attachment only once', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(anHtmlMessage(
      '<img src="cid:both">',
      aCidImage('both', fixture('qr-url.png'), { name: 'both.png', listedAsAttachment: true }),
    ));

    const events = await mail.display(id).events;

    expect(events[0]).toEqual({ type: 'scan-started', sourceCount: 1 });
    expect(events.filter(e => e.type === 'codes')).toEqual([
      expect.objectContaining({ source: { kind: 'attachment', name: 'both.png', partName: '1.1.2' } }),
    ]);
    expect(mail.attachmentDownloads()).toEqual([{ messageId: id, partName: '1.1.2' }]);
  });

  it('decodes a QR code from a data: URI in the HTML body', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(anHtmlMessage(`<p>Scan me</p><img alt="qr" src="${aDataUri(fixture('qr-url.png'))}">`));

    const events = await mail.display(id).events;

    expect(events).toContainEqual({
      type: 'codes',
      source: { kind: 'inline', name: '', dataUriIndex: 0 },
      codes: [expect.objectContaining({ format: 'QRCode', text: 'https://evil.example/login?next=%2F' })],
    });
  });

  it('never fetches remote images referenced by the body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { mail } = aRunningScanService();
    const id = mail.deliver(anHtmlMessage(
      '<img src="https://tracker.example/pixel.gif"><img src="http://cdn.example/qr.png">',
    ));

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'idle' }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('ignores SVG data URIs and scans the raster ones', async () => {
    const { mail } = aRunningScanService();
    const svg = aDataUri(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
    const id = mail.deliver(anHtmlMessage(`<img src="${svg}"><img src="${aDataUri(fixture('datamatrix-plain.png'))}">`));

    const events = await mail.display(id).events;

    expect(events[0]).toEqual({ type: 'scan-started', sourceCount: 1 });
  });

  it('scans only attachments when inline scanning is switched off', async () => {
    const { mail } = aRunningScanService({ ...defaultScanSettings, scanInlineImages: false });
    const id = mail.deliver({
      ...anHtmlMessage('<img src="cid:x">', aCidImage('x', fixture('qr-url.png'))),
      attachments: [anImageAttachment('label.png', fixture('datamatrix-plain.png'))],
    });

    const events = await mail.display(id).events;

    expect(events[0]).toEqual({ type: 'scan-started', sourceCount: 1 });
    expect(events.flatMap(e => (e.type === 'codes' ? [e.source.kind] : []))).toEqual(['attachment']);
  });
});
