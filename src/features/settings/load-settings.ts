import { normalizeSettings, type Settings } from './schema';

export const SETTINGS_KEY = 'settings';

export interface SettingsStore {
  get(key: string): Promise<unknown>;
}

export async function loadSettings(store: SettingsStore): Promise<Settings> {
  return normalizeSettings(await store.get(SETTINGS_KEY).catch(() => undefined));
}
