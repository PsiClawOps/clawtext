import { classifyContentType } from '../content-type-classifier.js';
import { contradicts } from '../contradiction-detector.js';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import type { HistoryMessage } from './recent-history-provider.js';

type MessageResolver = (ctx: SlotContext) => HistoryMessage[];

export interface DeepHistoryProviderOptions {
  getMessages: MessageResolver;
  avgMessageBytes?: number;
  totalBudgetRatio?: number;
  recentHistoryRatio?: number;
  midHistoryRatio?: number;
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

function estimateCount(messages: HistoryMessage[], budgetBytes: number, fallback: number): number {
  if (messages.length === 0) return 0;
  const avg = Math.max(
    1,
    Math.floor(
      messages.reduce((sum, message) => sum + Buffer.byteLength(String(message.content ?? ''), 'utf8'), 0) /
        messages.length,
    ) || fallback,
  );

  return Math.max(1, Math.floor(budgetBytes / avg));
}

function halfLifeAdjustedScore(content: string, ts: number | null): number {
  const classification = classifyContentType(content);

  if (classification.type === 'decision') return 1;

  const baseScoreByType: Partial<Record<typeof classification.type, number>> = {
    spec: 0.75,
    preference: 0.72,
    skill: 0.65,
    attribute: 0.55,
  };

  const baseScore = baseScoreByType[classification.type] ?? 0;
  if (baseScore <= 0) return 0;

  if (!ts) return baseScore;
  const ageDays = Math.max(0, Date.now() - ts) / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, ageDays / classification.halfLifeDays);
  return baseScore * decay;
}

function firstSentence(content: string): string {
  return (content.trim().split(/(?<=[.!?])\s+/)[0] ?? content.trim()).trim();
}

const DEEP_ELIGIBLE_TYPES = new Set(['decision', 'spec', 'preference', 'skill', 'attribute']);

export class DeepHistoryProvider implements SlotProvider {
  readonly id = 'deep-history';
  readonly source = 'deep-history' as const;
  readonly priority = 40;
  readonly prunable = true;

  private readonly getMessages: MessageResolver;
  private readonly avgMessageBytes: number;
  private readonly totalBudgetRatio: number;
  private readonly recentHistoryRatio: number;
  private readonly midHistoryRatio: number;

  constructor(options: DeepHistoryProviderOptions) {
    this.getMessages = options.getMessages;
    this.avgMessageBytes = Math.max(32, Math.floor(options.avgMessageBytes ?? 280));
    this.totalBudgetRatio = Math.max(0, options.totalBudgetRatio ?? 0.15);
    this.recentHistoryRatio = Math.max(0, options.recentHistoryRatio ?? 0.12);
    this.midHistoryRatio = Math.max(0, options.midHistoryRatio ?? 0.15);
  }

  private splitRanges(ctx: SlotContext, messages: HistoryMessage[]): {
    deep: HistoryMessage[];
    recent: HistoryMessage[];
  } {
    const totalBytes = ctx.modelContextWindowTokens * 4 * this.totalBudgetRatio;
    const recentCount = estimateCount(messages, totalBytes * this.recentHistoryRatio, this.avgMessageBytes);
    const withoutRecent = messages.slice(0, Math.max(0, messages.length - recentCount));
    const midCount = estimateCount(withoutRecent, totalBytes * this.midHistoryRatio, this.avgMessageBytes);

    return {
      deep: withoutRecent.slice(0, Math.max(0, withoutRecent.length - midCount)),
      recent: messages.slice(-recentCount),
    };
  }

  available(ctx: SlotContext): boolean {
    const messages = this.getMessages(ctx);
    const { deep } = this.splitRanges(ctx, messages);
    return deep.length > 0;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const messages = this.getMessages(ctx);
    const { deep, recent } = this.splitRanges(ctx, messages);
    const recentContents = recent.map((message) => String(message.content ?? ''));

    const selected: ContextSlot[] = [];
    let usedBytes = 0;

    for (const message of deep) {
      const content = String(message.content ?? '').trim();
      if (!content) continue;

      const classification = classifyContentType(content);
      if (!DEEP_ELIGIBLE_TYPES.has(classification.type)) continue;

      if (classification.type === 'decision' && contradicts(content, recentContents)) {
        continue;
      }

      const bytes = Buffer.byteLength(content, 'utf8');
      if (usedBytes + bytes > budgetBytes) continue;

      const score = halfLifeAdjustedScore(content, parseTimestamp(message.ts));
      if (score <= 0) continue;

      selected.push({
        id: message.id ?? `deep-history:${selected.length + 1}`,
        source: this.source,
        content,
        score,
        bytes,
        included: false,
        reason: `deep include ${classification.type}`,
      });
      usedBytes += bytes;
    }

    return selected;
  }

  prune(slots: ContextSlot[], _targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (slots.length === 0) return [];

    const bullets = slots
      .map((slot) => {
        const type = classifyContentType(slot.content).type;
        if (!DEEP_ELIGIBLE_TYPES.has(type)) return '';
        return `[${type}] ${firstSentence(slot.content)}`;
      })
      .filter((text) => Boolean(text));

    if (bullets.length === 0) {
      return slots.slice(0, Math.max(1, Math.floor(slots.length * (1 - aggressiveness * 0.5))));
    }

    const content = ['Deep-history durable context:', ...bullets.map((line) => `- ${line}`)].join('\n');
    return [
      {
        id: 'deep-history:summary',
        source: this.source,
        content,
        score: 0.9,
        bytes: Buffer.byteLength(content, 'utf8'),
        included: true,
        reason: `prune:summarized(a=${aggressiveness.toFixed(2)})`,
      },
    ];
  }
}
