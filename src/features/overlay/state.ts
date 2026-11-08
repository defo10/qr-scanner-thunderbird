import type { ScanEvent } from '../../shared/port-protocol';
import type { ScanEntry, SourceError } from '../../shared/types';
import { mergeCodes } from './dedupe';

export interface OverlayState {
  readonly phase: 'waiting' | 'scanning' | 'done' | 'idle';
  readonly entries: readonly ScanEntry[];
  readonly errors: readonly SourceError[];
  readonly minimized: boolean;
}

export type UiAction = { readonly type: 'minimize' } | { readonly type: 'restore' };

export const initialOverlayState: OverlayState = {
  phase: 'waiting',
  entries: [],
  errors: [],
  minimized: false,
};

export function reduce(s: OverlayState, e: ScanEvent | UiAction): OverlayState {
  switch (e.type) {
    case 'scan-started':
      return { ...s, phase: 'scanning' };
    case 'codes':
      return { ...s, entries: mergeCodes(s.entries, e.codes, e.source) };
    case 'source-error':
      return { ...s, errors: [...s.errors, { source: e.source, reason: e.reason, ...(e.detail ? { detail: e.detail } : {}) }] };
    case 'scan-finished':
      return { ...s, phase: 'done' };
    case 'idle':
    case 'manual-available':
      return { ...s, phase: 'idle' };
    case 'minimize':
      return { ...s, minimized: true };
    case 'restore':
      return { ...s, minimized: false };
  }
}

// Nothing is shown before the first result, so messages without codes never
// flash an empty panel.
export function isVisible(s: OverlayState): boolean {
  return s.entries.length > 0 || s.errors.length > 0;
}
