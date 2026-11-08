import type { TbApi } from '../../platform/tb-api';
import type { ScanEvent } from '../../shared/port-protocol';
import type { CodeFormat } from '../../shared/types';
import { planSources, type PlannedSource } from './plan-sources';
import type { WorkerClient } from './worker-client';

export interface ScanSettings {
  readonly formats: readonly CodeFormat[];
}

export type ScanTb = Pick<TbApi, 'getDisplayedMessage' | 'listAttachments' | 'getAttachmentFile'>;

export interface ScanContext {
  readonly tb: ScanTb;
  readonly worker: WorkerClient;
  readonly settings: ScanSettings;
  readonly tabId: number;
}

export type Emit = (event: ScanEvent) => void;

// Sources are scanned one after another in attachment order, and each
// source's result is emitted as soon as it is known.
export async function runScan(ctx: ScanContext, emit: Emit): Promise<void> {
  const message = await ctx.tb.getDisplayedMessage(ctx.tabId);
  if (!message || message.junk || message.inJunkFolder) return emit({ type: 'idle' });
  const sources = planSources(await ctx.tb.listAttachments(message.id));
  if (sources.length === 0) return emit({ type: 'idle' });
  emit({ type: 'scan-started', sourceCount: sources.length });
  for (const source of sources) await scanSource(ctx, message.id, source, emit);
  emit({ type: 'scan-finished' });
}

async function scanSource(ctx: ScanContext, messageId: number, source: PlannedSource, emit: Emit): Promise<void> {
  let bytes: ArrayBuffer;
  try {
    bytes = await (await ctx.tb.getAttachmentFile(messageId, source.partName)).arrayBuffer();
  } catch {
    return emit({ type: 'source-error', source: source.ref, reason: 'unreadable' });
  }
  const outcome = await ctx.worker.run(
    { kind: 'image', bytes, mime: source.mime, decode: { formats: ctx.settings.formats } },
    codes => { if (codes.length > 0) emit({ type: 'codes', source: source.ref, codes }); },
  ).catch(() => ({ ok: false, reason: 'unreadable' }) as const);
  if (!outcome.ok) emit({ type: 'source-error', source: source.ref, reason: outcome.reason });
}
