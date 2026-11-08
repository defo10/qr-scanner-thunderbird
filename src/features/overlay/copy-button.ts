import type { Translate } from '../../shared/i18n';

const FEEDBACK_MS = 1500;

// The clipboard write must happen inside the click handler: it relies on the
// user gesture.
export function copyButton(doc: Document, t: Translate, copy: (text: string) => Promise<void>, text: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.className = 'copy';
  button.type = 'button';
  button.textContent = t('copy');
  let reset: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', () => {
    clearTimeout(reset);
    copy(text).then(
      () => { button.textContent = t('copied'); },
      () => { button.textContent = t('copyFailed'); },
    ).finally(() => {
      reset = setTimeout(() => { button.textContent = t('copy'); }, FEEDBACK_MS);
    });
  });
  return button;
}
