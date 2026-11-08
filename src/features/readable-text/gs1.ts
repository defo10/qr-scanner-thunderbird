import type { DecodedCode } from '../../shared/types';
import { AI_TABLE } from './gs1-ai-table';

const GS = '\x1D';
const GS1_SYMBOLOGY_IDS = new Set([']d2', ']Q3', ']C1', ']e0']);

export function isGs1(code: Pick<DecodedCode, 'contentKind' | 'symbologyId'>): boolean {
  return code.contentKind === 'GS1' || GS1_SYMBOLOGY_IDS.has(code.symbologyId);
}

// Parses a GS1 element string into bracketed HRI, e.g. "(01)…(17)…(10)…".
// - Variable-length fields end at the GS separator or at the end of the string.
// - A GS after a fixed-length field is tolerated.
// - Returns null on unknown AIs or malformed fields, so callers can fall back
//   to showing the raw string.
export function toHri(raw: string): string | null {
  let rest = raw.startsWith(GS) ? raw.slice(1) : raw;
  let hri = '';
  while (rest.length > 0) {
    const ai = [2, 3, 4].map(n => rest.slice(0, n)).find(p => AI_TABLE.has(p));
    const spec = ai === undefined ? undefined : AI_TABLE.get(ai);
    if (ai === undefined || !spec) return null;
    rest = rest.slice(ai.length);
    let data: string;
    if (spec.fixed) {
      data = rest.slice(0, spec.length);
      if (data.length !== spec.length || data.includes(GS)) return null;
      rest = rest.slice(spec.length);
    } else {
      const end = rest.indexOf(GS);
      data = end < 0 ? rest : rest.slice(0, end);
      if (data.length === 0 || data.length > spec.length) return null;
      rest = rest.slice(data.length);
    }
    if (rest.startsWith(GS)) rest = rest.slice(1);
    hri += `(${ai})${data}`;
  }
  return hri === '' ? null : hri;
}
