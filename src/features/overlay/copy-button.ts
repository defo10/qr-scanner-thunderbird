import type { MessageKey, Translate } from '../../shared/i18n';

const FEEDBACK_MS = 1500;

// The clipboard write must happen inside the click handler: it relies on the
// user gesture.
export function copyButton(
  doc: Document,
  t: Translate,
  copy: (text: string) => Promise<void>,
  text: string,
  label: MessageKey = 'copy',
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.className = 'copy';
  button.type = 'button';
  button.textContent = t(label);
  let reset: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', () => {
    clearTimeout(reset);
    attempt(() => copy(text)).then(
      () => { button.textContent = t('copied'); },
      () => { button.textContent = t('copyFailed'); },
    ).finally(() => {
      reset = setTimeout(() => { button.textContent = t(label); }, FEEDBACK_MS);
    });
  });
  return button;
}

// Turns a synchronous throw into a rejection, so every failure shows feedback.
function attempt(write: () => Promise<void>): Promise<void> {
  try {
    return write();
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}
