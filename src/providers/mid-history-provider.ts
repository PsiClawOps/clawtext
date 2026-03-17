import { classifyContentType } from '../content-type-classifier.js';
import { scoreMessages } from '../journal-context-scorer.js';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import type { HistoryMessage } from './recent-history-provider.js';

type MessageResolver = (ctx: SlotContext) => HistoryMessage[];

export interface MidHistoryProviderOptions {
  getMessages: MessageResolver;
  minScore?: number;
  avgMessageBytes?: number;
  totalBudgetRatio?: number;
  recentHistoryRatio?: number;
}

const DEFAULT_MIN_SCORE = 0.25;

function estimateRecentCount(
  messages: HistoryMessage[],
  ctx: SlotContext,
  avgFallback: number,
  totalBudgetRatio: number,
  recentHistoryRatio: number,
): number {
  if (messages.length === 0) return 0;
  const avg = Math.max(
    1,
    Math.floor(
      messages.reduce((sum, message) => sum + Buffer.byteLength(String(message.content ?? ''), 'utf8'), 0) /
        messages.length,
    ) || avgFallback,
  );

  const estimatedRecentBudget = Math.floor(ctx.modelContextWindowTokens * 4 * totalBudgetRatio * recentHistoryRatio);
  return Math.max(1, Math.floor(estimatedRecentBudget / avg));
}

function parseTimestamp(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return null;
}

function applyHalfLife(score: number, ts: number | null, halfLifeDays: number): number {
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    return halfLifeDays === 0 ? 0 : score;
  }

  if (!ts) return score;
  const ageDays = Math.max(0, Date.now() - ts) / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, ageDays / halfLifeDays);
  return score * decay;
}

function firstSentence(content: string): string {
  const sentence = content.trim().split(/(?<=[.!?])\s+/)[0] ?? content.trim();
  return sentence.trim();
}

function decisionSentence(content: string): string | null {
  const match = content.match(/([^\n.!?]*\b(decided|the approach is|we(?:'|’)ll go with|the plan is)\b[^\n.!?]*[.!?]?)/i);
  return match ? match[1].trim() : null;
}

export class MidHistoryProvider implements SlotProvider {
  readonly id = 'mid-history';
  readonly source = 'mid-history' as const;
  readonly priority = 60;
  readonly prunable = true;

  private readonly getMessages: MessageResolver;
  private readonly minScore: number;
  private readonly avgMessageBytes: number;
  private readonly totalBudgetRatio: number;
  private readonly recentHistoryRatio: number;

  constructor(options: MidHistoryProviderOptions) {
    this.getMessages = options.getMessages;
    this.minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    this.avgMessageBytes = Math.max(32, Math.floor(options.avgMessageBytes ?? 280));
    this.totalBudgetRatio = Math.max(0, options.totalBudgetRatio ?? 0.15);
    this.recentHistoryRatio = Math.max(0, options.recentHistoryRatio ?? 0.12);
  }

  available(ctx: SlotContext): boolean {
    const messages = this.getMessages(ctx);
    const recentCount = estimateRecentCount(
      messages,
      ctx,
      this.avgMessageBytes,
      this.totalBudgetRatio,
      this.recentHistoryRatio,
    );
    return messages.length > recentCount;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const messages = this.getMessages(ctx);
    const recentCount = estimateRecentCount(
      messages,
      ctx,
      this.avgMessageBytes,
      this.totalBudgetRatio,
      this.recentHistoryRatio,
    );
    const midRange = messages.slice(0, Math.max(0, messages.length - recentCount));

    const scored = scoreMessages(
      midRange.map((message) => ({ content: message.content, ts: message.ts })),
      {
        maxBytes: Number.MAX_SAFE_INTEGER,
        maxMessages: midRange.length,
        minScore: 0,
      },
    );

    const candidates = scored
      .map((item, index) => {
        const original = midRange[index];
        const content = String(original?.content ?? '');
        const classification = classifyContentType(content);
        const ts = parseTimestamp(original?.ts);

        let score = item.score;
        score = applyHalfLife(score, ts, classification.halfLifeDays);

        if (classification.type === 'ack' || classification.type === 'noise') {
          score = 0;
        }

        return {
          original,
          content,
          score,
          classification,
          bytes: Buffer.byteLength(content, 'utf8'),
        };
      })
      .filter((item) => item.score >= this.minScore)
      .sort((a, b) => b.score - a.score);

    const selected: ContextSlot[] = [];
    let bytesUsed = 0;
    for (const item of candidates) {
      if (bytesUsed + item.bytes > budgetBytes) continue;
      selected.push({
        id: item.original.id ?? `mid-history:${selected.length + 1}`,
        source: this.source,
        content: item.content,
        score: item.score,
        bytes: item.bytes,
        included: false,
        reason: `mid score ${item.score.toFixed(2)} (${item.classification.type})`,
      });
      bytesUsed += item.bytes;
    }

    return selected;
  }

  prune(slots: ContextSlot[], targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (slots.length === 0) return [];

    const compacted = slots
      .map((slot) => {
        const classification = classifyContentType(slot.content);
        if (classification.type === 'ack') return null;

        const first = firstSentence(slot.content);
        const decision = decisionSentence(slot.content);
        const compact = decision && decision !== first ? `${first} Decision: ${decision}` : first;

        const content = compact.trim();
        return {
          ...slot,
          content,
          bytes: Buffer.byteLength(content, 'utf8'),
          score:
            classification.type === 'decision'
              ? Math.max(slot.score, 0.9)
              : classification.type === 'preference'
                ? Math.max(slot.score, 0.8)
                : slot.score,
          reason: `${slot.reason} prune:compressed(a=${aggressiveness.toFixed(2)})`,
          included: true,
        };
      })
      .filter((slot): slot is ContextSlot => Boolean(slot));

    const originalBytes = slots.reduce((sum, slot) => sum + slot.bytes, 0);
    let retained = [...compacted];
    let retainedBytes = retained.reduce((sum, slot) => sum + slot.bytes, 0);

    while (originalBytes - retainedBytes < targetFreeBytes && retained.length > 1) {
      const dropIndex = retained.findIndex((slot) => {
        const type = classifyContentType(slot.content).type;
        return type !== 'decision' && type !== 'preference';
      });
      if (dropIndex < 0) break;
      retained.splice(dropIndex, 1);
      retainedBytes = retained.reduce((sum, slot) => sum + slot.bytes, 0);
    }

    return retained;
  }
}
