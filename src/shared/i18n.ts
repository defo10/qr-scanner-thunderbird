import type en from '../../static/_locales/en/messages.json';

export type MessageKey = keyof typeof en;
export type Translate = (key: MessageKey, ...substitutions: (string | number)[]) => string;

export function createTranslate(getMessage: (key: string, substitutions: string[]) => string): Translate {
  return (key, ...subs) => getMessage(key, subs.map(String));
}
