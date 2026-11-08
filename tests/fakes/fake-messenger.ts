import type { Messenger } from '../../src/platform/tb-api';
import type { ScanEvent } from '../../src/shared/port-protocol';
import { englishMessage } from '../helpers/i18n';

export interface FakeAttachment {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  /** Size reported by listAttachments; defaults to the byte length. */
  readonly reportedSize?: number;
}

export interface FakeInlineImage {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly contentId?: string;
  /** Some clients also list inline images as attachments. */
  readonly listedAsAttachment?: boolean;
}

export interface FakeMessage {
  readonly attachments: readonly FakeAttachment[];
  readonly html?: string;
  readonly inlineImages?: readonly FakeInlineImage[];
  readonly junk?: boolean;
  readonly folderSpecialUse?: readonly string[];
}

export interface DisplaySession {
  /** Resolves with every event received up to and including `scan-finished` or `idle`. */
  readonly events: Promise<ScanEvent[]>;
  /** Events received so far. */
  readonly received: () => ScanEvent[];
  /** The display script goes away: the user moved to another message. */
  readonly disconnect: () => void;
  readonly tabId: number;
}

type Listener<A extends unknown[]> = (...args: A) => void;

function fakeEvent<A extends unknown[]>() {
  const listeners: Listener<A>[] = [];
  return {
    listeners,
    fire: (...args: A) => listeners.forEach(l => l(...args)),
    api: {
      addListener: (l: Listener<A>) => { listeners.push(l); },
      removeListener: (l: Listener<A>) => { listeners.splice(listeners.indexOf(l), 1); },
      hasListener: (l: Listener<A>) => listeners.includes(l),
    },
  };
}

// Part layout: 1 multipart/mixed → 1.1 multipart/related (1.1.1 text/html,
// 1.1.2… inline images), then attachments as 1.2, 1.3, …
const partName = (index: number) => `1.${index + 2}`;
const inlinePartName = (index: number) => `1.1.${index + 2}`;

function partsOf(m: FakeMessage) {
  const attachments = m.attachments.map((a, i) => ({ ...a, partName: partName(i), contentId: undefined, listedAsAttachment: true }));
  const inline = (m.inlineImages ?? []).map((img, i) => ({ ...img, partName: inlinePartName(i) }));
  return { attachments, inline, all: [...attachments, ...inline] };
}

function mimeTree(m: FakeMessage): messenger.messages.MessagePart {
  const { attachments, inline } = partsOf(m);
  return {
    partName: '',
    contentType: 'message/rfc822',
    parts: [{
      partName: '1',
      contentType: 'multipart/mixed',
      parts: [
        {
          partName: '1.1',
          contentType: 'multipart/related',
          parts: [
            { partName: '1.1.1', contentType: 'text/html', headers: {}, size: (m.html ?? '').length },
            ...inline.map(img => ({
              partName: img.partName,
              contentType: img.contentType,
              name: img.name,
              size: img.bytes.byteLength,
              headers: {
                'content-type': [img.contentType],
                ...(img.contentId ? { 'content-id': [`<${img.contentId}>`] } : {}),
                'content-disposition': [`inline; filename="${img.name}"`],
              },
            })),
          ],
        },
        ...attachments.map(a => ({
          partName: a.partName,
          contentType: a.contentType,
          name: a.name,
          size: a.bytes.byteLength,
          headers: { 'content-disposition': [`attachment; filename="${a.name}"`] },
        })),
      ],
    }],
  };
}

