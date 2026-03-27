import type { DatabaseSync } from 'node:sqlite';
import type { CompactResult } from 'openclaw/plugin-sdk/context-engine';
import {
  createCondensedSummary,
  createLeafSummary,
  getLeafSummaries,
  getSummarizableMessages,
  markMessagesAsSummarized,
  type SummarizableMessageRow,
} from './dag';
import { withTransaction } from './db';

const DEFAULT_SUMMARIZATION_MODEL = 'anthropic/claude-haiku-4-5';
const DEFAULT_MAX_SUMMARIZATIONS_PER_HOUR = 10;
const DEFAULT_FRESH_TAIL_SIZE = 20;
const DEFAULT_LEAF_BATCH_SIZE = 30;
const DEFAULT_TOKEN_BUDGET = 128_000;

type CondensableSummary = {
  id: number;
  content: string;
  source_content_types: string | null;
};

type PromptMessage = {
  role: string;
  content: string;
  message_index: number;
};

type SummarizationApi = {
  complete(model: string, prompt: string): Promise<string>;
};

type SummarizationFailure =
  | { ok: false; reason: 'summarization_cap_reached' }
  | { ok: false; reason: 'model_error'; error: unknown };

type SummarizationSuccess = { ok: true; summary: string };

type SummarizationResult = SummarizationFailure | SummarizationSuccess;

export type CompactorConfig = {
  summarizationModel: string;
  maxSummarizationsPerHour: number;
  freshTailSize: number;
  leafBatchSize: number;
};

export type LeafPassResult = {
  summarizedCount: number;
  skipped: boolean;
  reason?: string;
};

export type CondensationPassResult = {
  condensedCount: number;
  skipped: boolean;
  reason?: string;
};

type CompactionParams = {
  force?: boolean;
  tokenBudget?: number;
  currentTokenCount?: number;
};

export class SummarizationTracker {
  private readonly maxCallsPerHour: number;

  private readonly callTimestampsMs: number[] = [];

  constructor(maxCallsPerHour: number) {
    this.maxCallsPerHour = Number.isFinite(maxCallsPerHour) && maxCallsPerHour > 0
      ? Math.floor(maxCallsPerHour)
      : DEFAULT_MAX_SUMMARIZATIONS_PER_HOUR;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - (60 * 60 * 1000);
    while (this.callTimestampsMs.length > 0 && this.callTimestampsMs[0] < cutoff) {
      this.callTimestampsMs.shift();
    }
  }

  canSummarize(): boolean {
    const nowMs = Date.now();
    this.prune(nowMs);
    return this.callTimestampsMs.length < this.maxCallsPerHour;
  }

  recordCall(): void {
    const nowMs = Date.now();
    this.prune(nowMs);
    this.callTimestampsMs.push(nowMs);
  }

  getCallCount(): number {
    const nowMs = Date.now();
    this.prune(nowMs);
    return this.callTimestampsMs.length;
  }
}

export function resolveCompactorConfig(partial?: Partial<CompactorConfig> | null): CompactorConfig {
  return {
    summarizationModel: typeof partial?.summarizationModel === 'string' && partial.summarizationModel.trim().length > 0
      ? partial.summarizationModel
      : DEFAULT_SUMMARIZATION_MODEL,
    maxSummarizationsPerHour:
      typeof partial?.maxSummarizationsPerHour === 'number'
      && Number.isFinite(partial.maxSummarizationsPerHour)
      && partial.maxSummarizationsPerHour > 0
        ? Math.floor(partial.maxSummarizationsPerHour)
        : DEFAULT_MAX_SUMMARIZATIONS_PER_HOUR,
    freshTailSize:
      typeof partial?.freshTailSize === 'number' && Number.isFinite(partial.freshTailSize) && partial.freshTailSize >= 0
        ? Math.floor(partial.freshTailSize)
        : DEFAULT_FRESH_TAIL_SIZE,
    leafBatchSize:
      typeof partial?.leafBatchSize === 'number' && Number.isFinite(partial.leafBatchSize) && partial.leafBatchSize > 0
        ? Math.floor(partial.leafBatchSize)
        : DEFAULT_LEAF_BATCH_SIZE,
  };
}

export function buildLeafSummaryPrompt(messages: PromptMessage[]): string {
  const lines = messages.map((message) => {
    const compactContent = message.content.replace(/\s+/g, ' ').trim();
    return `[${message.message_index}] ${message.role}: ${compactContent}`;
  });

  return [
    'Summarize the following conversation segment compactly.',
    'Preserve: key decisions, active tasks, blockers, and unresolved questions.',
    'Output plain text only.',
    ...lines,
  ].join('\n');
}

function chunkMessages<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

function mergeSourceContentTypes(values: Array<string | null | undefined>): string {
  const all = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    for (const token of value.split(',')) {
      const normalized = token.trim();
      if (normalized.length > 0) all.add(normalized);
    }
  }

  if (all.size === 0) return 'active';
  return [...all].sort().join(',');
}

