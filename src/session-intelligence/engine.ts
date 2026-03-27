/**
 * Session Intelligence context engine (Walk 1b).
 *
 * Implements OpenClaw ContextEngine lifecycle with SQLite-backed message
 * persistence, deterministic recent-history assembly, and DAG-backed
 * compaction orchestration.
 */

import fs from 'fs';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AssembleResult,
  CompactResult,
  ContextEngine,
  IngestResult,
} from 'openclaw/plugin-sdk/context-engine';
import { runCompaction, resolveCompactorConfig, SummarizationTracker } from './compactor';
import { openDatabase, withTransaction } from './db';
import { estimateTokens, persistMessage, persistMessageParts } from './ingest';
import type { SessionIntelligenceConfig } from './types';

const ENGINE_ID = 'clawtext-session-intelligence';
const DEFAULT_TOKEN_BUDGET = 128_000;
const CIRCUIT_BREAKER_RATIO = 0.85;

type ConversationLookup = {
  id: number;
};

type BootstrapResult = {
  bootstrapped: boolean;
  importedMessages?: number;
  reason?: string;
};

type IngestBatchResult = {
  ingestedCount: number;
};

type SubagentSpawnPreparation = {
  rollback: () => void | Promise<void>;
};

type StoredMessage = {
  role: string;
  content: string;
  token_count: number | null;
};

function resolveTokenBudget(tokenBudget?: number): number {
  if (typeof tokenBudget === 'number' && Number.isFinite(tokenBudget) && tokenBudget > 0) {
    return Math.floor(tokenBudget);
  }

  console.warn(
    `[${ENGINE_ID}] tokenBudget undefined; defaulting to ${DEFAULT_TOKEN_BUDGET}.`,
  );
  return DEFAULT_TOKEN_BUDGET;
}

function messageToText(message: unknown): string {
  if (!message || typeof message !== 'object') return String(message ?? '');

  const candidate = message as {
    content?: unknown;
    text?: unknown;
  };

  if (typeof candidate.content === 'string') return candidate.content;
  if (typeof candidate.text === 'string') return candidate.text;
  if (Array.isArray(candidate.content)) {
    return candidate.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return String(part ?? '');
        const item = part as { text?: unknown; content?: unknown; output?: unknown; result?: unknown };
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        if (typeof item.output === 'string') return item.output;
        if (typeof item.result === 'string') return item.result;
        return JSON.stringify(item);
      })
      .join('\n');
  }

  return JSON.stringify(candidate.content ?? message);
}

function checkActiveOverlayPresence(workspacePath: string): void {
  const expected = ['JOB.md', 'CHARTER.md', 'COMMS.md'];
  const missing = expected.filter((filename) => !fs.existsSync(path.join(workspacePath, filename)));
  if (missing.length > 0) {
    console.warn(
      `[${ENGINE_ID}] Active overlay file(s) missing: ${missing.join(', ')}. Continuing in degraded mode.`,
    );
  }
}

