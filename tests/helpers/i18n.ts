import en from '../../static/_locales/en/messages.json';
import { createTranslate, type Translate } from '../../src/shared/i18n';

const catalog: Record<string, { message: string }> = en;

/** Mirrors messenger.i18n.getMessage: positional $1…$9 substitutions, "" for unknown keys. */
export function englishMessage(key: string, substitutions: string[] = []): string {
  const message = catalog[key]?.message ?? '';
  return message.replace(/\$(\d)/g, (_, n: string) => substitutions[Number(n) - 1] ?? '');
}

export const englishTranslate: Translate = createTranslate(englishMessage);
