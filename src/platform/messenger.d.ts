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
