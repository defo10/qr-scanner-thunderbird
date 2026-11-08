import { findDataUriImages, findInlineImageParts, type DataUriImage, type InlineImagePart } from '../inline-images';
import type { Settings } from '../settings';
import type { TbApi } from '../../platform/tb-api';
import type { ScanEvent } from '../../shared/port-protocol';
import { sizeLimitExceeded } from './limits';
import { planSources, type PlannedSource } from './plan-sources';
import type { ResultEvent, ScanCache } from './session-cache';
import type { WorkerClient } from './worker-client';

export type ScanSettings = Settings;

export type ScanTb = Pick<
  TbApi,
  'getDisplayedMessage' | 'listAttachments' | 'getAttachmentFile' | 'getMessageParts' | 'listInlineTextParts'
>;

export interface ScanContext {
  readonly tb: ScanTb;
  readonly worker: WorkerClient;
  readonly cache: ScanCache;
  readonly signal: AbortSignal;
  readonly htmlParser: DOMParser;
  readonly settings: ScanSettings;
  readonly tabId: number;
}

export type Emit = (event: ScanEvent) => void;

// - Sources are scanned one after another, and each source's result is
//   emitted as soon as it is known.
// - Once the signal aborts (the message is no longer displayed), nothing more
//   is emitted and nothing is cached; only complete scans are cached.
// - A cache hit replays the same event sequence a fresh scan would produce.
export async function runScan(ctx: ScanContext, emitEvent: Emit): Promise<void> {
  const emit: Emit = e => { if (!ctx.signal.aborted) emitEvent(e); };
  const message = await ctx.tb.getDisplayedMessage(ctx.tabId);
  if (!message || message.junk || message.inJunkFolder) return emit({ type: 'idle' });

  const cached = await ctx.cache.read(message.id, ctx.settings);
  if (cached) {
    emit({ type: 'scan-started', sourceCount: cached.sourceCount });
    cached.events.forEach(emit);
    return emit({ type: 'scan-finished' });
  }

  const [attachments, inline] = await Promise.all([
    ctx.tb.listAttachments(message.id),
    ctx.settings.scanInlineImages ? findInlineSources(ctx, message.id) : { inlineParts: [], dataUris: [] },
  ]);
  const sources = planSources({ attachments, ...inline });
  if (sources.length === 0) return emit({ type: 'idle' });

  const results: ResultEvent[] = [];
  const emitResult = (e: ResultEvent) => { results.push(e); emit(e); };
  emit({ type: 'scan-started', sourceCount: sources.length });
  for (const source of sources) {
    if (ctx.signal.aborted) return;
    await scanSource(ctx, message.id, source, emitResult);
  }
  if (ctx.signal.aborted) return;
  emit({ type: 'scan-finished' });
  await ctx.cache.write(message.id, ctx.settings, { sourceCount: sources.length, events: results });
}

// Inline discovery is best effort: a message whose structure or body cannot be
// read still gets its attachments scanned.
async function findInlineSources(
  ctx: ScanContext,
  messageId: number,
): Promise<{ inlineParts: InlineImagePart[]; dataUris: DataUriImage[] }> {
  const [inlineParts, dataUris] = await Promise.all([
    ctx.tb.getMessageParts(messageId).then(findInlineImageParts, () => []),
    ctx.tb.listInlineTextParts(messageId).then(
      parts => parts
        .filter(p => p.contentType.toLowerCase() === 'text/html')
        .flatMap(p => findDataUriImages(p.content, ctx.htmlParser)),
      () => [],
    ),
  ]);
  return { inlineParts, dataUris };
}

async function readBytes(ctx: ScanContext, messageId: number, source: PlannedSource): Promise<ArrayBuffer> {
  if (source.bytes.from === 'memory') return source.bytes.bytes.slice().buffer;
  return (await ctx.tb.getAttachmentFile(messageId, source.bytes.partName)).arrayBuffer();
}

async function scanSource(ctx: ScanContext, messageId: number, source: PlannedSource, emit: (e: ResultEvent) => void): Promise<void> {
  const tooLarge = sizeLimitExceeded(source.size, ctx.settings);
  if (tooLarge) return emit({ type: 'source-error', source: source.ref, reason: 'too-large', detail: tooLarge });
  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(ctx, messageId, source);
  } catch {
    return emit({ type: 'source-error', source: source.ref, reason: 'unreadable' });
  }
  const { formats, maxImageMegapixels, perAttachmentTimeoutSec } = ctx.settings;
  const outcome = await ctx.worker.run(
    { kind: 'image', bytes, mime: source.mime, decode: { formats }, maxMegapixels: maxImageMegapixels },
    codes => { if (codes.length > 0) emit({ type: 'codes', source: source.ref, codes }); },
    { signal: ctx.signal, timeoutMs: perAttachmentTimeoutSec * 1000 },
  ).catch(() => ({ status: 'error', reason: 'unreadable' }) as const);
  if (outcome.status !== 'error') return;
  const detail = outcome.reason === 'timeout' ? { seconds: perAttachmentTimeoutSec } : undefined;
  emit({ type: 'source-error', source: source.ref, reason: outcome.reason, ...(detail ? { detail } : {}) });
}
