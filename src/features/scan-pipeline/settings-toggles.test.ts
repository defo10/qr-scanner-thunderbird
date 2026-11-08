import { describe, expect, it } from 'vitest';
import { aMessageWith, anImageAttachment, aRunningScanService, defaultScanSettings, fixture } from '../../../tests/helpers/builders';

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('format and source settings', () => {
  it('reports no codes for a QR-only image when QR is disabled', async () => {
    const { mail } = aRunningScanService({ settings: { ...defaultScanSettings, formats: ['DataMatrix', 'Aztec'] } });
    const id = mail.deliver(aMessageWith(anImageAttachment('qr.png', fixture('qr-url.png'))));

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'scan-started', sourceCount: 1 }, { type: 'scan-finished' }]);
  });

  it('skips image attachments when they are switched off', async () => {
    const { mail } = aRunningScanService({ settings: { ...defaultScanSettings, scanImageAttachments: false } });
    const id = mail.deliver(aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))));

    const events = await mail.display(id).events;

    expect(events).toEqual([{ type: 'idle' }]);
    expect(mail.attachmentDownloads()).toEqual([]);
  });
});

describe('manual scanning', () => {
  it('downloads nothing on display when automatic scanning is off', async () => {
    const { mail, workers } = aRunningScanService({ settings: { ...defaultScanSettings, autoScan: false } });
    const id = mail.deliver(aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))));

    const session = mail.display(id);
    await settle();

    expect(session.received()).toEqual([{ type: 'manual-available' }]);
    expect(mail.attachmentDownloads()).toEqual([]);
    expect(workers.spawnCount()).toBe(0);
  });

  it('scans and streams the results when the toolbar button is clicked', async () => {
    const { mail } = aRunningScanService({ settings: { ...defaultScanSettings, autoScan: false } });
    const id = mail.deliver(aMessageWith(anImageAttachment('label.png', fixture('datamatrix-plain.png'))));
    const session = mail.display(id);
    await settle();

    mail.clickScanAction(session.tabId);
    const events = await session.events;

    expect(events.map(e => e.type)).toEqual(['manual-available', 'scan-started', 'codes', 'scan-finished']);
  });

  it('enables the toolbar button only while automatic scanning is off', async () => {
    const { mail, changeSettings } = aRunningScanService();
    await settle();
    expect(mail.isScanActionEnabled()).toBe(false);

    changeSettings({ ...defaultScanSettings, autoScan: false });
    await settle();
    expect(mail.isScanActionEnabled()).toBe(true);
  });
});
