import type { ScanEvent } from '../../shared/port-protocol';
import { settingsHash } from './settings-hash';

export type ResultEvent = Extract<ScanEvent, { type: 'codes' | 'source-error' }>;

export interface CachedScan {
  readonly sourceCount: number;
  readonly events: readonly ResultEvent[];
}

export interface SessionStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface ScanCache {
  read(messageId: number, settings: object): Promise<CachedScan | null>;
  write(messageId: number, settings: object, scan: CachedScan): Promise<void>;
}

// - Backed by session storage only, so decoded content never reaches disk.
// - Message ids are only stable within a Thunderbird session, which matches
//   the lifetime of session storage.
// - The key includes a hash of every result-affecting setting, so a settings
//   change is a cache miss without explicit invalidation.
export function createScanCache(store: SessionStore): ScanCache {
  const keyOf = (messageId: number, settings: object) => `scan:v1:${messageId}:${settingsHash(settings)}`;
  return {
    async read(messageId, settings) {
      const value = await store.get(keyOf(messageId, settings)).catch(() => undefined);
      return isCachedScan(value) ? value : null;
    },
    async write(messageId, settings, scan) {
      await store.set(keyOf(messageId, settings), scan).catch(() => undefined);
    },
  };
}

function isCachedScan(value: unknown): value is CachedScan {
  return typeof value === 'object' && value !== null &&
    typeof (value as CachedScan).sourceCount === 'number' && Array.isArray((value as CachedScan).events);
}
