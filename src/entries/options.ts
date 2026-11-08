import { loadSettings, mountOptions, SETTINGS_KEY } from '../features/settings';
import { defaultTbApi } from '../platform/tb-api';
import { createTranslate } from '../shared/i18n';

const tb = defaultTbApi();
const t = createTranslate((key, subs) => tb.getMessage(key, subs));
const root = document.getElementById('options');

document.title = t('optionsTitle');
if (root) {
  void loadSettings(tb.localStore).then(initial => mountOptions(root, {
    document,
    t,
    initial,
    save: settings => tb.localStore.set(SETTINGS_KEY, settings),
  }));
}
