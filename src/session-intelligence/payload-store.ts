import type { DatabaseSync } from 'node:sqlite';
import type { PayloadRef } from './large-file';

export type StoredPayloadRef = PayloadRef & {
  conversationId: string;
  hint?: string;
  status: 'active' | 'expired';
  expiresAt?: number;
};

function getPayloadRefColumns(db: DatabaseSync): Set<string> {
  const rows = db
    .prepare('PRAGMA table_info(payload_refs)')
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

export function insertPayloadRef(
  db: DatabaseSync,
  ref: PayloadRef & {
    conversationId: string;
    hint?: string;
    status?: 'active' | 'expired';
    expiresAt?: number;
  },
): void {
  const columns = getPayloadRefColumns(db);
  const hasStoredAt = columns.has('stored_at');

  if (hasStoredAt) {
    db
      .prepare(
        `INSERT INTO payload_refs (
          ref_id,
          conversation_id,
          storage_path,
          original_size,
          stored_at,
          content_hash,
          created_at,
          hint,
          status,
          expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ref.refId,
        ref.conversationId,
        ref.storagePath ?? null,
        ref.originalSize,
        ref.storedAt,
        ref.contentHash,
        ref.createdAt,
        ref.hint ?? null,
        ref.status ?? 'active',
        typeof ref.expiresAt === 'number' ? ref.expiresAt : null,
      );
    return;
  }

  db
    .prepare(
      `INSERT INTO payload_refs (
        ref_id,
        conversation_id,
        storage_path,
        original_size,
        content_hash,
        created_at,
        hint,
        status,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ref.refId,
      ref.conversationId,
      ref.storagePath ?? null,
      ref.originalSize,
      ref.contentHash,
      ref.createdAt,
      ref.hint ?? null,
      ref.status ?? 'active',
      typeof ref.expiresAt === 'number' ? ref.expiresAt : null,
    );
}

export function getPayloadRef(db: DatabaseSync, refId: string): StoredPayloadRef | null {
  const columns = getPayloadRefColumns(db);
  const storedAtExpr = columns.has('stored_at') ? 'stored_at' : "'' AS stored_at";
  const statusExpr = columns.has('status') ? 'status' : "'active' AS status";
  const expiresAtExpr = columns.has('expires_at') ? 'expires_at' : 'NULL AS expires_at';
  const hintExpr = columns.has('hint') ? 'hint' : 'NULL AS hint';
  const storagePathExpr = columns.has('storage_path') ? 'storage_path' : 'NULL AS storage_path';

  const row = db
    .prepare(
      `SELECT
        ref_id,
        conversation_id,
        ${storagePathExpr},
        original_size,
        ${storedAtExpr},
        content_hash,
        created_at,
        ${hintExpr},
        ${statusExpr},
        ${expiresAtExpr}
       FROM payload_refs
       WHERE ref_id = ?
       LIMIT 1`,
    )
    .get(refId) as {
    ref_id: string;
    conversation_id: string | number;
    storage_path: string | null;
    original_size: number;
    stored_at: string;
    content_hash: string;
    created_at: string;
    hint: string | null;
    status: string | null;
    expires_at: number | null;
  } | undefined;

  if (!row) return null;

  const status = row.status === 'expired' ? 'expired' : 'active';

  return {
    refId: row.ref_id,
    conversationId: String(row.conversation_id),
    storagePath: row.storage_path ?? undefined,
    originalSize: row.original_size,
    storedAt: row.stored_at,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    hint: row.hint ?? undefined,
    status,
    expiresAt: typeof row.expires_at === 'number' ? row.expires_at : undefined,
  };
}

export function listPayloadRefs(db: DatabaseSync, conversationId: string): StoredPayloadRef[] {
  const columns = getPayloadRefColumns(db);
  const storedAtExpr = columns.has('stored_at') ? 'stored_at' : "'' AS stored_at";
  const statusExpr = columns.has('status') ? 'status' : "'active' AS status";
  const expiresAtExpr = columns.has('expires_at') ? 'expires_at' : 'NULL AS expires_at';
  const hintExpr = columns.has('hint') ? 'hint' : 'NULL AS hint';
  const storagePathExpr = columns.has('storage_path') ? 'storage_path' : 'NULL AS storage_path';

  const rows = db
    .prepare(
      `SELECT
        ref_id,
        conversation_id,
        ${storagePathExpr},
        original_size,
        ${storedAtExpr},
        content_hash,
        created_at,
        ${hintExpr},
        ${statusExpr},
        ${expiresAtExpr}
       FROM payload_refs
       WHERE conversation_id = ?
       ORDER BY created_at DESC`,
    )
    .all(conversationId) as Array<{
    ref_id: string;
    conversation_id: string | number;
    storage_path: string | null;
    original_size: number;
    stored_at: string;
    content_hash: string;
    created_at: string;
    hint: string | null;
    status: string | null;
    expires_at: number | null;
  }>;

  return rows.map((row) => ({
    refId: row.ref_id,
    conversationId: String(row.conversation_id),
    storagePath: row.storage_path ?? undefined,
    originalSize: row.original_size,
    storedAt: row.stored_at,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    hint: row.hint ?? undefined,
    status: row.status === 'expired' ? 'expired' : 'active',
    expiresAt: typeof row.expires_at === 'number' ? row.expires_at : undefined,
  }));
}

export function markPayloadRefExpired(db: DatabaseSync, refId: string): void {
  const columns = getPayloadRefColumns(db);
  if (columns.has('status') && columns.has('expires_at')) {
    db
      .prepare(
        `UPDATE payload_refs
            SET status = 'expired',
                expires_at = ?
          WHERE ref_id = ?`,
      )
      .run(Date.now(), refId);
    return;
  }

  if (columns.has('status')) {
    db
      .prepare("UPDATE payload_refs SET status = 'expired' WHERE ref_id = ?")
      .run(refId);
  }
}
