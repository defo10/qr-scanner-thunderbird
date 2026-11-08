import type { MessageKey, Translate } from '../../shared/i18n';
import type { CodeFormat } from '../../shared/types';
import {
  clampSetting, CODE_FORMATS, DEFAULT_SETTINGS, normalizeSettings, NUMERIC_RANGES,
  type BooleanSetting, type NumericSetting, type Settings,
} from './schema';

export interface OptionsViewDeps {
  readonly document: Document;
  readonly t: Translate;
  readonly initial: Settings;
  readonly save: (settings: Settings) => Promise<void>;
}

const SOURCES: readonly [BooleanSetting, MessageKey][] = [
  ['scanImageAttachments', 'sourceImageAttachments'],
  ['scanInlineImages', 'sourceInlineImages'],
  ['scanPdfs', 'sourcePdfs'],
];

const LIMITS: readonly [NumericSetting, MessageKey][] = [
  ['maxAttachmentMB', 'limitMaxAttachmentMB'],
  ['maxImageMegapixels', 'limitMaxImageMegapixels'],
  ['maxPdfPages', 'limitMaxPdfPages'],
  ['perAttachmentTimeoutSec', 'limitPerAttachmentTimeoutSec'],
];

// Every change is saved right away; the form never holds unsaved state. The
// current settings live only here and are replaced as a whole on each change.
export function mountOptions(root: HTMLElement, deps: OptionsViewDeps): void {
  const { document: doc, t } = deps;
  let current = deps.initial;
  const refreshers: (() => void)[] = [];

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string } = {}) => {
    const node = doc.createElement(tag);
    if (props.className) node.className = props.className;
    if (props.text !== undefined) node.textContent = props.text;
    return node;
  };

  const status = el('p', { className: 'status' });
  status.setAttribute('role', 'status');

  const commit = (next: Settings) => {
    current = normalizeSettings(next);
    deps.save(current).then(
      () => { status.textContent = t('optionsSaved'); },
      () => { status.textContent = t('optionsSaveFailed'); },
    );
  };

  const checkbox = (label: string, isChecked: () => boolean, onToggle: (checked: boolean, input: HTMLInputElement) => void) => {
    const wrapper = el('label', { className: 'check' });
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => onToggle(input.checked, input));
    refreshers.push(() => { input.checked = isChecked(); });
    wrapper.append(input, ` ${label}`);
    return wrapper;
  };

  const fieldset = (legend: MessageKey, ...children: Node[]) => {
    const set = el('fieldset');
    set.append(el('legend', { text: t(legend) }), ...children);
    return set;
  };

  const autoScan = checkbox(t('optionsAutoScan'), () => current.autoScan, checked => commit({ ...current, autoScan: checked }));
  const autoScanHint = el('p', { className: 'hint', text: t('optionsAutoScanHint') });

  const sources = SOURCES.map(([key, label]) =>
    checkbox(t(label), () => current[key], checked => commit({ ...current, [key]: checked })));

  const formatsMessage = el('p', { className: 'message' });
  const formats = CODE_FORMATS.map(format =>
    checkbox(t(`format${format}`), () => current.formats.includes(format), (checked, input) => {
      const next: CodeFormat[] = checked ? [...current.formats, format] : current.formats.filter(f => f !== format);
      if (next.length === 0) {
        input.checked = true;
        formatsMessage.textContent = t('formatsAtLeastOne');
        return;
      }
      formatsMessage.textContent = '';
      commit({ ...current, formats: CODE_FORMATS.filter(f => next.includes(f)) });
    }));

  const limits = LIMITS.map(([key, label]) => {
    const { min, max } = NUMERIC_RANGES[key];
    const wrapper = el('label', { className: 'limit' });
    const input = el('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.name = key;
    const message = el('span', { className: 'message' });
    const isValid = () => {
      const value = Number(input.value);
      return input.value !== '' && Number.isInteger(value) && value >= min && value <= max;
    };
    input.addEventListener('input', () => {
      const valid = isValid();
      input.setAttribute('aria-invalid', String(!valid));
      message.textContent = valid ? '' : t('limitOutOfRange', min, max);
    });
    input.addEventListener('change', () => {
      const value = clampSetting(key, input.value === '' ? Number.NaN : Number(input.value));
      input.value = String(value);
      input.setAttribute('aria-invalid', 'false');
      message.textContent = '';
      commit({ ...current, [key]: value });
    });
    refreshers.push(() => { input.value = String(current[key]); });
    wrapper.append(el('span', { text: t(label) }), input, message);
    return wrapper;
  });

  const reset = el('button', { text: t('optionsReset') });
  reset.type = 'button';
  reset.addEventListener('click', () => {
    formatsMessage.textContent = '';
    commit(DEFAULT_SETTINGS);
    refreshers.forEach(r => r());
  });

  root.replaceChildren(
    el('h1', { text: t('optionsTitle') }),
    autoScan,
    autoScanHint,
    fieldset('optionsSources', ...sources),
    fieldset('optionsFormats', ...formats, formatsMessage),
    fieldset('optionsLimits', ...limits),
    reset,
    status,
  );
  refreshers.forEach(r => r());
}
