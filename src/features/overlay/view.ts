import { splitUrl } from '../readable-text';
import type { Translate } from '../../shared/i18n';
import type { ScanEntry, SourceError, SourceRef } from '../../shared/types';
import { copyButton } from './copy-button';
import { overlayStyles } from './overlay-styles';
import { isVisible, type OverlayState, type UiAction } from './state';

export interface OverlayViewDeps {
  readonly document: Document;
  readonly t: Translate;
  readonly copy: (text: string) => Promise<void>;
  readonly dispatch: (action: UiAction) => void;
}

export interface OverlayView {
  render(state: OverlayState): void;
  /** The closed shadow root, unreachable from the page; exposed for tests. */
  shadowRoot(): ShadowRoot | null;
}

// - Decoded content is attacker-controlled: it is only ever assigned through
//   textContent, never parsed as HTML.
// - Rows are cached per entry object, so re-rendering on every scan event
//   keeps an in-progress "Copied" feedback intact.
export function createOverlayView(deps: OverlayViewDeps): OverlayView {
  const { document: doc, t } = deps;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  const rows = new WeakMap<ScanEntry, HTMLElement>();

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const button = (className: string, text: string, title: string, action: UiAction): HTMLButtonElement => {
    const b = el('button', className, text);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => deps.dispatch(action));
    return b;
  };

  const sourceLabel = (s: SourceRef): string => {
    if (s.kind === 'inline') return s.name ? `${t('inlineImage')} (${s.name})` : t('inlineImage');
    return s.page === undefined ? s.name : t('sourceWithPage', s.name, s.page);
  };

  const valueNode = (entry: ScanEntry): HTMLElement => {
    const value = el('div', 'value');
    const url = splitUrl(entry.text);
    if (url) value.append(url.beforeHost, el('b', undefined, url.host), url.afterHost);
    else value.textContent = entry.text;
    return value;
  };

  const row = (entry: ScanEntry): HTMLElement => {
    const cached = rows.get(entry);
    if (cached) return cached;
    const li = el('li', 'entry');
    const meta = el('div', 'meta', `${t(`format${entry.format}`)} · ${entry.sources.map(sourceLabel)[0] ?? ''}`);
    li.append(meta, valueNode(entry), copyButton(doc, t, deps.copy, entry.text));
    rows.set(entry, li);
    return li;
  };

  const errorLine = (e: SourceError): HTMLElement =>
    el('li', 'error', e.reason === 'unreadable' ? t('errorUnreadable', sourceLabel(e.source)) : t('errorGeneric', sourceLabel(e.source)));

  const countLabel = (n: number) => (n === 1 ? t('codesCountOne') : t('codesCountOther', n));

  const panel = (s: OverlayState): HTMLElement => {
    const section = el('section', 'panel');
    section.setAttribute('aria-label', t('overlayLabel'));
    const header = el('header');
    header.append(el('span', 'icon', '▦'), el('span', 'count', countLabel(s.entries.length)));
    if (s.phase === 'scanning') {
      const spinner = el('span', 'spinner');
      spinner.setAttribute('role', 'status');
      spinner.setAttribute('aria-label', t('scanning'));
      header.append(spinner);
    }
    header.append(button('minimize', '–', t('minimize'), { type: 'minimize' }), button('close', '✕', t('close'), { type: 'close' }));
    const list = el('ol', 'list');
    list.append(...s.entries.map(row));
    section.append(header, list);
    if (s.errors.length > 0) {
      const errors = el('ul', 'errors');
      errors.append(...s.errors.map(errorLine));
      section.append(errors);
    }
    return section;
  };

  const mount = (): ShadowRoot => {
    if (root) return root;
    host = doc.createElement('qr-scanner-overlay');
    host.style.cssText = 'position: fixed; top: 8px; left: 8px; z-index: 2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    doc.documentElement.append(host);
    return root;
  };

  return {
    render(state) {
      if (!isVisible(state)) {
        host?.remove();
        host = null;
        root = null;
        return;
      }
      const style = el('style', undefined, overlayStyles);
      const content = state.minimized
        ? button('badge', `▦ ${state.entries.length}`, t('restore'), { type: 'restore' })
        : panel(state);
      mount().replaceChildren(style, content);
    },
    shadowRoot: () => root,
  };
}
