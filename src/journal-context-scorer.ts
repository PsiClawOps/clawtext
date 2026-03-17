export interface ScoredMessage {
  record: Record<string, unknown>;
  score: number;
  reasons: { field: string; score: number; weight: number }[];
}

export interface ContextBudget {
  maxMessages: number;
  maxBytes: number;
  minScore: number;
}

const WEIGHTS = {
  content_weight: 0.30,
  freshness: 0.25,
  topic_continuity: 0.20,
  novelty: 0.15,
  signal_ratio: 0.10,
} as const;

const ACKS = new Set([
  'ok',
  'yes',
  'sounds good',
  'lets do it',
  "let's do it",
  'keep going',
  'perfect',
]);

function asTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function contentWeight(content: string): number {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > 200) return 1.0;
  if (bytes >= 50) return 0.6;
  return 0.1;
}

function freshnessScore(ts: number | null): number {
  if (!ts) return 0;
  const ageHours = Math.max(0, Date.now() - ts) / (1000 * 60 * 60);
  return Math.exp(-ageHours / 12);
}

function topicContinuityScore(previousTs: number | null, currentTs: number | null): number {
  if (!previousTs || !currentTs) return 0.3;
  const gapMinutes = Math.abs(currentTs - previousTs) / (1000 * 60);
  return gapMinutes <= 30 ? 1.0 : 0.3;
}

function noveltyScore(content: string): number {
  const normalized = content.trim().toLowerCase().replace(/[.!?]+$/g, '');
  if (ACKS.has(normalized)) return 0.0;
  return 1.0;
}

function signalRatioScore(record: Record<string, unknown>): number {
  const tags = record.tags;
  if (Array.isArray(tags) && tags.some((tag) => String(tag).toLowerCase() === '_raw_log')) {
    return 0.0;
  }
  return 1.0;
}

export function scoreMessages(records: Array<Record<string, unknown>>, _budget: ContextBudget): ScoredMessage[] {
  const sorted = [...records].sort((a, b) => (asTimestamp(a.ts) || 0) - (asTimestamp(b.ts) || 0));

  return sorted.map((record, index) => {
    const content = String(record.content || '').trim();
    const ts = asTimestamp(record.ts);
    const prevTs = index > 0 ? asTimestamp(sorted[index - 1].ts) : null;

    const reasons = [
      { field: 'content_weight', score: contentWeight(content), weight: WEIGHTS.content_weight },
      { field: 'freshness', score: freshnessScore(ts), weight: WEIGHTS.freshness },
      { field: 'topic_continuity', score: topicContinuityScore(prevTs, ts), weight: WEIGHTS.topic_continuity },
      { field: 'novelty', score: noveltyScore(content), weight: WEIGHTS.novelty },
      { field: 'signal_ratio', score: signalRatioScore(record), weight: WEIGHTS.signal_ratio },
    ];

    const total = reasons.reduce((acc, reason) => acc + reason.score * reason.weight, 0);

    return {
      record,
      score: Math.max(0, Math.min(1, total)),
      reasons,
    };
  });
}

export function selectForInjection(scored: ScoredMessage[], budget: ContextBudget): Array<Record<string, unknown>> {
  const ranked = [...scored]
    .filter((item) => item.score >= budget.minScore)
    .sort((a, b) => b.score - a.score || (asTimestamp(b.record.ts) || 0) - (asTimestamp(a.record.ts) || 0));

  const selected: ScoredMessage[] = [];
  let bytesUsed = 0;

  for (const item of ranked) {
    if (selected.length >= budget.maxMessages) break;
    const content = String(item.record.content || '');
    const nextBytes = bytesUsed + Buffer.byteLength(content, 'utf8');
    if (nextBytes > budget.maxBytes) continue;

    selected.push(item);
    bytesUsed = nextBytes;
  }

  return selected
    .sort((a, b) => (asTimestamp(a.record.ts) || 0) - (asTimestamp(b.record.ts) || 0))
    .map((item) => item.record);
}
