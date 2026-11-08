import { mountOverlay } from '../features/overlay';
import { writeClipboardText } from '../platform/clipboard';
import { defaultTbApi } from '../platform/tb-api';
import { createTranslate } from '../shared/i18n';

const tb = defaultTbApi();
const overlay = mountOverlay({ document, t: createTranslate((key, subs) => tb.getMessage(key, subs)), copy: writeClipboardText });
tb.connectScanPort().onEvent(overlay.handle);
