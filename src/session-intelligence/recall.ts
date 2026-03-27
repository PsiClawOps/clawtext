import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const DEFAULT_LIMIT = 10;
const MAX_SNIPPET_LENGTH = 300;
// Default resolved at call time from config.workspacePath when not explicitly passed.
// This constant is a fallback only — callers should pass libraryEntriesDir explicitly.
const DEFAULT_LIBRARY_ENTRIES_DIR = path.join(
  process.env['OPENCLAW_WORKSPACE'] ?? path.join(process.env['HOME'] ?? '', '.openclaw', 'workspace'),
  'state', 'clawtext', 'prod', 'library', 'entries',
);

export type RecallHitType =
  | 'message'
  | 'summary'
  | 'state_slot'
  | 'library_entry';

export type RecallHit = {
  type: RecallHitType;
  id: string;
  score: number;
  snippet: string;
  metadata: Record<string, unknown>;
};

export type SearchResult = {
  hits: RecallHit[];
  totalFound: number;
  queryMs: number;
};

export type DescribeResult = {
  type: RecallHitType;
  id: string;
  fullContent: string;
  metadata: Record<string, unknown>;
};

export type ExpandResult = {
  type: 'summary_expansion';
  summaryId: number;
  messages: Array<{ role: string; content: string; index: number }>;
  totalMessages: number;
};

function buildSnippet(content: string): string {
  return content.slice(0, MAX_SNIPPET_LENGTH);
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.floor(limit);
}

function normalizeTypes(types?: RecallHitType[]): RecallHitType[] {
  const allTypes: RecallHitType[] = ['message', 'summary', 'state_slot', 'library_entry'];

  if (!Array.isArray(types) || types.length === 0) {
    return allTypes;
  }

  const unique = new Set<RecallHitType>();
  for (const type of types) {
    if (allTypes.includes(type)) unique.add(type);
  }

  return unique.size > 0 ? [...unique] : allTypes;
}

