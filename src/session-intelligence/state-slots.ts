import crypto from 'crypto';
import type { DatabaseSync } from 'node:sqlite';

type StatementRunResult = {
  lastInsertRowid?: number | bigint;
  changes?: number;
};

type StateSlotRow = {
  id: number;
  content: string;
  loaded_from: string | null;
  is_pinned: number;
};

type StateSlotListRow = {
  slot_name: string;
  content: string;
  is_pinned: number;
  loaded_from: string | null;
};

function toRowId(value: number | bigint | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error('[clawtext-session-intelligence] Missing lastInsertRowid from SQLite run result');
}

function toSha16(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function upsertStateSlot(
  db: DatabaseSync,
  conversationId: number,
  slotName: string,
  content: string,
  options?: { loadedFrom?: string; isPinned?: boolean },
): number {
  const now = new Date().toISOString();
  const contentHash = toSha16(content);
  const loadedFrom = typeof options?.loadedFrom === 'string' ? options.loadedFrom : null;
  const isPinned = options?.isPinned === true ? 1 : 0;

  const runResult = db
    .prepare(
      `INSERT OR REPLACE INTO state_slots
        (conversation_id, slot_name, content, content_hash, loaded_from, is_pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(conversationId, slotName, content, contentHash, loadedFrom, isPinned, now, now) as StatementRunResult;

  const insertedId = toRowId(runResult.lastInsertRowid);
  if (insertedId > 0) {
    return insertedId;
  }

  const row = db
    .prepare('SELECT id FROM state_slots WHERE conversation_id = ? AND slot_name = ? LIMIT 1')
    .get(conversationId, slotName) as { id: number } | undefined;

  if (!row || typeof row.id !== 'number') {
    throw new Error('[clawtext-session-intelligence] Failed to upsert state slot row');
  }

  return row.id;
}

export function getStateSlot(
  db: DatabaseSync,
  conversationId: number,
  slotName: string,
): { content: string; loadedFrom?: string; isPinned: boolean } | null {
  const row = db
    .prepare(
      `SELECT id, content, loaded_from, is_pinned
         FROM state_slots
        WHERE conversation_id = ?
          AND slot_name = ?
        LIMIT 1`,
    )
    .get(conversationId, slotName) as StateSlotRow | undefined;

  if (!row) return null;

  return {
    content: row.content,
    loadedFrom: typeof row.loaded_from === 'string' ? row.loaded_from : undefined,
    isPinned: row.is_pinned === 1,
  };
}

export function getAllStateSlots(
  db: DatabaseSync,
  conversationId: number,
): Array<{ slotName: string; content: string; isPinned: boolean; loadedFrom?: string }> {
  const rows = db
    .prepare(
      `SELECT slot_name, content, is_pinned, loaded_from
         FROM state_slots
        WHERE conversation_id = ?
        ORDER BY slot_name ASC`,
    )
    .all(conversationId) as StateSlotListRow[];

  return rows.map((row) => ({
    slotName: row.slot_name,
    content: row.content,
    isPinned: row.is_pinned === 1,
    loadedFrom: typeof row.loaded_from === 'string' ? row.loaded_from : undefined,
  }));
}

export function kernelSlotsPresent(db: DatabaseSync, conversationId: number): boolean {
  const row = db
    .prepare(
      `SELECT id
         FROM state_slots
        WHERE conversation_id = ?
          AND slot_name = 'identity_kernel'
        LIMIT 1`,
    )
    .get(conversationId) as { id: number } | undefined;

  return typeof row?.id === 'number';
}

export function pinStateSlot(db: DatabaseSync, conversationId: number, slotName: string): void {
  db
    .prepare(
      `UPDATE state_slots
          SET is_pinned = 1,
              updated_at = ?
        WHERE conversation_id = ?
          AND slot_name = ?`,
    )
    .run(new Date().toISOString(), conversationId, slotName);
}
