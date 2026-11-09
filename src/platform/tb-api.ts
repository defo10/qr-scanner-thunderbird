import type { ScanEvent } from '../shared/port-protocol';

export type Messenger = typeof messenger;

export interface DisplayedMessage {
  readonly id: number;
  readonly junk: boolean;
  readonly inJunkFolder: boolean;
}

export interface AttachmentInfo {
  readonly name: string;
  readonly partName: string;
  readonly contentType: string;
  readonly size: number;
}

export interface MessagePartInfo {
  readonly contentType: string;
  readonly partName: string;
  readonly name: string;
  readonly size: number;
  /** Lower-case header names. */
  readonly headers: Readonly<Record<string, readonly string[]>>;
  readonly parts: readonly MessagePartInfo[];
}

export interface InlineTextPartInfo {
  readonly contentType: string;
  readonly content: string;
}

export interface ScanPort {
  readonly tabId: number | undefined;
  post(event: ScanEvent): void;
  onDisconnect(listener: () => void): void;
}

export interface DisplayScanPort {
  onEvent(listener: (event: ScanEvent) => void): void;
}

export type TbApi = ReturnType<typeof createTbApi>;

const SCAN_PORT_NAME = 'scan';
const DISPLAY_SCRIPT_ID = 'qr-scanner-display';

export function defaultTbApi(): TbApi {
  return createTbApi(messenger);
}

export function createTbApi(m: Messenger) {
  let registration: Promise<void> = Promise.resolve();

  // - TB 128 MV3 offers only scripting.messageDisplay (needs the `scripting`
  //   and `messagesRead` permissions); messageDisplayScripts is not usable there.
  // - Registrations outlive event-page suspension, and registering an existing
  //   id rejects the whole call, so register only when missing. Calls are
  //   serialized so overlapping ones cannot both see "missing".
  const registerDisplayScript = (files: { js: string[]; css?: string[] }): Promise<void> => {
    const api = m.scripting.messageDisplay;
    registration = registration.catch(() => undefined).then(async () => {
      const existing = await api.getRegisteredScripts({ ids: [DISPLAY_SCRIPT_ID] });
      if (existing.length === 0) await api.registerScripts([{ id: DISPLAY_SCRIPT_ID, ...files }]);
    });
    return registration;
  };

  return {
    registerDisplayScript,

    // Registrations do not survive a Thunderbird restart, and the event page is
    // not started at launch unless it listens to runtime.onStartup. Without
    // that listener nothing would register the script after a restart, so no
    // display script would ever connect and wake the page. Must be called at
    // background top level; it also registers right away for install, update
    // and reload, which start the page without onStartup.
    keepDisplayScriptRegistered(files: { js: string[]; css?: string[] }): void {
      const register = () => {
        registerDisplayScript(files).catch((e: unknown) => console.error('registering the display script failed', e));
      };
      m.runtime.onStartup.addListener(register);
      register();
    },

    // Must be called synchronously at background top level: runtime.onConnect
    // is what wakes the suspended event page when a display script connects.
    onScanPortConnected(listener: (port: ScanPort) => void): void {
      m.runtime.onConnect.addListener(port => {
        if (port.name === SCAN_PORT_NAME) listener(toScanPort(port));
      });
    },

    connectScanPort(): DisplayScanPort {
      const port = m.runtime.connect({ name: SCAN_PORT_NAME });
      return { onEvent: listener => port.onMessage.addListener(msg => listener(msg as ScanEvent)) };
    },

    getMessage(key: string, substitutions: string[]): string {
      return m.i18n.getMessage(key, substitutions);
    },

    localStore: {
      get: async (key: string): Promise<unknown> => (await m.storage.local.get(key))[key],
      set: (key: string, value: unknown): Promise<void> => m.storage.local.set({ [key]: value }),
    },

    sessionStore: {
      get: async (key: string): Promise<unknown> => (await m.storage.session.get(key))[key],
      set: (key: string, value: unknown): Promise<void> => m.storage.session.set({ [key]: value }),
    },

    // Like onScanPortConnected, must be registered at background top level.
    onLocalStorageChanged(key: string, listener: () => void): void {
      m.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && key in changes) listener();
      });
    },

    // Without a tab id this sets the default for every message display.
    async setScanActionEnabled(enabled: boolean): Promise<void> {
      await (enabled ? m.messageDisplayAction.enable() : m.messageDisplayAction.disable());
    },

    // Must be registered at background top level, like onScanPortConnected.
    onScanActionClicked(listener: (tabId: number) => void): void {
      m.messageDisplayAction.onClicked.addListener(tab => {
        if (tab.id !== undefined) listener(tab.id);
      });
    },

    extensionUrl(path: string): string {
      return m.runtime.getURL(path);
    },

    // Resolves to null unless exactly one message is displayed.
    async getDisplayedMessage(tabId: number): Promise<DisplayedMessage | null> {
      const result = await m.messageDisplay.getDisplayedMessages(tabId);
      const list = Array.isArray(result) ? result : result.messages;
      const [only] = list;
      if (list.length !== 1 || !only) return null;
      const folder = only.folder;
      return {
        id: only.id,
        junk: only.junk === true,
        inJunkFolder: folder?.specialUse?.includes('junk') === true || folder?.type === 'junk',
      };
    },

    async listAttachments(messageId: number): Promise<AttachmentInfo[]> {
      const list = await m.messages.listAttachments(messageId);
      return list.map(a => ({ name: a.name, partName: a.partName, contentType: a.contentType, size: a.size }));
    },

    // Headers are requested explicitly: from TB 133 on they are only included
    // when asked for, and older versions ignore the option.
    async getMessageParts(messageId: number): Promise<MessagePartInfo> {
      return toPartInfo(await m.messages.getFull(messageId, { decodeHeaders: true }));
    },

    async listInlineTextParts(messageId: number): Promise<InlineTextPartInfo[]> {
      const parts = await m.messages.listInlineTextParts(messageId);
      return parts.map(p => ({ contentType: p.contentType, content: p.content }));
    },

    // Also used for inline (non-attachment) parts such as cid: images; there is
    // no other API that returns the bytes of a non-text part.
    getAttachmentFile(messageId: number, partName: string): Promise<Blob> {
      return m.messages.getAttachmentFile(messageId, partName);
    },
  };
}

function toPartInfo(p: messenger.messages.MessagePart): MessagePartInfo {
  const headers = Object.fromEntries(
    Object.entries(p.headers ?? p.rawHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    contentType: p.contentType ?? '',
    partName: p.partName ?? '',
    name: p.name ?? '',
    size: p.size ?? 0,
    headers,
    parts: (p.parts ?? []).map(toPartInfo),
  };
}

function toScanPort(port: messenger.runtime.Port): ScanPort {
  let connected = true;
  port.onDisconnect.addListener(() => { connected = false; });
  return {
    tabId: port.sender?.tab?.id,
    // Posting to a port the display side already closed throws; such events
    // have no audience anymore and are dropped.
    post: event => { if (connected) port.postMessage(event); },
    onDisconnect: listener => port.onDisconnect.addListener(() => listener()),
  };
}
