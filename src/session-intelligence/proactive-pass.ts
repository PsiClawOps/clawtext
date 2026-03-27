import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db';

export type ProactivePassResult = {
  messagesMarked: number;
  tokensFreed: number;
  passType: 'noise_sweep' | 'tool_decay' | 'staleness';
};

const TOOL_DECAY_SUFFIX = '\n[truncated by proactive pass]';

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
  conversationId: number,
  recentWindowSize: number = 20,
): ProactivePassResult {
  const safeWindow = resolveSafeWindow(recentWindowSize);
  const maxIndex = getMaxMessageIndex(db, conversationId);
  const cutoffIndexExclusive = maxIndex - safeWindow;

  const candidates = db
    .prepare(
      `SELECT id, content
         FROM messages
        WHERE conversation_id = ?
          AND content_type = 'tool_result'
          AND message_index < ?
          AND length(content) > 2000`,
    )
    .all(conversationId, cutoffIndexExclusive) as Array<{ id: number; content: string }>;

  if (candidates.length === 0) {
    return {
      messagesMarked: 0,
      tokensFreed: 0,
      passType: 'tool_decay',
    };
  }

  let messagesMarked = 0;
  let tokensFreed = 0;

  withTransaction(db, () => {
    const updateStmt = db.prepare(
      `UPDATE messages
          SET content = ?,
              token_count = ?
        WHERE id = ?`,
    );

    for (const row of candidates) {
      const originalLength = row.content.length;
      const truncatedContent = `${row.content.slice(0, 200)}${TOOL_DECAY_SUFFIX}`;

      updateStmt.run(truncatedContent, estimateTokens(truncatedContent.length), row.id);
      messagesMarked += 1;
      tokensFreed += Math.max(0, Math.ceil((originalLength - 215) / 4));
    }
  });

  return {
    messagesMarked,
    tokensFreed,
    passType: 'tool_decay',
  };
}