// In-memory stand-in for the subset of the Thunderbird messenger API the
// extension uses, plus driver methods to simulate user and mail activity.
export function createFakeMessenger() {
  const messages = new Map<number, FakeMessage>();
  const displayed = new Map<number, number[]>();
  const attachmentDownloads: { messageId: number; partName: string }[] = [];
  const onConnect = fakeEvent<[messenger.runtime.Port]>();
  const onNewMailReceived = fakeEvent<[unknown, unknown]>();
  const session = new Map<string, unknown>();
  const onScanActionClicked = fakeEvent<[messenger.tabs.Tab, unknown]>();
  let scanActionEnabled = true;
  let nextMessageId = 1;
  let nextTabId = 1;

  const header = (id: number, m: FakeMessage): messenger.messages.MessageHeader => ({
    id,
    junk: m.junk ?? false,
    folder: { accountId: 'account1', path: '/INBOX', specialUse: [...(m.folderSpecialUse ?? ['inbox'])] },
  });

  const messengerApi: Messenger = {
    runtime: {
      onConnect: onConnect.api,
      connect: () => { throw new Error('the fake has no display-side runtime.connect'); },
      getURL: path => `moz-extension://fake/${path}`,
    },
    messageDisplayAction: {
      enable: () => { scanActionEnabled = true; return Promise.resolve(); },
      disable: () => { scanActionEnabled = false; return Promise.resolve(); },
      onClicked: onScanActionClicked.api,
    },
    storage: {
      onChanged: fakeEvent<[Record<string, { oldValue?: unknown; newValue?: unknown }>, string]>().api,
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
        remove: () => Promise.resolve(),
      },
      session: {
        get: key => Promise.resolve(Object.fromEntries(
          (typeof key === 'string' ? [key] : key ?? [...session.keys()]).filter(k => session.has(k)).map(k => [k, structuredClone(session.get(k))]),
        )),
        set: items => { Object.entries(items).forEach(([k, v]) => session.set(k, structuredClone(v))); return Promise.resolve(); },
        remove: keys => { [keys].flat().forEach(k => session.delete(k)); return Promise.resolve(); },
      },
    },
    i18n: {
      getMessage: (key, subs) => englishMessage(key, typeof subs === 'string' ? [subs] : subs),
    },
    messages: {
      listAttachments: messageId => {
        const m = messages.get(messageId);
        if (!m) return Promise.reject(new Error(`no message ${messageId}`));
        return Promise.resolve(partsOf(m).all.filter(p => p.listedAsAttachment).map(p => ({
          name: p.name, contentType: p.contentType, partName: p.partName, size: ('reportedSize' in p ? p.reportedSize : undefined) ?? p.bytes.byteLength,
        })));
      },
      getAttachmentFile: (messageId, part) => {
        attachmentDownloads.push({ messageId, partName: part });
        const m = messages.get(messageId);
        const found = m && partsOf(m).all.find(p => p.partName === part);
        if (!found) return Promise.reject(new Error(`no part ${part}`));
        return Promise.resolve(new File([found.bytes.slice()], found.name, { type: found.contentType }));
      },
      getFull: messageId => {
        const m = messages.get(messageId);
        return m ? Promise.resolve(mimeTree(m)) : Promise.reject(new Error(`no message ${messageId}`));
      },
      listInlineTextParts: messageId => {
        const html = messages.get(messageId)?.html;
        return Promise.resolve(html === undefined ? [] : [{ contentType: 'text/html', content: html }]);
      },
    },
    messageDisplay: {
      getDisplayedMessages: tabId => {
        const ids = displayed.get(tabId ?? -1) ?? [];
        return Promise.resolve({ id: null, messages: ids.map(id => header(id, messages.get(id) ?? { attachments: [] })) });
      },
    },
    scripting: {
      messageDisplay: {
        registerScripts: () => Promise.resolve(),
        getRegisteredScripts: () => Promise.resolve([]),
        unregisterScripts: () => Promise.resolve(),
      },
    },
  };

  function connectDisplayPort(tabId: number): DisplaySession {
    const received: ScanEvent[] = [];
    const disconnect = fakeEvent<[messenger.runtime.Port]>();
    let backgroundPort: messenger.runtime.Port | undefined;
    const events = new Promise<ScanEvent[]>(resolve => {
      const port: messenger.runtime.Port = {
        name: 'scan',
        sender: { tab: { id: tabId } },
        postMessage: msg => {
          const event = msg as ScanEvent;
          received.push(event);
          if (event.type === 'scan-finished' || event.type === 'idle') resolve(received);
        },
        disconnect: () => disconnect.fire(port),
        onMessage: fakeEvent<[unknown, messenger.runtime.Port]>().api,
        onDisconnect: disconnect.api,
      };
      backgroundPort = port;
      onConnect.fire(port);
    });
    return {
      events,
      received: () => [...received],
      disconnect: () => { if (backgroundPort) disconnect.fire(backgroundPort); },
      tabId,
    };
  }

  return {
    messenger: messengerApi,
    attachmentDownloads: () => [...attachmentDownloads],
    sessionStorageKeys: () => [...session.keys()],
    isScanActionEnabled: () => scanActionEnabled,
    clickScanAction: (tabId: number) => onScanActionClicked.fire({ id: tabId }, undefined),
    newMailListenerCount: () => onNewMailReceived.listeners.length,

    /** Stores the message and returns its id. */
    deliver(message: FakeMessage): number {
      const id = nextMessageId++;
      messages.set(id, message);
      return id;
    },

    receiveNewMail(message: FakeMessage): number {
      const id = this.deliver(message);
      onNewMailReceived.fire({ path: '/INBOX' }, { id: null, messages: [header(id, message)] });
      return id;
    },

    /** Shows the messages in a new tab and connects that tab's display script. */
    display(...ids: number[]): DisplaySession {
      const tabId = nextTabId++;
      displayed.set(tabId, ids);
      return connectDisplayPort(tabId);
    },
  };
}

export type FakeMessenger = ReturnType<typeof createFakeMessenger>;
