import type { DecodedCode } from '../../shared/types';
import { isGs1, toHri } from './gs1';
import { splitUrl } from './url';

export type DisplayKind = 'gs1' | 'binary' | 'url' | 'text';

export interface DisplayText {
  readonly kind: DisplayKind;
  /** What the overlay shows. */
  readonly text: string;
  /** What the default Copy button puts on the clipboard. */
  readonly copy: string;
  /** Bracketed GS1 form for "Copy as HRI"; null when not GS1 or unparsable. */
  readonly hri: string | null;
}

export function toDisplay(code: DecodedCode): DisplayText {
  if (code.contentKind === 'Binary') {
    return { kind: 'binary', text: code.bytesB64, copy: code.bytesB64, hri: null };
  }
  if (isGs1(code)) {
    const hri = toHri(code.text);
    return { kind: 'gs1', text: hri ?? withControlPictures(code.text), copy: code.text, hri };
  }
  const kind = splitUrl(code.text) ? 'url' : 'text';
  return { kind, text: withControlPictures(code.text), copy: code.text, hri: null };
}

// C0 controls and DEL become their Unicode "control pictures" (GS → ␝,
// RS → ␞, EOT → ␄). Tab and line breaks stay as they are, because multi-line
// payloads such as vCards are meant to be read as lines.
export function withControlPictures(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, c => {
    const code = c.charCodeAt(0);
    return String.fromCharCode(code === 0x7f ? 0x2421 : 0x2400 + code);
  });
}
