import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

// Global DB path: ~/.openclaw/memory.db
// Local DB path: workspace/memory/memory.db (project-specific)

const GLOBAL_DIR = join(homedir(), '.openclaw');
const GLOBAL_DB_PATH = join(GLOBAL_DIR, 'memory.db');

export function getGlobalDbPath(): string {
  return GLOBAL_DB_PATH;
}

export function getLocalDbPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'memory', 'memory.db');
}

export function ensureGlobalDir(): void {
  if (!existsSync(GLOBAL_DIR)) {
    mkdirSync(GLOBAL_DIR, { recursive: true });
  }
}

export function initDatabase(dbPath: string): Database.Database {
  ensureGlobalDir();
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  return db;
}

export function runMigrations(db: Database.Database): void {
  // Core memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fact',
      project_id TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      priority REAL NOT NULL DEFAULT 0.5,
      tokens INTEGER,
      embedding BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      ttl_days INTEGER,
      expires_at INTEGER,
      updates_id TEXT,
      related_ids TEXT,
      metadata TEXT
    );
  `);
  
  // Migration: Add new columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN ttl_days INTEGER;`);
  } catch (e) { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN expires_at INTEGER;`);
  } catch (e) { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN updates_id TEXT;`);
  } catch (e) { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN related_ids TEXT;`);
  } catch (e) { /* Column may already exist */ }

  // Context windows for pruning
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_windows (
      session_id TEXT PRIMARY KEY,
      agent_id TEXT,
      project_id TEXT,
      messages_json TEXT NOT NULL,
      summary TEXT,
      token_used INTEGER NOT NULL,
      token_budget INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Project registry
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      workspace_path TEXT,
      created_at INTEGER NOT NULL,
      last_activity INTEGER NOT NULL
    );
  `);

  // Indexes for performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_updates ON memories(updates_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_context_session ON context_windows(session_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_context_project ON context_windows(project_id);`);
}
