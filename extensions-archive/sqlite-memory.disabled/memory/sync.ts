import { MemoryService } from './service.js';
import { Memory } from './types.js';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface SyncOptions {
  dailyLogDir?: string;
  structuredExportDir?: string;
  autoSyncIntervalMs?: number;
}

/**
 * Continuous sync from SQLite to Markdown files
 * 
 * This provides the hybrid architecture:
 * - SQLite: Structured storage, fast queries, relationships
 * - Markdown: Human-readable, OpenClaw searchable, git-friendly
 */
export class MemorySync {
  private service: MemoryService;
  private options: Required<SyncOptions>;
  private syncTimer?: NodeJS.Timeout;

  constructor(service: MemoryService, options: SyncOptions = {}) {
    this.service = service;
    this.options = {
      dailyLogDir: options.dailyLogDir || './memory',
      structuredExportDir: options.structuredExportDir || './memory/structured',
      autoSyncIntervalMs: options.autoSyncIntervalMs || 5 * 60 * 1000, // 5 min
    };
  }

  /**
   * Append a memory to today's daily log
   * Call this immediately after creating any memory
   */
  appendToDailyLog(memory: Memory): void {
    const today = new Date().toISOString().split('T')[0];
    const filePath = join(this.options.dailyLogDir, `${today}.md`);

    // Ensure directory exists
    if (!existsSync(this.options.dailyLogDir)) {
      mkdirSync(this.options.dailyLogDir, { recursive: true });
    }

    const timestamp = new Date().toLocaleTimeString();
    const entry = this.formatDailyLogEntry(memory, timestamp);

    appendFileSync(filePath, entry);
  }

  /**
   * Format a memory for the daily log
   */
  private formatDailyLogEntry(memory: Memory, timestamp: string): string {
    const lines: string[] = ['\n'];
    
    // Header with type and timestamp
    lines.push(`## ${timestamp} - ${memory.type.toUpperCase()}`);
    
    // Metadata line
    const meta: string[] = [`ID: \`${memory.id}\``];
    if (memory.projectId) meta.push(`Project: ${memory.projectId}`);
    if (memory.priority > 0.7) meta.push(`Priority: ${memory.priority}`);
    if (memory.isPinned) meta.push('📌 Pinned');
    if (memory.ttlDays) meta.push(`TTL: ${memory.ttlDays} days`);
    lines.push(`\n**${meta.join(' | ')}**`);
    
    // Content
    lines.push(`\n${memory.content}`);
    
    // Relationship info
    if (memory.updatesId) {
      lines.push(`\n*Supersedes: \`${memory.updatesId}\`*`);
    }
    if (memory.relatedIds && memory.relatedIds.length > 0) {
      lines.push(`\n*Related: ${memory.relatedIds.map(id => `\`${id}\``).join(', ')}*`);
    }
    
    lines.push('\n---\n');
    
    return lines.join('\n');
  }

  /**
   * Full export of all memories to structured Markdown
   * Organized by type for easier browsing
   */
  exportToStructured(projectId?: string): { exported: number; files: string[] } {
    // Ensure directory exists
    if (!existsSync(this.options.structuredExportDir)) {
      mkdirSync(this.options.structuredExportDir, { recursive: true });
    }

    const memories = this.service.searchMemories({
      projectId,
      limit: 10000,
      pinnedFirst: true,
      recentFirst: true,
    });

    const files: string[] = [];
    const byType: Record<string, Memory[]> = {};

    // Group by type
    for (const mem of memories) {
      if (!byType[mem.type]) byType[mem.type] = [];
      byType[mem.type].push(mem);
    }

    // Write each type to a file
    for (const [type, mems] of Object.entries(byType)) {
      const fileName = `${type}s.md`;
      const filePath = join(this.options.structuredExportDir, fileName);
      
      const content = this.formatStructuredFile(type, mems);
      writeFileSync(filePath, content);
      files.push(filePath);
    }

    // Write index
    const indexPath = join(this.options.structuredExportDir, '_index.md');
    writeFileSync(indexPath, this.formatIndex(memories));
    files.push(indexPath);

    return { exported: memories.length, files };
  }

  /**
   * Format memories into a structured Markdown file
   */
  private formatStructuredFile(type: string, memories: Memory[]): string {
    const lines: string[] = [
      `# ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      '',
      `Total: ${memories.length} memories`,
      '',
      '---',
      ''
    ];