export function createSessionIntelligenceEngine(config: SessionIntelligenceConfig): ContextEngine {
  const workspacePath = path.resolve(config.workspacePath);
  const db: DatabaseSync = openDatabase(workspacePath);
  const conversationIdBySession = new Map<string, number>();
  const compactorConfig = resolveCompactorConfig(config.compactor);
  const summarizationTracker = new SummarizationTracker(compactorConfig.maxSummarizationsPerHour);

  function getOrCreateConversationId(sessionId: string): number {
    const cached = conversationIdBySession.get(sessionId);
    if (typeof cached === 'number') return cached;

    const conversationId = withTransaction(db, () => {
      const now = new Date().toISOString();

      db
        .prepare(
          `INSERT INTO conversations (session_key, session_id, created_at, updated_at, metadata)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(session_key) DO UPDATE SET
             session_id=excluded.session_id,
             updated_at=excluded.updated_at`,
        )
        .run(sessionId, sessionId, now, now, null);

      const row = db
        .prepare('SELECT id FROM conversations WHERE session_key = ? LIMIT 1')
        .get(sessionId) as ConversationLookup | undefined;

      if (!row || typeof row.id !== 'number') {
        throw new Error(`[${ENGINE_ID}] Failed to create/load conversation row for ${sessionId}`);
      }

      return row.id;
    });

    conversationIdBySession.set(sessionId, conversationId);
    return conversationId;
  }

  function nextMessageIndex(conversationId: number): number {
    const row = db
      .prepare('SELECT COALESCE(MAX(message_index), -1) AS max_index FROM messages WHERE conversation_id = ?')
      .get(conversationId) as { max_index: number | null };

    const current = typeof row.max_index === 'number' ? row.max_index : -1;
    return current + 1;
  }

  function estimateCurrentPressure(messages: unknown[]): number {
    return messages.reduce<number>((sum, message) => sum + estimateTokens(messageToText(message)), 0);
  }

  async function bootstrap(params: { sessionId: string; sessionFile: string }): Promise<BootstrapResult> {
    try {
      checkActiveOverlayPresence(workspacePath);
      getOrCreateConversationId(params.sessionId);
      return { bootstrapped: true, importedMessages: 0 };
    } catch (error) {
      console.warn(`[${ENGINE_ID}] bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      return { bootstrapped: false, reason: 'bootstrap error' };
    }
  }

  async function ingest(params: { sessionId: string; message: unknown; isHeartbeat?: boolean }): Promise<IngestResult> {
    try {
      const conversationId = getOrCreateConversationId(params.sessionId);
      withTransaction(db, () => {
        const index = nextMessageIndex(conversationId);
        const messageId = persistMessage(db, conversationId, params.message, index, params.isHeartbeat === true);
        persistMessageParts(db, messageId, params.message);
      });

      return { ingested: true };
    } catch (error) {
      console.warn(`[${ENGINE_ID}] ingest failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ingested: false };
    }
  }

  async function ingestBatch(params: {
    sessionId: string;
    messages: unknown[];
    isHeartbeat?: boolean;
  }): Promise<IngestBatchResult> {
    try {
      if (!Array.isArray(params.messages) || params.messages.length === 0) {
        return { ingestedCount: 0 };
      }

      const conversationId = getOrCreateConversationId(params.sessionId);

      const ingestedCount = withTransaction(db, () => {
        let index = nextMessageIndex(conversationId);
        let count = 0;

        for (const message of params.messages) {
          const messageId = persistMessage(db, conversationId, message, index, params.isHeartbeat === true);
          persistMessageParts(db, messageId, message);
          index += 1;
          count += 1;
        }

        return count;
      });

      return { ingestedCount };
    } catch (error) {
      console.warn(`[${ENGINE_ID}] ingestBatch failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ingestedCount: 0 };
    }
  }

  async function assemble(params: {
    sessionId: string;
    messages: unknown[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    try {
      const budget = resolveTokenBudget(params.tokenBudget ?? config.defaultTokenBudget);
      const breaker = Math.floor(budget * CIRCUIT_BREAKER_RATIO);
      const conversationId = getOrCreateConversationId(params.sessionId);

      const rows = db
        .prepare(
          `SELECT role, content, token_count
             FROM messages
            WHERE conversation_id = ?
            ORDER BY message_index DESC`,
        )
        .all(conversationId) as StoredMessage[];

      const selected: Array<{ role: string; content: string }> = [];
      let estimatedTokens = 0;

      for (const row of rows) {
        const rowTokens = typeof row.token_count === 'number' && row.token_count > 0
          ? row.token_count
          : estimateTokens(row.content);

        if (estimatedTokens + rowTokens > budget && selected.length > 0) {
          break;
        }

        if (estimatedTokens + rowTokens > budget && selected.length === 0) {
          selected.push({ role: row.role, content: row.content });
          estimatedTokens += rowTokens;
          break;
        }

        selected.push({ role: row.role, content: row.content });
        estimatedTokens += rowTokens;
      }

      let assembledMessages: unknown[];

      if (selected.length > 0) {
        assembledMessages = selected.reverse();
      } else {
        assembledMessages = Array.isArray(params.messages) ? params.messages : [];
        estimatedTokens = estimateCurrentPressure(assembledMessages);
      }

      if (estimatedTokens >= breaker) {
        console.warn(
          `[${ENGINE_ID}] Context nearing token ceiling: ${estimatedTokens}/${budget} (${Math.round((estimatedTokens / budget) * 100)}%).`,
        );
      }

      return {
        messages: assembledMessages as AssembleResult['messages'],
        estimatedTokens,
      };
    } catch (error) {
      console.warn(`[${ENGINE_ID}] assemble failed: ${error instanceof Error ? error.message : String(error)}`);
      const fallbackMessages = Array.isArray(params.messages) ? params.messages : [];
      return {
        messages: fallbackMessages as AssembleResult['messages'],
        estimatedTokens: estimateCurrentPressure(fallbackMessages),
      };
    }
  }

  async function compact(params: {
    sessionId: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: 'budget' | 'threshold';
    customInstructions?: string;
    legacyParams?: Record<string, unknown>;
  }): Promise<CompactResult> {
    console.log(
      `[${ENGINE_ID}] compact preflight: ACA kernel slot check deferred to Walk 2 (kernel slots not yet implemented).`,
    );

    try {
      const conversationId = getOrCreateConversationId(params.sessionId);

      if (!config.summarizationApi) {
        return {
          ok: true,
          compacted: false,
          reason: 'no_summarization_api_configured',
        };
      }

      return await runCompaction(
        db,
        config.summarizationApi,
        conversationId,
        compactorConfig,
        summarizationTracker,
        {
          force: params.force,
          tokenBudget: params.tokenBudget ?? config.defaultTokenBudget,
          currentTokenCount: params.currentTokenCount,
        },
      );
    } catch (error) {
      console.warn(`[${ENGINE_ID}] compact failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        ok: false,
        compacted: false,
        reason: 'compaction_error',
      };
    }
  }

  async function afterTurn(params: {
    sessionId: string;
    sessionFile: string;
    messages: unknown[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    legacyCompactionParams?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const budget = resolveTokenBudget(params.tokenBudget ?? config.defaultTokenBudget);
      const breaker = Math.floor(budget * CIRCUIT_BREAKER_RATIO);
      const tokens = estimateCurrentPressure(Array.isArray(params.messages) ? params.messages : []);
      if (tokens >= breaker) {
        console.warn(
          `[${ENGINE_ID}] afterTurn pressure warning: ${tokens}/${budget} (${Math.round((tokens / budget) * 100)}%).`,
        );
      }
    } catch (error) {
      console.warn(`[${ENGINE_ID}] afterTurn check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function prepareSubagentSpawn(_params: {
    parentSessionKey: string;
    childSessionKey: string;
    ttlMs?: number;
  }): Promise<SubagentSpawnPreparation | undefined> {
    // NOT YET INVOKED BY RUNTIME — implement when SDK calls this
    return undefined;
  }

  async function onSubagentEnded(_params: {
    childSessionKey: string;
    reason: 'deleted' | 'completed' | 'swept' | 'released';
  }): Promise<void> {
    // Walk 1a stub.
  }

  async function dispose(): Promise<void> {
    try {
      db.close();
    } catch (error) {
      console.warn(`[${ENGINE_ID}] dispose failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    info: {
      id: ENGINE_ID,
      name: 'ClawText Session Intelligence',
      version: '0.1.0-walk1b',
      ownsCompaction: true,
    },
    bootstrap,
    ingest,
    ingestBatch,
    assemble,
    compact,
    afterTurn,
    prepareSubagentSpawn,
    onSubagentEnded,
    dispose,
  };
}
