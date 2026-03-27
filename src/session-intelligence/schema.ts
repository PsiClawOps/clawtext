/**
 * Session Intelligence SQLite schema and migrations.
 *
 * Walk 1a initialized foundational persistence tables.
 * Walk 1b adds summary DAG tables and message summarized-state tracking.
 */

import type { DatabaseSync } from 'node:sqlite';

const LATEST_SCHEMA_VERSION = 2;

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
  }
}

export { LATEST_SCHEMA_VERSION };
