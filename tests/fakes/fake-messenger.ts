import type { Messenger } from '../../src/platform/tb-api';
import type { ScanEvent } from '../../src/shared/port-protocol';

export interface FakeAttachment {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface FakeMessage {
  readonly attachments: readonly FakeAttachment[];
  readonly junk?: boolean;
  readonly folderSpecialUse?: readonly string[];
}

export interface DisplaySession {
  /** Resolves with every event received up to and including `scan-finished` or `idle`. */
  readonly events: Promise<ScanEvent[]>;
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

const partName = (index: number) => `1.${index + 2}`;

// In-memory stand-in for the subset of the Thunderbird messenger API the
// extension uses, plus driver methods to simulate user and mail activity.
export function createFakeMessenger() {
  const messages = new Map<number, FakeMessage>();
  const displayed = new Map<number, number[]>();
  const attachmentDownloads: { messageId: number; partName: string }[] = [];
  const onConnect = fakeEvent<[messenger.runtime.Port]>();
  const onNewMailReceived = fakeEvent<[unknown, unknown]>();
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
    messages: {
      listAttachments: messageId => {
        const m = messages.get(messageId);
        if (!m) return Promise.reject(new Error(`no message ${messageId}`));
        return Promise.resolve(m.attachments.map((a, i) => ({
          name: a.name, contentType: a.contentType, partName: partName(i), size: a.bytes.byteLength,
        })));
      },
      getAttachmentFile: (messageId, part) => {
        attachmentDownloads.push({ messageId, partName: part });
        const a = messages.get(messageId)?.attachments.find((_, i) => partName(i) === part);
        if (!a) return Promise.reject(new Error(`no part ${part}`));
        return Promise.resolve(new File([a.bytes.slice()], a.name, { type: a.contentType }));
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
      onConnect.fire(port);
    });
    return { events };
  }

  return {
    messenger: messengerApi,
    attachmentDownloads: () => [...attachmentDownloads],
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
