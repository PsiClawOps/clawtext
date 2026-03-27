/**
 * Session Intelligence context engine (Walk 4).
 *
 * Implements OpenClaw ContextEngine lifecycle with SQLite-backed message
 * persistence, ACA identity kernel/overlay lanes, deterministic recent-history
 * assembly, and DAG-backed compaction orchestration.
 */

import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AssembleResult,
  CompactResult,
  ContextEngine,
  IngestResult,
} from 'openclaw/plugin-sdk/context-engine';
import {
  allKernelFilesPresent,
  buildKernelContent,
  buildOverlayContent,
  loadAcaFiles,
} from './aca';
import { runCompaction, resolveCompactorConfig, SummarizationTracker } from './compactor';
import { classifyMessage, type ContentType } from './content-type';
import { openDatabase, withTransaction } from './db';
import { estimateTokens, persistMessage, persistMessageParts } from './ingest';
import { buildPressureReading, computePressureSignals } from './pressure';
import { runNoiseSweep, runToolDecay } from './proactive-pass';
import { extractStateFromMessage } from './state-extraction';
import { getStateSlot, kernelSlotsPresent, upsertStateSlot } from './state-slots';
import {
  evaluateTrigger,
  getMessageCount,
  recordCompactionEvent,
  resolveTriggerConfig,
  shouldRunProactivePass,
} from './trigger';
import type { SessionIntelligenceConfig } from './types';

const ENGINE_ID = 'clawtext-session-intelligence';
const DEFAULT_TOKEN_BUDGET = 128_000;
const EMERGENCY_FILL_RATIO = 0.85;

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
  message_index: number;
  role: string;
  content: string;
  content_type: ContentType;
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

function getMessageContentTypes(db: DatabaseSync, conversationId: number): Map<number, ContentType> {
  const rows = db.prepare(
    `SELECT message_index, content_type FROM messages WHERE conversation_id = ? ORDER BY message_index`,
  ).all(conversationId) as Array<{ message_index: number; content_type: string | null }>;

  return new Map(rows.map((row) => [row.message_index, (row.content_type as ContentType) ?? 'active']));
}

function estimateStoredMessageTokens(row: StoredMessage): number {
  if (typeof row.token_count === 'number' && row.token_count > 0) {
    return row.token_count;
  }

  return estimateTokens(row.content);
}

