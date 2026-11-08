import type { DecodedCode, ScanEntry, SourceRef } from '../../shared/types';

const keyOf = (c: Pick<DecodedCode, 'format' | 'bytesB64'>) => `${c.format}\n${c.bytesB64}`;

const sameSource = (a: SourceRef, b: SourceRef) => JSON.stringify(a) === JSON.stringify(b);

// Codes are the same when format and payload bytes match; the same payload in
// a different symbology stays a separate entry. First-seen order is kept.
export function mergeCodes(entries: readonly ScanEntry[], incoming: readonly DecodedCode[], source: SourceRef): ScanEntry[] {
  return incoming.reduce<ScanEntry[]>((acc, code) => {
    const i = acc.findIndex(e => keyOf(e) === keyOf(code));
    const existing = acc[i];
    if (!existing) return [...acc, { ...code, sources: [source] }];
    if (existing.sources.some(s => sameSource(s, source))) return acc;
    return acc.with(i, { ...existing, sources: [...existing.sources, source] });
  }, [...entries]);
}
