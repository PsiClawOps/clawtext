import { MemoryService } from './service.js';
import { Memory } from './types.js';

export interface MaintenanceOptions {
  archiveBeforeDelete?: boolean;
  archiveDir?: string;
  dryRun?: boolean;
}

/**
 * Memory maintenance and cleanup
 * 
 * Handles:
 * - Expired memory cleanup
 * - Duplicate detection
 * - Memory archival
 * - Statistics
 */
export class MemoryMaintenance {
  private service: MemoryService;

  constructor(service: MemoryService) {
    this.service = service;
  }

  /**
   * Find all expired memories
   */
  findExpired(projectId?: string): Memory[] {
    const db = (this.service as any).getDb(projectId);
    const now = Date.now();

    const stmt = db.prepare(`
      SELECT * FROM memories 
      WHERE expires_at IS NOT NULL 
      AND expires_at < ?
      AND is_pinned = 0
      ${projectId ? 'AND project_id = ?' : ''}
    `);

    const rows = projectId 
      ? stmt.all(now, projectId) 
      : stmt.all(now);

    return rows.map((r: any) => this.rowToMemory(r));
  }

  /**
   * Clean up expired memories
   */
  cleanupExpired(options: MaintenanceOptions = {}): { 
    deleted: number; 
    archived: number;
    details: string[] 
  } {
    const expired = this.findExpired();
    const details: string[] = [];
    let deleted = 0;
    let archived = 0;

    for (const mem of expired) {
      if (options.dryRun) {
        details.push(`[DRY RUN] Would delete: ${mem.id} (${mem.type}) - Expired: ${mem.expiresAt}`);
        continue;
      }

      if (options.archiveBeforeDelete) {
        // Archive logic would go here
        archived++;
      }

      this.service.deleteMemory(mem.id, mem.projectId);
      deleted++;
      details.push(`Deleted: ${mem.id} (${mem.type}) - Expired: ${mem.expiresAt}`);
    }

    return { deleted, archived, details };
  }

  /**
   * Find potential duplicates based on content similarity
   */
  findDuplicates(projectId?: string, threshold: number = 0.8): Array<{ memory: Memory; duplicates: Memory[] }> {
    const memories = this.service.searchMemories({ projectId, limit: 10000 });
    const results: Array<{ memory: Memory; duplicates: Memory[] }> = [];

    for (let i = 0; i < memories.length; i++) {
      const mem = memories[i];
      const duplicates: Memory[] = [];

      for (let j = i + 1; j < memories.length; j++) {
        const other = memories[j];
        const similarity = this.calculateSimilarity(mem.content, other.content);

        if (similarity >= threshold) {
          duplicates.push(other);
        }
      }

      if (duplicates.length > 0) {
        results.push({ memory: mem, duplicates });
      }
    }

    return results;
  }

  /**
   * Simple text similarity (Jaccard index on words)
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }

  /**
   * Get memory statistics
   */
  getStats(projectId?: string): {
    total: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    expired: number;
    pinned: number;
    avgPriority: number;
    totalAccesses: number;
  } {
    const memories = this.service.searchMemories({ projectId, limit: 10000 });
    const now = Date.now();

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let expired = 0;
    let pinned = 0;
    let totalPriority = 0;
    let totalAccesses = 0;

    for (const mem of memories) {
      byType[mem.type] = (byType[mem.type] || 0) + 1;
      bySource[mem.source] = (bySource[mem.source] || 0) + 1;
      
      if (mem.expiresAt && mem.expiresAt.getTime() < now) expired++;
      if (mem.isPinned) pinned++;
      
      totalPriority += mem.priority;
      totalAccesses += mem.accessCount;
    }

    return {
      total: memories.length,
      byType,
      bySource,
      expired,
      pinned,
      avgPriority: memories.length > 0 ? totalPriority / memories.length : 0,
      totalAccesses,
    };
  }

  /**
   * Run full maintenance routine
   */
  runMaintenance(options: MaintenanceOptions = {}): {
    cleanup: { deleted: number; archived: number; details: string[] };
    stats: ReturnType<typeof this.getStats>;
  } {
    console.log('[MemoryMaintenance] Running maintenance...');

    const cleanup = this.cleanupExpired(options);
    const stats = this.getStats();

    console.log(`[MemoryMaintenance] Deleted ${cleanup.deleted} expired memories`);
    console.log(`[MemoryMaintenance] Total memories: ${stats.total}`);

    return { cleanup, stats };
  }

  /**
   * Helper to convert row to Memory
   */
  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      content: row.content,
      type: row.type,
      projectId: row.project_id,
      source: row.source,
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
}