export function createSessionIntelligenceEngine(config: SessionIntelligenceConfig): ContextEngine {
  const workspacePath = path.resolve(config.workspacePath);
  const db: DatabaseSync = openDatabase(workspacePath);
  const conversationIdBySession = new Map<string, number>();
  const compactionInProgress = new Set<string>();
  const compactorConfig = resolveCompactorConfig(config.compactor);
  const triggerConfig = resolveTriggerConfig(config.compactionTrigger);
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

  function estimatePressureFromDb(conversationId: number): number {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN token_count IS NOT NULL THEN token_count ELSE length(content) / 4 END), 0) AS total
           FROM messages
          WHERE conversation_id = ?`,
      )
      .get(conversationId) as { total: number | null };

    return typeof row.total === 'number' ? row.total : 0;
  }

  function buildRecallHint(conversationId: number): string {
    const summaryCount = (db
      .prepare('SELECT COUNT(*) as count FROM summaries WHERE conversation_id = ?')
      .get(conversationId) as { count: number }).count;

    if (summaryCount === 0) return '';

    return `[Session Intelligence] This session has ${summaryCount} summary node(s) from prior compaction. Use search/describe/expand recall tools to query session history beyond the current context window.`;
  }

  async function bootstrap(params: { sessionId: string; sessionFile: string }): Promise<BootstrapResult> {
    try {
      const conversationId = getOrCreateConversationId(params.sessionId);

      if (typeof config.workspacePath === 'string' && config.workspacePath.trim().length > 0) {
        const aca = loadAcaFiles(workspacePath);

        if (!allKernelFilesPresent(aca)) {
          if (aca.kernelMissing.length === 3) {
            console.error(`[${ENGINE_ID}] bootstrap proceeding without ACA kernel source files.`);
          } else {
            console.warn(`[${ENGINE_ID}] ACA kernel partially missing: ${aca.kernelMissing.join(', ')}`);
          }
        }

        const kernelContent = buildKernelContent(aca.kernel);
        upsertStateSlot(db, conversationId, 'identity_kernel', kernelContent, {
          loadedFrom: workspacePath,
          isPinned: true,
        });

        const overlayContent = buildOverlayContent(aca.overlay);
        if (overlayContent.length > 0) {
          upsertStateSlot(db, conversationId, 'active_overlay', overlayContent, {
            loadedFrom: workspacePath,
            isPinned: false,
          });
        }
      }

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
        const classifiedContentType = classifyMessage(params.message);
        const contentType: ContentType = params.isHeartbeat === true ? 'noise' : classifiedContentType;
        const messageId = persistMessage(
          db,
          conversationId,
          params.message,
          index,
          params.isHeartbeat === true,
          contentType,
        );
        persistMessageParts(db, messageId, params.message);
        extractStateFromMessage({
          db,
          conversationId,
          message: params.message,
          contentType,
        });
      });

      const triggerResult = evaluateTrigger({
        db,
        conversationId,
        currentTokenCount: estimatePressureFromDb(conversationId),
        tokenBudget: resolveTokenBudget(config.defaultTokenBudget),
        triggerConfig,
      });

      const pressureReading = triggerResult.pressureReading
        ?? buildPressureReading(
          computePressureSignals(db, conversationId, resolveTokenBudget(config.defaultTokenBudget)),
        );

      if (shouldRunProactivePass(pressureReading)) {
        console.log(
          `[${ENGINE_ID}] Pressure action candidate: ${pressureReading.recommendedAction} (score=${pressureReading.score.toFixed(3)})`,
        );
      }

      if (triggerResult.reason === 'proactive_pass_needed' && !compactionInProgress.has(params.sessionId)) {
        void (async () => {
          compactionInProgress.add(params.sessionId);
          try {
            const ns = runNoiseSweep(db, conversationId);
            const td = runToolDecay(db, conversationId);
            console.log(`[${ENGINE_ID}] Proactive pass: swept ${ns.messagesMarked} noise, decayed ${td.messagesMarked} tool outputs`);
            recordCompactionEvent({
              db,
              conversationId,
              triggerReason: 'pressure',
              pressureBefore: pressureReading.score,
              messagesBefore: getMessageCount(db, conversationId),
              outcome: 'success',
            });
          } catch (err) {
            console.warn(`[${ENGINE_ID}] Proactive pass error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            compactionInProgress.delete(params.sessionId);
          }
        })();
      } else if (triggerResult.shouldCompact && !compactionInProgress.has(params.sessionId)) {
        void (async () => {
          compactionInProgress.add(params.sessionId);
          try {
            await compact({ sessionId: params.sessionId, sessionFile: '', compactionTarget: 'threshold' });
          } catch (err) {
            console.warn(`[${ENGINE_ID}] Auto-compaction error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            compactionInProgress.delete(params.sessionId);
          }
        })();
      }

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
          const classifiedContentType = classifyMessage(message);
          const contentType: ContentType = params.isHeartbeat === true ? 'noise' : classifiedContentType;
          const messageId = persistMessage(
            db,
            conversationId,
            message,
            index,
            params.isHeartbeat === true,
            contentType,
          );
          persistMessageParts(db, messageId, message);
          extractStateFromMessage({
            db,
            conversationId,
            message,
            contentType,
          });
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
      const conversationId = getOrCreateConversationId(params.sessionId);

      const kernelSlot = getStateSlot(db, conversationId, 'identity_kernel');
      const kernelContent = kernelSlot?.content ?? '';
      const kernelTokens = kernelSlot ? estimateTokens(kernelSlot.content) : 0;

      const overlaySlot = getStateSlot(db, conversationId, 'active_overlay');
      const overlayTokens = overlaySlot ? estimateTokens(overlaySlot.content) : 0;

      const historyBudget = Math.max(0, budget - kernelTokens - overlayTokens);
      const priorityBudget = Math.floor(historyBudget * 0.30);

      const rows = db
        .prepare(
          `SELECT message_index, role, content, content_type, token_count
             FROM messages
            WHERE conversation_id = ?
            ORDER BY message_index ASC`,
        )
        .all(conversationId) as Array<{
          message_index: number;
          role: string;
          content: string;
          content_type: string | null;
          token_count: number | null;
        }>;

      const storedMessages: StoredMessage[] = rows.map((row) => ({
        message_index: row.message_index,
        role: row.role,
        content: row.content,
        content_type: (row.content_type as ContentType) ?? 'active',
        token_count: row.token_count,
      }));

      const selectedByIndex = new Map<number, StoredMessage>();
      let historyTokens = 0;
      let priorityTokens = 0;

      const priorityCandidates = storedMessages
        .filter((row) => row.content_type === 'anchor' || row.content_type === 'decision')
        .sort((a, b) => b.message_index - a.message_index);

      for (const row of priorityCandidates) {
        const rowTokens = estimateStoredMessageTokens(row);

        if (priorityTokens + rowTokens > priorityBudget && selectedByIndex.size > 0) {
          break;
        }

        if (historyTokens + rowTokens > historyBudget && selectedByIndex.size > 0) {
          break;
        }

        if (historyTokens + rowTokens > historyBudget && selectedByIndex.size === 0) {
          selectedByIndex.set(row.message_index, row);
          historyTokens += rowTokens;
          priorityTokens += rowTokens;
          break;
        }

        selectedByIndex.set(row.message_index, row);
        historyTokens += rowTokens;
        priorityTokens += rowTokens;
      }

      const fillCandidates = storedMessages
        .filter((row) => row.content_type === 'active' || row.content_type === 'tool_result')
        .sort((a, b) => b.message_index - a.message_index);

      for (const row of fillCandidates) {
        if (historyTokens >= historyBudget) break;
        if (selectedByIndex.has(row.message_index)) continue;

        const rowTokens = estimateStoredMessageTokens(row);

        if (historyTokens + rowTokens > historyBudget && selectedByIndex.size > 0) {
          continue;
        }

        selectedByIndex.set(row.message_index, row);
        historyTokens += rowTokens;

        if (historyTokens > historyBudget && selectedByIndex.size === 1) {
          break;
        }
      }

      const selected = [...selectedByIndex.values()].sort((a, b) => a.message_index - b.message_index);

      const historyMessagesFromDb: unknown[] = selected.map((row) => ({
        role: row.role,
        content: row.content,
      }));

      const runtimeMessages = Array.isArray(params.messages) ? params.messages : [];
      const contentTypeByIndex = getMessageContentTypes(db, conversationId);
      const fallbackHistoryMessages: unknown[] = runtimeMessages.filter((message, index) => {
        const mappedType = contentTypeByIndex.get(index) ?? classifyMessage(message);
        return mappedType !== 'noise' && mappedType !== 'resolved';
      });

      const historyMessages: unknown[] = historyMessagesFromDb.length > 0
        ? historyMessagesFromDb
        : fallbackHistoryMessages;

      const fallbackHistoryTokens = historyMessagesFromDb.length > 0 ? 0 : estimateCurrentPressure(historyMessages);
      const effectiveHistoryTokens = historyMessagesFromDb.length > 0 ? historyTokens : fallbackHistoryTokens;

      const assembledMessages: unknown[] = [
        {
          role: 'system',
          content: kernelContent,
        },
      ];

      if (overlaySlot) {
        assembledMessages.push({
          role: 'system',
          content: overlaySlot.content,
        });
      }

      assembledMessages.push(...historyMessages);

      const estimatedTokens = kernelTokens + overlayTokens + effectiveHistoryTokens;

      const emergencyThreshold = Math.floor(budget * EMERGENCY_FILL_RATIO);
      if (estimatedTokens >= emergencyThreshold) {
        console.warn(`[${ENGINE_ID}] Emergency circuit breaker: ${estimatedTokens} >= ${emergencyThreshold}`);
        if (!compactionInProgress.has(params.sessionId)) {
          void (async () => {
            compactionInProgress.add(params.sessionId);
            try {
              await compact({ sessionId: params.sessionId, sessionFile: '', force: true, compactionTarget: 'budget' });
            } catch (err) {
              console.warn(`[${ENGINE_ID}] Emergency compact error: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
              compactionInProgress.delete(params.sessionId);
            }
          })();
        }
      }

      return {
        messages: assembledMessages as AssembleResult['messages'],
        estimatedTokens,
        systemPromptAddition: buildRecallHint(conversationId),
      };
    } catch (error) {
      console.warn(`[${ENGINE_ID}] assemble failed: ${error instanceof Error ? error.message : String(error)}`);
      const fallbackMessages = Array.isArray(params.messages)
        ? params.messages.filter((message) => {
          const contentType = classifyMessage(message);
          return contentType !== 'noise' && contentType !== 'resolved';
        })
        : [];

      return {
        messages: fallbackMessages as AssembleResult['messages'],
        estimatedTokens: estimateCurrentPressure(fallbackMessages),
        systemPromptAddition: '',
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
    let conversationId: number | null = null;
    const tokenBudget = resolveTokenBudget(params.tokenBudget ?? config.defaultTokenBudget);

    try {
      conversationId = getOrCreateConversationId(params.sessionId);

      const effectiveSessionFile = params.sessionFile && params.sessionFile.trim().length > 0
        ? params.sessionFile
        : null;

      if (effectiveSessionFile === null) {
        console.log(`[${ENGINE_ID}] compact() running without session file for session ${params.sessionId}`);
      }

      if (!kernelSlotsPresent(db, conversationId)) {
        console.warn(`[${ENGINE_ID}] compact() refused: identity_kernel slot missing. Run bootstrap() first.`);
        return { ok: false, compacted: false, reason: 'kernel_slots_missing' };
      }

      if (!config.summarizationApi) {
        return {
          ok: true,
          compacted: false,
          reason: 'no_summarization_api_configured',
        };
      }

      const pressureBeforeTokens =
        typeof params.currentTokenCount === 'number' && Number.isFinite(params.currentTokenCount)
          ? params.currentTokenCount
          : estimatePressureFromDb(conversationId);
      const messagesBefore = getMessageCount(db, conversationId);

      const result = await runCompaction(
        db,
        config.summarizationApi,
        conversationId,
        compactorConfig,
        summarizationTracker,
        {
          force: params.force,
          tokenBudget,
          currentTokenCount: pressureBeforeTokens,
        },
      );

      if (result.ok && result.compacted) {
        recordCompactionEvent({
          db,
          conversationId,
          triggerReason: params.force ? 'forced' : (params.compactionTarget ?? 'threshold'),
          pressureBefore: tokenBudget > 0 ? pressureBeforeTokens / tokenBudget : 0,
          messagesBefore,
          outcome: 'success',
        });
      }

      return result;
    } catch (error) {
      if (typeof conversationId === 'number') {
        const pressureBeforeTokens = estimatePressureFromDb(conversationId);
        const messagesBefore = getMessageCount(db, conversationId);

        recordCompactionEvent({
          db,
          conversationId,
          triggerReason: params.force ? 'forced' : (params.compactionTarget ?? 'threshold'),
          pressureBefore: pressureBeforeTokens / resolveTokenBudget(config.defaultTokenBudget),
          messagesBefore,
          outcome: 'failed',
        });
      }

      console.warn(`[${ENGINE_ID}] compact() failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        ok: false,
        compacted: false,
        reason: 'compact_error',
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
      const breaker = Math.floor(budget * EMERGENCY_FILL_RATIO);
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
      version: '0.4.0-walk4',
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
