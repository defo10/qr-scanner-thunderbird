import { ALL_CODE_FORMATS } from '../../src/features/decode';
import { mountOverlay } from '../../src/features/overlay';
import type { ScanEvent } from '../../src/shared/port-protocol';
import type { DecodedCode } from '../../src/shared/types';
import { englishTranslate } from './i18n';
import { createWorkerClient, startScanService, type ScanSettings } from '../../src/features/scan-pipeline';
import { createTbApi } from '../../src/platform/tb-api';
import { Window } from 'happy-dom';
import { createFakeMessenger, type FakeAttachment, type FakeInlineImage, type FakeMessage } from '../fakes/fake-messenger';
import { createFakeWorkerHost } from '../fakes/fake-worker';
import { fixtureBytes, nodeZxingWasm } from './load-fixture';

export function aMessageWith(...attachments: FakeAttachment[]): FakeMessage {
  return { attachments };
}

/** An HTML message whose body references its inline images by cid:. */
export function anHtmlMessage(html: string, ...inlineImages: FakeInlineImage[]): FakeMessage {
  return { attachments: [], html, inlineImages };
}

export function aCidImage(contentId: string, bytes: Uint8Array, options: { name?: string; listedAsAttachment?: boolean } = {}): FakeInlineImage {
  return { name: options.name ?? `${contentId}.png`, contentType: 'image/png', bytes, contentId, listedAsAttachment: options.listedAsAttachment ?? false };
}

export function aDataUri(bytes: Uint8Array, mime = 'image/png'): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export function anImageAttachment(name: string, bytes: Uint8Array, contentType = 'image/png'): FakeAttachment {
  return { name, contentType, bytes };
}

export function aFileAttachment(name: string, contentType: string, bytes = new TextEncoder().encode('not an image')): FakeAttachment {
  return { name, contentType, bytes };
}

export function fixture(name: string): Uint8Array {
  return fixtureBytes(name);
}

/** A PNG signature followed by bytes that are not a valid PNG header. */
export function corruptPng(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode('definitely not IHDR')]);
}

/** A background scan service wired to a fake messenger and an in-process worker. */
export const defaultScanSettings: ScanSettings = { formats: ALL_CODE_FORMATS, scanInlineImages: true };

export function aRunningScanService(settings: ScanSettings = defaultScanSettings) {
  const mail = createFakeMessenger();
  const workers = createFakeWorkerHost();
  const worker = createWorkerClient({ spawn: workers.spawn, loadWasm: nodeZxingWasm });
  // happy-dom's types differ slightly from lib.dom's, the behavior does not.
  const htmlParser = new new Window().DOMParser() as unknown as DOMParser;
  startScanService({ tb: createTbApi(mail.messenger), worker, htmlParser, settings: () => settings });
  return { mail, workers };
}

export function aDecodedCode(overrides: Partial<DecodedCode> = {}): DecodedCode {
  const text = overrides.text ?? 'HELLO-DATAMATRIX-123';
  return {
    format: 'DataMatrix',
    text,
    bytesB64: Buffer.from(text, 'latin1').toString('base64'),
    contentKind: 'Text',
    symbologyId: ']d1',
    ...overrides,
  };
}

export function codesFrom(attachmentName: string, ...codes: DecodedCode[]): ScanEvent {
  return { type: 'codes', source: { kind: 'attachment', name: attachmentName, partName: '1.2' }, codes };
}

/** An overlay in a fresh DOM document with a recording clipboard. Needs a DOM test environment. */
export function anOverlay(options: { clipboardFails?: boolean } = {}) {
  const doc = document.implementation.createHTMLDocument('message');
  const clipboard: string[] = [];
  const overlay = mountOverlay({
    document: doc,
    t: englishTranslate,
    copy: text => {
      if (options.clipboardFails) return Promise.reject(new Error('denied'));
      clipboard.push(text);
      return Promise.resolve();
    },
  });
  const root = () => overlay.shadowRoot();
  return {
    send: (...events: ScanEvent[]) => events.forEach(overlay.handle),
    clipboard,
    root,
    host: () => doc.querySelector('qr-scanner-overlay'),
    text: () => root()?.textContent ?? '',
    entries: () => [...(root()?.querySelectorAll('.entry') ?? [])],
    click: (selector: string) => (root()?.querySelector(selector) as HTMLElement | null)?.click(),
  };
}
