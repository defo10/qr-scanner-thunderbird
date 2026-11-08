import { describe, expect, it } from 'vitest';
import { aMessageWith, anImageAttachment, aRunningScanService, defaultScanSettings, fixture } from '../../../tests/helpers/builders';

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('cancelling stale scans', () => {
  it('stops at once when the message is left during the second of three attachments', async () => {
    const { mail, workers } = aRunningScanService({ hangOnJob: 2 });
    const id = mail.deliver(aMessageWith(
      anImageAttachment('one.png', fixture('datamatrix-plain.png')),
      anImageAttachment('two.png', fixture('qr-url.png')),
      anImageAttachment('three.png', fixture('aztec.png')),
    ));
    const session = mail.display(id);

    await workers.jobStarted(2);
    session.disconnect();
    await settle();

    expect(session.received().map(e => e.type)).toEqual(['scan-started', 'codes']);
    expect(workers.terminationCount()).toBe(1);
    expect(mail.attachmentDownloads().map(d => d.partName)).toEqual(['1.2', '1.3']);
    expect(mail.sessionStorageKeys()).toEqual([]);
  });

  it('scans the next message on a fresh worker without compiling the WASM again', async () => {
    const { mail, workers, wasmLoads } = aRunningScanService({ hangOnJob: 1 });
    const first = mail.deliver(aMessageWith(anImageAttachment('one.png', fixture('datamatrix-plain.png'))));
    const second = mail.deliver(aMessageWith(anImageAttachment('two.png', fixture('qr-url.png'))));
    const firstSession = mail.display(first);
    await workers.jobStarted(1);
    firstSession.disconnect();

    const events = await mail.display(second).events;

    expect(events.map(e => e.type)).toEqual(['scan-started', 'codes', 'scan-finished']);
    expect(workers.spawnCount()).toBe(2);
    expect(wasmLoads()).toBe(1);
  });

  it('keeps an idle worker when the message is left after its scan finished', async () => {
    const { mail, workers } = aRunningScanService();
    const first = mail.deliver(aMessageWith(anImageAttachment('one.png', fixture('datamatrix-plain.png'))));
    const second = mail.deliver(aMessageWith(anImageAttachment('two.png', fixture('qr-url.png'))));
    const firstSession = mail.display(first);
    await firstSession.events;

    firstSession.disconnect();
    await mail.display(second).events;

    expect(workers.terminationCount()).toBe(0);
    expect(workers.spawnCount()).toBe(1);
  });
});

describe('caching results for the session', () => {
  it('replays a completed scan when the message is displayed again, without downloading anything', async () => {
    const { mail, workers } = aRunningScanService();
    const id = mail.deliver(aMessageWith(
      anImageAttachment('label.png', fixture('datamatrix-gs1.png')),
      anImageAttachment('photo.png', fixture('no-code.png')),
    ));
    const firstEvents = await mail.display(id).events;
    const downloadsAfterFirstScan = mail.attachmentDownloads().length;

    const replayed = await mail.display(id).events;

    expect(replayed).toEqual(firstEvents);
    expect(mail.attachmentDownloads()).toHaveLength(downloadsAfterFirstScan);
    expect(workers.spawnCount()).toBe(1);
  });

  it('scans again after a format setting changed', async () => {
    const { mail, changeSettings } = aRunningScanService();
    const id = mail.deliver(aMessageWith(anImageAttachment('label.png', fixture('qr-url.png'))));
    await mail.display(id).events;

    changeSettings({ ...defaultScanSettings, formats: ['DataMatrix'] });
    const events = await mail.display(id).events;

    expect(mail.attachmentDownloads()).toHaveLength(2);
    expect(events.map(e => e.type)).toEqual(['scan-started', 'scan-finished']);
  });
});
