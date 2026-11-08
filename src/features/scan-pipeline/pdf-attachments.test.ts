import { describe, expect, it } from 'vitest';
import { aFileAttachment, aMessageWith, anImageAttachment, aRunningScanService, defaultScanSettings, fixture } from '../../../tests/helpers/builders';
import { pdfFixture } from '../../../tests/helpers/node-pdf';

const aPdf = (name: string, fixtureName: string, contentType = 'application/pdf') =>
  aFileAttachment(name, contentType, pdfFixture(fixtureName));

describe('scanning PDF attachments', () => {
  it('labels codes from a PDF with their page', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(aPdf('label.pdf', 'datamatrix-vector.pdf')));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 1 },
      {
        type: 'codes',
        source: { kind: 'attachment', name: 'label.pdf', partName: '1.2', page: 1 },
        codes: [expect.objectContaining({ format: 'DataMatrix', text: 'VECTOR-DM-0001' })],
      },
      { type: 'scan-finished' },
    ]);
  });

  it('streams the codes of each page as it is scanned', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(aPdf('docs.pdf', 'mixed-3-pages.pdf')));

    const events = await mail.display(id).events;

    expect(events.flatMap(e => (e.type === 'codes' ? [[e.source, e.codes.map(c => c.text)]] : []))).toEqual([
      [{ kind: 'attachment', name: 'docs.pdf', partName: '1.2', page: 1 }, ['PAGE-ONE-DM']],
      [{ kind: 'attachment', name: 'docs.pdf', partName: '1.2', page: 3 }, ['PAGE-THREE-DM']],
    ]);
  });

  it('adds a page-limit note when a PDF has more pages than are scanned', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(aPdf('long.pdf', 'pages-25.pdf')));

    const events = await mail.display(id).events;

    expect(events).toContainEqual({
      type: 'source-error',
      source: { kind: 'attachment', name: 'long.pdf', partName: '1.2' },
      reason: 'page-limit',
      detail: { scanned: 20, total: 25 },
    });
  });

  it('reports encrypted and truncated PDFs and finishes the scan', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(aPdf('secret.pdf', 'encrypted.pdf'), aPdf('broken.pdf', 'truncated.pdf')));

    const events = await mail.display(id).events;

    expect(events).toEqual([
      { type: 'scan-started', sourceCount: 2 },
      { type: 'source-error', source: { kind: 'attachment', name: 'secret.pdf', partName: '1.2' }, reason: 'encrypted-pdf' },
      { type: 'source-error', source: { kind: 'attachment', name: 'broken.pdf', partName: '1.3' }, reason: 'unreadable' },
      { type: 'scan-finished' },
    ]);
  });

  it('recognizes a generically typed attachment by its .pdf extension', async () => {
    const { mail } = aRunningScanService();
    const id = mail.deliver(aMessageWith(aPdf('LABEL.PDF', 'datamatrix-vector.pdf', 'application/octet-stream')));

    const events = await mail.display(id).events;

    expect(events.map(e => e.type)).toEqual(['scan-started', 'codes', 'scan-finished']);
  });

  it('skips PDFs when PDF scanning is switched off', async () => {
    const { mail } = aRunningScanService({ settings: { ...defaultScanSettings, scanPdfs: false } });
    const id = mail.deliver(aMessageWith(aPdf('label.pdf', 'datamatrix-vector.pdf'), anImageAttachment('scan.png', fixture('qr-url.png'))));

    const events = await mail.display(id).events;

    expect(events[0]).toEqual({ type: 'scan-started', sourceCount: 1 });
    expect(mail.attachmentDownloads().map(d => d.partName)).toEqual(['1.3']);
  });
});
