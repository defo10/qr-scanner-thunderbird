// Hand-written subset of the Thunderbird MV3 WebExtension API that this
// extension uses. The published @types package predates the TB 128 APIs.

declare namespace messenger {
  interface WebExtEvent<Listener extends (...args: never[]) => unknown> {
    addListener(listener: Listener): void;
    removeListener(listener: Listener): void;
    hasListener(listener: Listener): boolean;
  }

  namespace runtime {
    interface MessageSender {
      tab?: { id?: number };
      id?: string;
      url?: string;
    }

    interface Port {
      readonly name: string;
      readonly sender?: MessageSender;
      readonly error?: { message: string } | null;
      postMessage(message: unknown): void;
      disconnect(): void;
      readonly onMessage: WebExtEvent<(message: unknown, port: Port) => void>;
      readonly onDisconnect: WebExtEvent<(port: Port) => void>;
    }

    const onConnect: WebExtEvent<(port: Port) => void>;
    function connect(connectInfo?: { name?: string }): Port;
    function getURL(path: string): string;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const session: StorageArea;
  }

  namespace i18n {
    function getMessage(messageName: string, substitutions?: string | string[]): string;
  }

  namespace folders {
    interface MailFolder {
      accountId?: string;
      path?: string;
      specialUse?: string[];
      /** Pre-TB 121 single special-use type. */
      type?: string;
    }
  }

  namespace messages {
    interface MessageHeader {
      id: number;
      junk?: boolean;
      folder?: folders.MailFolder;
      subject?: string;
    }

    interface MessageList {
      id: string | null;
      messages: MessageHeader[];
    }

    interface MessageAttachment {
      contentType: string;
      name: string;
      partName: string;
      size: number;
      contentId?: string;
    }

    interface MessagePart {
      contentType?: string;
      partName?: string;
      name?: string;
      size?: number;
      headers?: Record<string, string[]>;
      rawHeaders?: Record<string, string[]>;
      parts?: MessagePart[];
    }

    interface InlineTextPart {
      contentType: string;
      content: string;
    }

    function getFull(messageId: number, options?: { decodeContent?: boolean; decodeHeaders?: boolean; decrypt?: boolean }): Promise<MessagePart>;
    function listInlineTextParts(messageId: number): Promise<InlineTextPart[]>;
    function listAttachments(messageId: number): Promise<MessageAttachment[]>;
    function getAttachmentFile(messageId: number, partName: string): Promise<File>;
  }

  namespace messageDisplay {
    function getDisplayedMessages(tabId?: number): Promise<messages.MessageList | messages.MessageHeader[]>;
  }

  namespace scripting.messageDisplay {
    interface MessageDisplayScriptDetails {
      id: string;
      js?: string[];
      css?: string[];
      runAt?: 'document_start' | 'document_end' | 'document_idle';
    }

    function registerScripts(scripts: MessageDisplayScriptDetails[]): Promise<void>;
    function getRegisteredScripts(filter?: { ids?: string[] }): Promise<MessageDisplayScriptDetails[]>;
    function unregisterScripts(filter?: { ids?: string[] }): Promise<void>;
  }
}
