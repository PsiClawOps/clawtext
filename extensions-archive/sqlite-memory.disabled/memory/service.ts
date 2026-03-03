import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { initDatabase, runMigrations, getGlobalDbPath, getLocalDbPath } from './db.js';
import {
  Memory,
  MemoryType,
  MemorySource,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
  ContextWindow,
  CreateContextWindowInput,
  Project,
  CreateProjectInput,
} from './types.js';

export class MemoryService {
  private globalDb: Database.Database;
  private localDb?: Database.Database;
  private workspaceRoot: string;
  private useLocalDb: boolean;

  constructor(workspaceRoot: string, useLocalDb: boolean = true) {
    this.workspaceRoot = workspaceRoot;
    this.useLocalDb = useLocalDb;
    
    // Always connect to global DB
    this.globalDb = initDatabase(getGlobalDbPath());
    runMigrations(this.globalDb);
    
    // Connect to local DB if enabled
    if (useLocalDb) {
      const localPath = getLocalDbPath(workspaceRoot);
      const localDir = localPath.substring(0, localPath.lastIndexOf('/'));
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }
      this.localDb = initDatabase(localPath);
      runMigrations(this.localDb);
    }
  }

  // Helper: determine which DB to use based on project_id
  private getDb(projectId?: string): Database.Database {
    // No project = global scope
    if (!projectId) return this.globalDb;
    
    // Check if this project is associated with current workspace
    const project = this.getProject(projectId);
    if (project?.workspacePath === this.workspaceRoot && this.localDb) {
      return this.localDb;
    }
    
    return this.globalDb;
  }

  // ===== MEMORY OPERATIONS =====

  createMemory(input: CreateMemoryInput, projectId?: string): Memory {
    const db = this.getDb(projectId);
    const now = Date.now();
    const id = `mem_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const tokens = this.estimateTokens(input.content);
    
    // Calculate expiration if TTL provided
    let expiresAt: number | null = null;
    if (input.ttlDays && input.ttlDays > 0) {
      expiresAt = now + (input.ttlDays * 24 * 60 * 60 * 1000);
    }

    const stmt = db.prepare(`
      INSERT INTO memories 
      (id, content, type, project_id, source, priority, tokens, created_at, updated_at, last_accessed, access_count, is_pinned, ttl_days, expires_at, updates_id, related_ids, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.content,
      input.type || 'fact',
      projectId || null,
      input.source || 'user',
      input.priority ?? 0.5,
      tokens,
      now,
      now,
      now,
      0,
      input.isPinned ? 1 : 0,
      input.ttlDays || null,
      expiresAt,
      input.updatesId || null,
      input.relatedIds ? JSON.stringify(input.relatedIds) : null,
      input.metadata ? JSON.stringify(input.metadata) : null
    );

    return this.getMemoryById(id, projectId)!;
  }

  getMemoryById(id: string, projectId?: string): Memory | null {
    const db = this.getDb(projectId);
    
    const stmt = db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    // Update access stats
    db.prepare(`
      UPDATE memories 
      SET access_count = access_count + 1, last_accessed = ? 
      WHERE id = ?
    `).run(Date.now(), id);
    
    return this.rowToMemory(row);
  }

  updateMemory(id: string, input: UpdateMemoryInput, projectId?: string): Memory | null {
    const db = this.getDb(projectId);
    const existing = this.getMemoryById(id, projectId);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.content !== undefined) {
      updates.push('content = ?');
      values.push(input.content);
      updates.push('tokens = ?');
      values.push(this.estimateTokens(input.content));
    }
    if (input.type !== undefined) {
      updates.push('type = ?');
      values.push(input.type);
    }
    if (input.priority !== undefined) {
      updates.push('priority = ?');
      values.push(input.priority);
    }
    if (input.isPinned !== undefined) {
      updates.push('is_pinned = ?');
      values.push(input.isPinned ? 1 : 0);
    }
    if (input.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(input.metadata));
    }

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = db.prepare(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getMemoryById(id, projectId);
  }

  deleteMemory(id: string, projectId?: string): boolean {
    const db = this.getDb(projectId);
    const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  searchMemories(options: MemorySearchOptions): Memory[] {
    const db = this.getDb(options.projectId);
    
    const conditions: string[] = [];
    const values: any[] = [];

    if (options.projectId) {
      conditions.push('project_id = ?');
      values.push(options.projectId);
    }

    if (options.type) {
      if (Array.isArray(options.type)) {
        conditions.push(`type IN (${options.type.map(() => '?').join(',')})`);
        values.push(...options.type);
      } else {
        conditions.push('type = ?');
        values.push(options.type);
      }
    }

    if (options.source) {
      conditions.push('source = ?');
      values.push(options.source);
    }

    if (options.minPriority !== undefined) {
      conditions.push('priority >= ?');
      values.push(options.minPriority);
    }

    if (options.query) {
      conditions.push('content LIKE ?');
      values.push(`%${options.query}%`);
    }

    if (options.isPinned !== undefined) {
      conditions.push('is_pinned = ?');
      values.push(options.isPinned ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    let orderClause = '';
    if (options.pinnedFirst) {
      orderClause = 'ORDER BY is_pinned DESC, ';
      orderClause += options.recentFirst ? 'updated_at DESC' : 'priority DESC';
    } else {
      orderClause = options.recentFirst ? 'ORDER BY updated_at DESC' : 'ORDER BY priority DESC';
    }

    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const stmt = db.prepare(`SELECT * FROM memories ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`);
    const rows = stmt.all(...values) as any[];

    return rows.map(r => this.rowToMemory(r));
  }

  getMemoriesForContext(projectId: string | undefined, limit: number = 20): Memory[] {
    // Get most relevant memories for a project/session
    // Priority: pinned first, then by access count + recency score
    const db = this.getDb(projectId);
    
    const stmt = db.prepare(`
      SELECT *, 
        (access_count * 0.3 + (last_accessed / 1000000000) * 0.7) as relevance_score
      FROM memories 
      WHERE project_id IS ? OR project_id IS NULL
      ORDER BY is_pinned DESC, relevance_score DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(projectId || null, limit) as any[];
    return rows.map(r => this.rowToMemory(r));
  }

  // ===== CONTEXT WINDOW OPERATIONS =====

  getContextWindow(sessionId: string): ContextWindow | null {
    // Always use local DB for context windows (session-specific)
    const db = this.localDb || this.globalDb;
    
    const stmt = db.prepare('SELECT * FROM context_windows WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    
    if (!row) return null;
    
    return {
      sessionId: row.session_id,
      agentId: row.agent_id,
      projectId: row.project_id,
      messages: JSON.parse(row.messages_json),
      summary: row.summary,
      tokenUsed: row.token_used,
      tokenBudget: row.token_budget,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  saveContextWindow(input: CreateContextWindowInput): ContextWindow {
    const db = this.localDb || this.globalDb;
    const now = Date.now();
    const tokenUsed = this.estimateTokens(JSON.stringify(input.messages));
    const tokenBudget = input.tokenBudget || 6000;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO context_windows 
      (session_id, agent_id, project_id, messages_json, token_used, token_budget, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.sessionId,
      input.agentId || null,
      input.projectId || null,
      JSON.stringify(input.messages),
      tokenUsed,
      tokenBudget,
      now,
      now
    );

    return this.getContextWindow(input.sessionId)!;
  }

  deleteContextWindow(sessionId: string): boolean {
    const db = this.localDb || this.globalDb;
    const stmt = db.prepare('DELETE FROM context_windows WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  // ===== PROJECT OPERATIONS =====

  createProject(input: CreateProjectInput): Project {
    const db = this.getDb(undefined); // Projects always in global DB
    const now = Date.now();
    const id = input.id || `proj_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description, status, workspace_path, created_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.description || null,
      'active',
      input.workspacePath || null,
      now,
      now
    );

    return this.getProject(id)!;
  }

  getProject(id: string): Project | null {
    const db = this.globalDb;
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return this.rowToProject(row);
  }

  getProjectsByWorkspace(workspacePath: string): Project[] {
    const db = this.globalDb;
    const stmt = db.prepare('SELECT * FROM projects WHERE workspace_path = ? ORDER BY last_activity DESC');
    const rows = stmt.all(workspacePath) as any[];
    return rows.map(r => this.rowToProject(r));
  }

  updateProjectActivity(projectId: string): void {
    const db = this.globalDb;
    db.prepare('UPDATE projects SET last_activity = ? WHERE id = ?').run(Date.now(), projectId);
  }

  // ===== HELPERS =====

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      content: row.content,
      type: row.type as MemoryType,
      projectId: row.project_id,
      source: row.source as MemorySource,
      priority: row.priority,
      tokens: row.tokens,
      embedding: row.embedding,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastAccessed: new Date(row.last_accessed),
      accessCount: row.access_count,
      isPinned: row.is_pinned === 1,
      ttlDays: row.ttl_days,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      updatesId: row.updates_id,
      relatedIds: row.related_ids ? JSON.parse(row.related_ids) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private rowToProject(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      workspacePath: row.workspace_path,
      createdAt: new Date(row.created_at),
      lastActivity: new Date(row.last_activity),
    };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  close(): void {
    this.globalDb.close();
    if (this.localDb) this.localDb.close();
  }
}
