import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db';

type SummaryLookupRow = {
  id: number;
  conversation_id: number;
  depth: number;
  content: string;
  token_count: number | null;
  source_content_types: string | null;
  staleness_score: number;
  created_at: string;
  updated_at: string;
};

export type SummarizableMessageRow = {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  content_type: string;
  token_count: number | null;
  message_index: number;
  is_heartbeat: number;
  summarized?: number;
  created_at: string;
};

export type SummaryLineage = {
  messageIds: number[];
  summaryIds: number[];
};

function ensureSummarizedColumn(db: DatabaseSync): void {
  try {
    db.exec('ALTER TABLE messages ADD COLUMN summarized INTEGER NOT NULL DEFAULT 0');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

function buildInClause(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function createLeafSummary(
  db: DatabaseSync,
  conversationId: number,
  messages: Array<{ id: number }>,
  summaryContent: string,
  sourceContentTypes: string,
): number {
  return withTransaction(db, () => {
    const now = new Date().toISOString();
    const summaryResult = db
      .prepare(
        `INSERT INTO summaries
          (conversation_id, depth, content, token_count, source_content_types, staleness_score, created_at, updated_at)
         VALUES (?, 0, ?, ?, ?, 0.0, ?, ?)`,
      )
      .run(conversationId, summaryContent, estimateTokenCount(summaryContent), sourceContentTypes, now, now) as {
      lastInsertRowid: number | bigint;
    };

    const summaryId = Number(summaryResult.lastInsertRowid);
    const linkStmt = db.prepare('INSERT INTO summary_messages (summary_id, message_id) VALUES (?, ?)');

    for (const message of messages) {
      linkStmt.run(summaryId, message.id);
    }

    return summaryId;
  });
}

export function createCondensedSummary(
  db: DatabaseSync,
  conversationId: number,
  childSummaryIds: number[],
  summaryContent: string,
  sourceContentTypes: string,
): number {
  if (childSummaryIds.length === 0) {
    throw new Error('[clawtext-session-intelligence] Cannot create condensed summary without children');
  }

  return withTransaction(db, () => {
    const inClause = buildInClause(childSummaryIds.length);
    const depthRow = db
      .prepare(`SELECT COALESCE(MAX(depth), 0) AS max_depth FROM summaries WHERE id IN (${inClause})`)
      .get(...childSummaryIds) as { max_depth: number | null };

    const parentDepth = (typeof depthRow.max_depth === 'number' ? depthRow.max_depth : 0) + 1;
    const now = new Date().toISOString();

    const summaryResult = db
      .prepare(
        `INSERT INTO summaries
          (conversation_id, depth, content, token_count, source_content_types, staleness_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0.0, ?, ?)`,
      )
      .run(
        conversationId,
        parentDepth,
        summaryContent,
        estimateTokenCount(summaryContent),
        sourceContentTypes,
        now,
        now,
      ) as { lastInsertRowid: number | bigint };

    const parentSummaryId = Number(summaryResult.lastInsertRowid);
    const linkStmt = db.prepare(
      'INSERT INTO summary_parents (parent_summary_id, child_summary_id) VALUES (?, ?)',
    );

    for (const childSummaryId of childSummaryIds) {
      linkStmt.run(parentSummaryId, childSummaryId);
    }

    return parentSummaryId;
  });
}

export function getLeafSummaries(db: DatabaseSync, conversationId: number): SummaryLookupRow[] {
  return db
    .prepare(
      `SELECT id, conversation_id, depth, content, token_count, source_content_types, staleness_score, created_at, updated_at
         FROM summaries
        WHERE conversation_id = ? AND depth = 0
        ORDER BY created_at ASC, id ASC`,
    )
    .all(conversationId) as SummaryLookupRow[];
}

export function getSummaryLineage(db: DatabaseSync, summaryId: number): SummaryLineage {
  const visitedSummaries = new Set<number>();
  const visitedMessages = new Set<number>();
  const stack: number[] = [summaryId];

  const messageStmt = db.prepare('SELECT message_id FROM summary_messages WHERE summary_id = ?');
  const childStmt = db.prepare('SELECT child_summary_id FROM summary_parents WHERE parent_summary_id = ?');

  while (stack.length > 0) {
    const currentSummaryId = stack.pop();
    if (typeof currentSummaryId !== 'number') continue;
    if (visitedSummaries.has(currentSummaryId)) continue;

    visitedSummaries.add(currentSummaryId);

    const linkedMessages = messageStmt.all(currentSummaryId) as Array<{ message_id: number }>;
    for (const row of linkedMessages) {
      visitedMessages.add(row.message_id);
    }

    const children = childStmt.all(currentSummaryId) as Array<{ child_summary_id: number }>;
    for (const child of children) {
      if (!visitedSummaries.has(child.child_summary_id)) {
        stack.push(child.child_summary_id);
      }
    }
  }

  return {
    messageIds: [...visitedMessages].sort((a, b) => a - b),
    summaryIds: [...visitedSummaries].sort((a, b) => a - b),
  };
}

export function markMessagesAsSummarized(db: DatabaseSync, messageIds: number[]): void {
  ensureSummarizedColumn(db);
  if (messageIds.length === 0) return;

  const inClause = buildInClause(messageIds.length);
  db.prepare(`UPDATE messages SET summarized = 1 WHERE id IN (${inClause})`).run(...messageIds);
}

export function getSummarizableMessages(
  db: DatabaseSync,
  conversationId: number,
  excludeRecentCount: number,
): SummarizableMessageRow[] {
  ensureSummarizedColumn(db);

  if (excludeRecentCount <= 0) {
    return db
      .prepare(
        `SELECT id, conversation_id, role, content, content_type, token_count, message_index, is_heartbeat, summarized, created_at
           FROM messages
          WHERE conversation_id = ?
            AND is_heartbeat = 0
            AND COALESCE(summarized, 0) = 0
          ORDER BY message_index ASC`,
      )
      .all(conversationId) as SummarizableMessageRow[];
  }

  return db
    .prepare(
      `SELECT id, conversation_id, role, content, content_type, token_count, message_index, is_heartbeat, summarized, created_at
         FROM messages
        WHERE conversation_id = ?
          AND is_heartbeat = 0
          AND COALESCE(summarized, 0) = 0
          AND message_index < COALESCE(
            (
              SELECT MIN(message_index)
              FROM (
                SELECT message_index
                  FROM messages
                 WHERE conversation_id = ?
                 ORDER BY message_index DESC
                 LIMIT ?
              )
            ),
            9223372036854775807
          )
        ORDER BY message_index ASC`,
    )
    .all(conversationId, conversationId, excludeRecentCount) as SummarizableMessageRow[];
}
