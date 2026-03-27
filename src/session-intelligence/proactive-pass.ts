import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db';
import { externalizePayload } from './large-file';
import { insertPayloadRef } from './payload-store';

export type ProactivePassResult = {
  messagesMarked: number;
  tokensFreed: number;
  passType: 'noise_sweep' | 'tool_decay' | 'staleness';
};

const MAX_EXTERNALIZATIONS_PER_PASS = 10;

function resolveSafeWindow(recentWindowSize: number): number {
  if (Number.isFinite(recentWindowSize) && recentWindowSize > 0) {
    return Math.floor(recentWindowSize);
  }
  return 20;
}

function getMaxMessageIndex(db: DatabaseSync, conversationId: number): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(message_index), -1) AS max_index FROM messages WHERE conversation_id = ?')
    .get(conversationId) as { max_index: number | null };

  return typeof row.max_index === 'number' ? row.max_index : -1;
}

function estimateTokens(contentLength: number): number {
  return Math.max(0, Math.ceil(contentLength / 4));
}

export function runNoiseSweep(
  db: DatabaseSync,
  conversationId: number,
  recentWindowSize: number = 20,
): ProactivePassResult {
  const safeWindow = resolveSafeWindow(recentWindowSize);
  const maxIndex = getMaxMessageIndex(db, conversationId);
  const cutoffIndexExclusive = maxIndex - safeWindow;

  const candidates = db
    .prepare(
      `SELECT id, token_count, content
         FROM messages
        WHERE conversation_id = ?
          AND content_type = 'noise'
          AND message_index < ?`,
    )
    .all(conversationId, cutoffIndexExclusive) as Array<{ id: number; token_count: number | null; content: string }>;

  if (candidates.length === 0) {
    return {
      messagesMarked: 0,
      tokensFreed: 0,
      passType: 'noise_sweep',
    };
  }

  const ids = candidates.map((row) => row.id);
  const inClause = Array.from({ length: ids.length }, () => '?').join(', ');

  const messagesMarked = withTransaction(db, () => {
    const updateResult = db
      .prepare(`UPDATE messages SET content_type = 'resolved' WHERE id IN (${inClause})`)
      .run(...ids) as { changes?: number };

    return typeof updateResult.changes === 'number' ? updateResult.changes : ids.length;
  });

  const tokensFreed = candidates.reduce((sum, row) => {
    if (typeof row.token_count === 'number' && row.token_count > 0) {
      return sum + row.token_count;
    }

    return sum + estimateTokens(row.content.length);
  }, 0);

  return {
    messagesMarked,
    tokensFreed,
    passType: 'noise_sweep',
  };
}

export function runToolDecay(
  db: DatabaseSync,
  dbConversationId: number,
  workspacePath: string,
  conversationId: string,
  recentWindowSize: number = 20,
): ProactivePassResult {
  const safeWindow = resolveSafeWindow(recentWindowSize);
  const maxIndex = getMaxMessageIndex(db, dbConversationId);
  const cutoffIndexExclusive = maxIndex - safeWindow;

  const candidates = db
    .prepare(
      `SELECT id, content
         FROM messages
        WHERE conversation_id = ?
          AND content_type = 'tool_result'
          AND message_index < ?
          AND length(content) > 2000
          AND (truncated_payload_ref IS NULL OR truncated_payload_ref = '')
        ORDER BY message_index ASC`,
    )
    .all(dbConversationId, cutoffIndexExclusive) as Array<{ id: number; content: string }>;

  if (candidates.length === 0) {
    return {
      messagesMarked: 0,
      tokensFreed: 0,
      passType: 'tool_decay',
    };
  }

  let messagesMarked = 0;
  let tokensFreed = 0;
  let externalized = 0;

  for (const row of candidates) {
    if (externalized >= MAX_EXTERNALIZATIONS_PER_PASS) break;

    const payloadRef = externalizePayload(workspacePath, conversationId, row.content);
    if (!payloadRef.storagePath) {
      console.warn(`[clawtext-session-intelligence] Tool decay skipped (externalize failed) for message ${row.id}`);
      continue;
    }

    const compactToken = `<<PAYLOAD_REF:${payloadRef.refId}:${payloadRef.contentHash}:${payloadRef.originalSize}>>`;

    try {
      withTransaction(db, () => {
        insertPayloadRef(db, {
          ...payloadRef,
          conversationId,
        });

        db
          .prepare(
            `UPDATE messages
                SET content = ?,
                    token_count = ?,
                    truncated_payload_ref = ?
              WHERE id = ?`,
          )
          .run(compactToken, estimateTokens(compactToken.length), payloadRef.refId, row.id);
      });

      messagesMarked += 1;
      tokensFreed += Math.max(0, estimateTokens(row.content.length) - estimateTokens(compactToken.length));
      externalized += 1;
    } catch (error) {
      console.warn(
        `[clawtext-session-intelligence] Tool decay skipped (DB insert/update failed) for message ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    messagesMarked,
    tokensFreed,
    passType: 'tool_decay',
  };
}
