/**
 * Session Intelligence SQLite schema and migrations.
 *
 * Walk 1a initialized foundational persistence tables.
 * Walk 1b adds summary DAG tables and message summarized-state tracking.
 * Walk 2 adds ACA state-slot persistence for identity protection lanes.
 * Walk 3 adds compaction event persistence for threshold/cooldown logic.
 */

import type { DatabaseSync } from 'node:sqlite';

const LATEST_SCHEMA_VERSION = 9;

function nowIso(): string {
  return new Date().toISOString();
}

function createBaseSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL UNIQUE,
      session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'active',
      token_count INTEGER,
      message_index INTEGER NOT NULL,
      is_heartbeat INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id),
      part_type TEXT NOT NULL,
      content TEXT,
      metadata TEXT
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_index ON messages(conversation_id, message_index);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_message_parts_message_id ON message_parts(message_id);');
}

function applyVersion2Migration(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      depth INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      token_count INTEGER,
      source_content_types TEXT,
      staleness_score REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS summary_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary_id INTEGER NOT NULL REFERENCES summaries(id),
      message_id INTEGER NOT NULL REFERENCES messages(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS summary_parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_summary_id INTEGER NOT NULL REFERENCES summaries(id),
      child_summary_id INTEGER NOT NULL REFERENCES summaries(id)
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_summaries_conversation_depth ON summaries(conversation_id, depth);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_summary_messages_summary_id ON summary_messages(summary_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_summary_messages_message_id ON summary_messages(message_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_summary_parents_parent_id ON summary_parents(parent_summary_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_summary_parents_child_id ON summary_parents(child_summary_id);');

  try {
    db.exec('ALTER TABLE messages ADD COLUMN summarized INTEGER NOT NULL DEFAULT 0');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

function applyVersion3Migration(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      slot_name TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT,
      loaded_from TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(conversation_id, slot_name)
    )
  `);
}

function applyVersion4Migration(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS compaction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      triggered_at TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      pressure_before REAL,
      pressure_after REAL,
      messages_before INTEGER,
      messages_after INTEGER,
      summary_node_id INTEGER,
      outcome TEXT NOT NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_compaction_events_conversation ON compaction_events(conversation_id, triggered_at DESC, id DESC);');
}

function applyVersion5Migration(db: DatabaseSync): void {
  try {
    db.exec("ALTER TABLE messages ADD COLUMN content_type TEXT NOT NULL DEFAULT 'active'");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    db.exec('ALTER TABLE summaries ADD COLUMN source_content_types TEXT');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

function applyVersion6Migration(db: DatabaseSync): void {
  try {
    db.exec('ALTER TABLE messages ADD COLUMN staleness_score REAL NOT NULL DEFAULT 0.0');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

function applyVersion7Migration(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payload_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      ref_id TEXT NOT NULL UNIQUE,
      original_size INTEGER NOT NULL,
      stored_at TEXT NOT NULL,
      content_hash TEXT,
      hint TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

function applyVersion8Migration(db: DatabaseSync): void {
  const columns = db
    .prepare('PRAGMA table_info(payload_refs)')
    .all() as Array<{ name: string }>;

  const hasStoragePath = columns.some((column) => column.name === 'storage_path');
  if (!hasStoragePath) {
    db.exec('ALTER TABLE payload_refs ADD COLUMN storage_path TEXT');
  }
}

function applyVersion9Migration(db: DatabaseSync): void {
  const messageColumns = db
    .prepare('PRAGMA table_info(messages)')
    .all() as Array<{ name: string }>;

  const hasTruncatedPayloadRef = messageColumns.some((column) => column.name === 'truncated_payload_ref');
  if (!hasTruncatedPayloadRef) {
    db.exec('ALTER TABLE messages ADD COLUMN truncated_payload_ref TEXT');
  }

  const payloadColumns = db
    .prepare('PRAGMA table_info(payload_refs)')
    .all() as Array<{ name: string }>;

  const hasExpiresAt = payloadColumns.some((column) => column.name === 'expires_at');
  if (!hasExpiresAt) {
    db.exec('ALTER TABLE payload_refs ADD COLUMN expires_at INTEGER');
  }

  const hasStatus = payloadColumns.some((column) => column.name === 'status');
  if (!hasStatus) {
    db.exec("ALTER TABLE payload_refs ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }
}

export function migrate(db: DatabaseSync): void {
  createBaseSchema(db);

  const currentVersionRow = db
    .prepare('SELECT MAX(version) AS version FROM schema_version')
    .get() as { version?: number | null } | undefined;

  const currentVersion = typeof currentVersionRow?.version === 'number' ? currentVersionRow.version : 0;

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    console.warn(
      `[clawtext-session-intelligence] Database schema version (${currentVersion}) is newer than this engine (${LATEST_SCHEMA_VERSION}).`,
    );
    return;
  }

  let version = currentVersion;

  if (version < 1) {
    createBaseSchema(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(1, nowIso());
    version = 1;
  }

  if (version < 2) {
    applyVersion2Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(2, nowIso());
    version = 2;
  }

  if (version < 3) {
    applyVersion3Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(3, nowIso());
    version = 3;
  }

  if (version < 4) {
    applyVersion4Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(4, nowIso());
    version = 4;
  }

  if (version < 5) {
    applyVersion5Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(5, nowIso());
    version = 5;
  }

  if (version < 6) {
    applyVersion6Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(6, nowIso());
    version = 6;
  }

  if (version < 7) {
    applyVersion7Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(7, nowIso());
    version = 7;
  }

  if (version < 8) {
    applyVersion8Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(8, nowIso());
    version = 8;
  }

  if (version < 9) {
    applyVersion9Migration(db);
    db
      .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(9, nowIso());
  }
}

export { LATEST_SCHEMA_VERSION };