    for (const mem of memories) {
      lines.push(this.formatMemoryBlock(mem));
      lines.push('---\n');
    }

    return lines.join('\n');
  }

  /**
   * Format a single memory as a Markdown block
   */
  private formatMemoryBlock(mem: Memory): string {
    const lines: string[] = [];
    
    // Frontmatter
    const frontmatter: Record<string, any> = {
      id: mem.id,
      type: mem.type,
      source: mem.source,
      priority: mem.priority,
      created: mem.createdAt.toISOString().split('T')[0],
      updated: mem.updatedAt.toISOString().split('T')[0],
      pinned: mem.isPinned,
    };
    
    if (mem.projectId) frontmatter.project = mem.projectId;
    if (mem.ttlDays) frontmatter.ttl_days = mem.ttlDays;
    if (mem.expiresAt) frontmatter.expires = mem.expiresAt.toISOString().split('T')[0];
    if (mem.updatesId) frontmatter.updates = mem.updatesId;
    if (mem.relatedIds) frontmatter.related = mem.relatedIds;

    lines.push('---');
    for (const [k, v] of Object.entries(frontmatter)) {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
    lines.push('---\n');
    
    // Content
    lines.push(mem.content);
    
    return lines.join('\n');
  }

  /**
   * Format index file
   */
  private formatIndex(memories: Memory[]): string {
    const lines: string[] = [
      '# Memory Index',
      '',
      `Total Memories: ${memories.length}`,
      '',
      '## By Type',
      ''
    ];

    const byType: Record<string, number> = {};
    for (const mem of memories) {
      byType[mem.type] = (byType[mem.type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${type}s**: ${count}`);
    }

    lines.push('\n## Recent Memories\n');
    const recent = memories
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 10);

    for (const mem of recent) {
      const pin = mem.isPinned ? '📌 ' : '';
      const preview = mem.content.slice(0, 80).replace(/\n/g, ' ');
      lines.push(`- ${pin}\`${mem.id}\` (${mem.type}): ${preview}...`);
    }

    return lines.join('\n');
  }

  /**
   * Start automatic background sync
   */
  startAutoSync(): void {
    if (this.syncTimer) return; // Already running

    this.syncTimer = setInterval(() => {
      console.log('[MemorySync] Running scheduled export...');
      this.exportToStructured();
    }, this.options.autoSyncIntervalMs);

    console.log(`[MemorySync] Auto-sync started (interval: ${this.options.autoSyncIntervalMs}ms)`);
  }

  /**
   * Stop automatic background sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      console.log('[MemorySync] Auto-sync stopped');
    }
  }

  /**
   * Get latest version of a memory (follows updates chain)
   */
  getLatestVersion(memoryId: string, projectId?: string): Memory | null {
    let current = this.service.getMemoryById(memoryId, projectId);
    if (!current) return null;

    // Check if this memory has been superseded
    const allMemories = this.service.searchMemories({ projectId, limit: 10000 });
    const superseder = allMemories.find(m => m.updatesId === current!.id);
    
    if (superseder) {
      // Recursively get the latest version
      return this.getLatestVersion(superseder.id, projectId);
    }

    return current;
  }

  /**
   * Get memory history (follows updates chain backwards)
   */
  getMemoryHistory(memoryId: string, projectId?: string): Memory[] {
    const history: Memory[] = [];
    let current: Memory | null = this.service.getMemoryById(memoryId, projectId);

    while (current) {
      history.unshift(current); // Add to beginning (oldest first)
      
      if (current.updatesId) {
        current = this.service.getMemoryById(current.updatesId, projectId);
      } else {
        current = null;
      }
    }

    return history;
  }
}