function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

function estimateConversationTokens(db: DatabaseSync, conversationId: number): number {
  const rows = db
    .prepare('SELECT token_count, content FROM messages WHERE conversation_id = ? AND is_heartbeat = 0')
    .all(conversationId) as Array<{ token_count: number | null; content: string }>;

  return rows.reduce((total, row) => {
    if (typeof row.token_count === 'number' && row.token_count > 0) {
      return total + row.token_count;
    }
    return total + Math.ceil(row.content.length / 4);
  }, 0);
}

function conversationExists(db: DatabaseSync, conversationId: number): boolean {
  const row = db.prepare('SELECT id FROM conversations WHERE id = ? LIMIT 1').get(conversationId) as { id: number } | undefined;
  return typeof row?.id === 'number';
}

function removeMessageRows(db: DatabaseSync, messageIds: number[]): number {
  if (messageIds.length === 0) return 0;

  return withTransaction(db, () => {
    const inClause = Array.from({ length: messageIds.length }, () => '?').join(', ');
    db.prepare(`DELETE FROM message_parts WHERE message_id IN (${inClause})`).run(...messageIds);
    const result = db.prepare(`DELETE FROM messages WHERE id IN (${inClause})`).run(...messageIds) as {
      changes?: number;
    };
    return typeof result.changes === 'number' ? result.changes : messageIds.length;
  });
}

function runDeterministicTruncation(
  db: DatabaseSync,
  conversationId: number,
  tokenBudget: number,
  estimatedTokensBefore: number,
): { removedCount: number; estimatedTokensAfter: number } {
  const targetReduction = Math.max(0, estimatedTokensBefore - tokenBudget);

  if (targetReduction <= 0) {
    return { removedCount: 0, estimatedTokensAfter: estimatedTokensBefore };
  }

  const candidates = db
    .prepare(
      `SELECT id, content, token_count
         FROM messages
        WHERE conversation_id = ?
          AND is_heartbeat = 0
          AND COALESCE(summarized, 0) = 0
          AND content_type NOT IN ('system', 'identity', 'decision', 'anchor')
        ORDER BY message_index ASC`,
    )
    .all(conversationId) as Array<{ id: number; content: string; token_count: number | null }>;

  const toDelete: number[] = [];
  let reducedTokens = 0;

  for (const row of candidates) {
    const rowTokens = typeof row.token_count === 'number' && row.token_count > 0
      ? row.token_count
      : Math.ceil(row.content.length / 4);

    toDelete.push(row.id);
    reducedTokens += rowTokens;

    if (reducedTokens >= targetReduction) {
      break;
    }
  }

  const removedCount = removeMessageRows(db, toDelete);
  const estimatedTokensAfter = estimateConversationTokens(db, conversationId);

  console.warn(
    `[clawtext-session-intelligence] Deterministic truncation executed: removed ${removedCount} messages (tokens ${estimatedTokensBefore} -> ${estimatedTokensAfter}).`,
  );

  return { removedCount, estimatedTokensAfter };
}

function toPromptMessages(messages: SummarizableMessageRow[]): PromptMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    message_index: message.message_index,
  }));
}

function summariesToPromptMessages(summaries: CondensableSummary[]): PromptMessage[] {
  return summaries.map((summary, index) => ({
    role: 'summary',
    content: summary.content,
    message_index: index,
  }));
}

