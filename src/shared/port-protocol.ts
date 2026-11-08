import type { DecodedCode, ErrorReason, SourceRef } from './types';

/** Background → display script, streamed over the scan port. */
export type ScanEvent =
  | { readonly type: 'scan-started'; readonly sourceCount: number }
  | { readonly type: 'codes'; readonly source: SourceRef; readonly codes: readonly DecodedCode[] }
  | { readonly type: 'source-error'; readonly source: SourceRef; readonly reason: ErrorReason; readonly detail?: Readonly<Record<string, number>> }
  | { readonly type: 'scan-finished' }
  // Nothing to scan: no single displayed message, junk, or no scannable sources.
  | { readonly type: 'idle' };