export function search(params: {
  db: DatabaseSync;
  conversationId: number;
  query: string;
  limit?: number;
  types?: RecallHitType[];
  libraryEntriesDir?: string;
}): SearchResult {
  const startedAt = Date.now();
  const limit = normalizeLimit(params.limit);
  const types = normalizeTypes(params.types);
  const query = String(params.query ?? '');
  const hits: RecallHit[] = [];

  if (types.includes('message')) {
    const rows = params.db
      .prepare(
        `SELECT id, message_index, role, content, content_type
           FROM messages
          WHERE conversation_id = ?
            AND content LIKE '%' || ? || '%'
          ORDER BY message_index DESC
          LIMIT ?`,
      )
      .all(params.conversationId, query, limit) as Array<{
      id: number;
      message_index: number;
      role: string;
      content: string;
      content_type: string | null;
    }>;

    for (const row of rows) {
      hits.push({
        type: 'message',
        id: `msg-${row.id}`,
        score: 0.6,
        snippet: buildSnippet(row.content),
        metadata: {
          role: row.role,
          index: row.message_index,
          content_type: row.content_type,
        },
      });
    }
  }

  if (types.includes('summary')) {
    const rows = params.db
      .prepare(
        `SELECT id, content, depth, source_content_types
           FROM summaries
          WHERE conversation_id = ?
            AND content LIKE '%' || ? || '%'
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(params.conversationId, query, limit) as Array<{
      id: number;
      content: string;
      depth: number;
      source_content_types: string | null;
    }>;

    for (const row of rows) {
      hits.push({
        type: 'summary',
        id: `sum-${row.id}`,
        score: 0.7,
        snippet: buildSnippet(row.content),
        metadata: {
          summary_type: row.depth === 0 ? 'leaf' : 'condensed',
          depth: row.depth,
          source_content_types: row.source_content_types,
        },
      });
    }
  }

  if (types.includes('state_slot')) {
    const rows = params.db
      .prepare(
        `SELECT id, slot_name, content, is_pinned
           FROM state_slots
          WHERE conversation_id = ?
            AND (content LIKE '%' || ? || '%' OR slot_name LIKE '%' || ? || '%')
          ORDER BY slot_name
          LIMIT ?`,
      )
      .all(params.conversationId, query, query, limit) as Array<{
      id: number;
      slot_name: string;
      content: string;
      is_pinned: number;
    }>;

    for (const row of rows) {
      hits.push({
        type: 'state_slot',
        id: `slot-${row.slot_name}`,
        score: 0.8,
        snippet: buildSnippet(row.content),
        metadata: {
          slot_name: row.slot_name,
          is_pinned: row.is_pinned,
        },
      });
    }
  }

  if (types.includes('library_entry')) {
    const libraryEntriesDir = params.libraryEntriesDir ?? DEFAULT_LIBRARY_ENTRIES_DIR;
    const lowerQuery = query.toLowerCase();

    if (fs.existsSync(libraryEntriesDir)) {
      const filenames = fs.readdirSync(libraryEntriesDir)
        .filter((name) => name.toLowerCase().endsWith('.md'));

      let matchedCount = 0;
      for (const filename of filenames) {
        if (matchedCount >= limit) break;

        const filePath = path.resolve(libraryEntriesDir, filename);
        let content = '';

        try {
          if (!fs.statSync(filePath).isFile()) continue;
          content = fs.readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }

        if (!content.toLowerCase().includes(lowerQuery)) continue;

        hits.push({
          type: 'library_entry',
          id: `lib-${filename}`,
          score: 0.5,
          snippet: buildSnippet(content),
          metadata: {
            filename,
            path: filePath,
          },
        });

        matchedCount += 1;
      }
    }
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  const queryMs = Date.now() - startedAt;
  return {
    hits,
    totalFound: hits.length,
    queryMs,
  };
}

export function describe(params: {
  db: DatabaseSync;
  conversationId: number;
  id: string;
  libraryEntriesDir?: string;
}): DescribeResult | null {
  if (!params.id || typeof params.id !== 'string') {
    return null;
  }

  if (params.id.startsWith('msg-')) {
    const messageId = Number.parseInt(params.id.slice(4), 10);
    if (!Number.isFinite(messageId)) return null;

    const row = params.db
      .prepare(
        `SELECT message_index, role, content, content_type
           FROM messages
          WHERE id = ? AND conversation_id = ?
          LIMIT 1`,
      )
      .get(messageId, params.conversationId) as {
      message_index: number;
      role: string;
      content: string;
      content_type: string | null;
    } | undefined;

    if (!row) return null;

    return {
      type: 'message',
      id: params.id,
      fullContent: row.content,
      metadata: {
        role: row.role,
        index: row.message_index,
        content_type: row.content_type,
      },
    };
  }

  if (params.id.startsWith('sum-')) {
    const summaryId = Number.parseInt(params.id.slice(4), 10);
    if (!Number.isFinite(summaryId)) return null;

    const row = params.db
      .prepare(
        `SELECT depth, content, source_content_types
           FROM summaries
          WHERE id = ? AND conversation_id = ?
          LIMIT 1`,
      )
      .get(summaryId, params.conversationId) as {
      depth: number;
      content: string;
      source_content_types: string | null;
    } | undefined;

    if (!row) return null;

    return {
      type: 'summary',
      id: params.id,
      fullContent: row.content,
      metadata: {
        summary_type: row.depth === 0 ? 'leaf' : 'condensed',
        depth: row.depth,
        source_content_types: row.source_content_types,
      },
    };
  }

  if (params.id.startsWith('slot-')) {
    const slotName = params.id.slice(5);
    if (slotName.length === 0) return null;

    const row = params.db
      .prepare(
        `SELECT content, is_pinned
           FROM state_slots
          WHERE slot_name = ? AND conversation_id = ?
          LIMIT 1`,
      )
      .get(slotName, params.conversationId) as {
      content: string;
      is_pinned: number;
    } | undefined;

    if (!row) return null;

    return {
      type: 'state_slot',
      id: params.id,
      fullContent: row.content,
      metadata: {
        slot_name: slotName,
        is_pinned: row.is_pinned,
      },
    };
  }

  if (params.id.startsWith('lib-')) {
    const filename = params.id.slice(4);
    if (filename.length === 0 || filename.includes('/') || filename.includes('\\')) {
      return null;
    }

    const libraryEntriesDir = params.libraryEntriesDir ?? DEFAULT_LIBRARY_ENTRIES_DIR;
    if (!fs.existsSync(libraryEntriesDir)) return null;

    const filePath = path.resolve(libraryEntriesDir, filename);
    if (!filePath.startsWith(path.resolve(libraryEntriesDir))) return null;

    try {
      if (!fs.statSync(filePath).isFile()) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        type: 'library_entry',
        id: params.id,
        fullContent: content,
        metadata: {
          filename,
          path: filePath,
        },
      };
    } catch {
      return null;
    }
  }

  return null;
}

function getLinkedMessageIds(
  db: DatabaseSync,
  summaryId: number,
): number[] {
  const tableInfo = db.prepare('PRAGMA table_info(summary_parents)').all() as Array<{ name: string }>;
  const columnNames = new Set(tableInfo.map((row) => row.name));

  if (columnNames.has('summary_id') && columnNames.has('message_id')) {
    const rows = db
      .prepare('SELECT p.message_id FROM summary_parents p WHERE p.summary_id = ?')
      .all(summaryId) as Array<{ message_id: number }>;
    return rows.map((row) => row.message_id);
  }

  if (columnNames.has('parent_summary_id') && columnNames.has('child_summary_id')) {
    const visited = new Set<number>();
    const stack = [summaryId];
    const messageIds = new Set<number>();

    const childStmt = db.prepare('SELECT child_summary_id FROM summary_parents WHERE parent_summary_id = ?');
    const messageStmt = db.prepare('SELECT message_id FROM summary_messages WHERE summary_id = ?');

    while (stack.length > 0) {
      const current = stack.pop();
      if (typeof current !== 'number' || visited.has(current)) continue;
      visited.add(current);

      const messageRows = messageStmt.all(current) as Array<{ message_id: number }>;
      for (const row of messageRows) {
        messageIds.add(row.message_id);
      }

      const childRows = childStmt.all(current) as Array<{ child_summary_id: number }>;
      for (const row of childRows) {
        if (!visited.has(row.child_summary_id)) {
          stack.push(row.child_summary_id);
        }
      }
    }

    return [...messageIds];
  }

  return [];
}

export function expand(params: {
  db: DatabaseSync;
  conversationId: number;
  summaryId: number;
}): ExpandResult | null {
  const summaryExists = params.db
    .prepare('SELECT id FROM summaries WHERE id = ? AND conversation_id = ? LIMIT 1')
    .get(params.summaryId, params.conversationId) as { id: number } | undefined;

  if (!summaryExists) {
    return null;
  }

  const messageIds = getLinkedMessageIds(params.db, params.summaryId);
  if (messageIds.length === 0) {
    return null;
  }

  const inClause = messageIds.map(() => '?').join(', ');
  const rows = params.db
    .prepare(
      `SELECT id, message_index, role, content
         FROM messages
        WHERE conversation_id = ?
          AND id IN (${inClause})
        ORDER BY message_index ASC`,
    )
    .all(params.conversationId, ...messageIds) as Array<{
    id: number;
    message_index: number;
    role: string;
    content: string;
  }>;

  if (rows.length === 0) {
    return null;
  }

  return {
    type: 'summary_expansion',
    summaryId: params.summaryId,
    messages: rows.map((row) => ({
      role: row.role,
      content: row.content,
      index: row.message_index,
    })),
    totalMessages: rows.length,
  };
}