export async function summarizeMessages(
  api: SummarizationApi,
  messages: PromptMessage[],
  config: CompactorConfig,
  tracker: SummarizationTracker,
): Promise<SummarizationResult> {
  if (!tracker.canSummarize()) {
    return { ok: false, reason: 'summarization_cap_reached' };
  }

  const prompt = buildLeafSummaryPrompt(messages);
  const estimatedInputTokens = estimatePromptTokens(prompt);

  try {
    const summary = await api.complete(config.summarizationModel, prompt);
    tracker.recordCall();

    console.log(
      `[clawtext-session-intelligence] summarization call: model=${config.summarizationModel} input_tokens≈${estimatedInputTokens} output_chars=${summary.length} calls_last_hour=${tracker.getCallCount()}`,
    );

    return { ok: true, summary };
  } catch (error) {
    console.warn(
      `[clawtext-session-intelligence] summarization error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, reason: 'model_error', error };
  }
}

export async function runLeafPass(
  db: DatabaseSync,
  api: SummarizationApi,
  conversationId: number,
  config: CompactorConfig,
  tracker: SummarizationTracker,
): Promise<LeafPassResult> {
  const candidates = getSummarizableMessages(db, conversationId, config.freshTailSize);

  console.log(
    `[clawtext-session-intelligence] leaf pass start: conversation=${conversationId} candidates=${candidates.length} batchSize=${config.leafBatchSize}`,
  );

  if (candidates.length < Math.max(1, Math.floor(config.leafBatchSize / 2))) {
    return { summarizedCount: 0, skipped: true, reason: 'not_enough_messages' };
  }

  const batches = chunkMessages(candidates, config.leafBatchSize);
  let summarizedCount = 0;

  for (const batch of batches) {
    const summarized = await summarizeMessages(api, toPromptMessages(batch), config, tracker);
    if (!summarized.ok) {
      if (summarized.reason === 'summarization_cap_reached') {
        console.warn('[clawtext-session-intelligence] leaf pass stopped: summarization cap reached');
        return {
          summarizedCount,
          skipped: summarizedCount === 0,
          reason: 'summarization_cap_reached',
        };
      }

      console.warn('[clawtext-session-intelligence] leaf pass skipping batch due to model error');
      continue;
    }

    const sourceTypes = mergeSourceContentTypes(batch.map((message) => message.content_type));
    createLeafSummary(db, conversationId, batch, summarized.summary, sourceTypes);
    markMessagesAsSummarized(db, batch.map((message) => message.id));
    summarizedCount += batch.length;
  }

  console.log(
    `[clawtext-session-intelligence] leaf pass end: conversation=${conversationId} summarized_messages=${summarizedCount}`,
  );

  return {
    summarizedCount,
    skipped: summarizedCount === 0,
  };
}

export async function runCondensationPass(
  db: DatabaseSync,
  api: SummarizationApi,
  conversationId: number,
  config: CompactorConfig,
  tracker: SummarizationTracker,
): Promise<CondensationPassResult> {
  const leaves = getLeafSummaries(db, conversationId) as CondensableSummary[];
  if (leaves.length < 3) {
    return { condensedCount: 0, skipped: true, reason: 'not_enough_leaf_summaries' };
  }

  const groups = chunkMessages(leaves, 5).filter((group) => group.length >= 2);
  let condensedCount = 0;

  for (const group of groups) {
    const summarized = await summarizeMessages(api, summariesToPromptMessages(group), config, tracker);

    if (!summarized.ok) {
      if (summarized.reason === 'summarization_cap_reached') {
        console.warn('[clawtext-session-intelligence] condensation pass stopped: summarization cap reached');
        return {
          condensedCount,
          skipped: condensedCount === 0,
          reason: 'summarization_cap_reached',
        };
      }
      console.warn('[clawtext-session-intelligence] condensation pass skipping group due to model error');
      continue;
    }

    const childIds = group.map((item) => item.id);
    const sourceTypes = mergeSourceContentTypes(group.map((item) => item.source_content_types));
    createCondensedSummary(db, conversationId, childIds, summarized.summary, sourceTypes);
    condensedCount += 1;
  }

  return {
    condensedCount,
    skipped: condensedCount === 0,
  };
}

export async function runCompaction(
  db: DatabaseSync,
  api: SummarizationApi,
  conversationId: number,
  config: CompactorConfig,
  tracker: SummarizationTracker,
  params: CompactionParams,
): Promise<CompactResult> {
  if (!conversationExists(db, conversationId)) {
    return { ok: false, compacted: false, reason: 'no_conversation' };
  }

  const tokenBudget =
    typeof params.tokenBudget === 'number' && Number.isFinite(params.tokenBudget) && params.tokenBudget > 0
      ? Math.floor(params.tokenBudget)
      : DEFAULT_TOKEN_BUDGET;

  const tokensBefore =
    typeof params.currentTokenCount === 'number' && Number.isFinite(params.currentTokenCount) && params.currentTokenCount > 0
      ? Math.floor(params.currentTokenCount)
      : estimateConversationTokens(db, conversationId);

  const leafResult = await runLeafPass(db, api, conversationId, config, tracker);
  let tokensAfter = estimateConversationTokens(db, conversationId);

  const stillOverBudget = params.force === true || tokensAfter > tokenBudget;
  const capReachedAtLeaf = leafResult.reason === 'summarization_cap_reached';

  let condensationResult: CondensationPassResult = { condensedCount: 0, skipped: true, reason: 'not_needed' };
  let capReachedAtCondensation = false;

  if (stillOverBudget) {
    condensationResult = await runCondensationPass(db, api, conversationId, config, tracker);
    tokensAfter = estimateConversationTokens(db, conversationId);
    capReachedAtCondensation = condensationResult.reason === 'summarization_cap_reached';
  }

  let truncationRemovedCount = 0;
  if (capReachedAtLeaf || capReachedAtCondensation) {
    const truncationResult = runDeterministicTruncation(db, conversationId, tokenBudget, tokensAfter);
    truncationRemovedCount = truncationResult.removedCount;
    tokensAfter = truncationResult.estimatedTokensAfter;
  }

  const compacted =
    leafResult.summarizedCount > 0
    || condensationResult.condensedCount > 0
    || truncationRemovedCount > 0;

  return {
    ok: true,
    compacted,
    reason: compacted ? undefined : leafResult.reason ?? condensationResult.reason ?? 'no_compaction_needed',
    result: {
      tokensBefore,
      tokensAfter,
      details: {
        leaf: leafResult,
        condensation: condensationResult,
        truncationRemovedCount,
      },
    },
  };
}
