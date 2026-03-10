/**
 * ClawText Operational Memory Lane
 * 
 * Manages error patterns, anti-patterns, recovery patterns, and self-improvement learnings.
 * Separate from normal working memory to keep operational knowledge high-signal and actionable.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';

/**
 * Operational memory entry types
 */
export type PatternType = 
  | 'error-pattern'
  | 'anti-pattern'
  | 'recovery-pattern'
  | 'success-pattern'
  | 'optimization'
  | 'capability-gap';

/**
 * Operational memory scope
 */
export type Scope = 'tool' | 'agent' | 'project' | 'gateway' | 'global';

/**
 * Operational memory status (lifecycle state)
 */
export type Status = 'raw' | 'candidate' | 'reviewed' | 'promoted' | 'archived';

/**
 * Operational memory entry schema
 */
export interface OperationalMemory {
  // Required fields
  patternKey: string;
  type: PatternType;
  summary: string;
  symptom: string;
  trigger: string;
  rootCause: string;
  fix: string;
  scope: Scope;
  confidence: number;
  recurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: Status;
  evidence: string[];
  
  // Optional fields
  relatedPatterns?: string[];
  promotedTo?: string;
  promotedAt?: string;
  tags?: string[];
  
  // Internal tracking
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Index entry for patternKey → file mapping
 */
export interface IndexEntry {
  patternKey: string;
  filePath: string;
  status: Status;
  type: PatternType;
  scope: Scope;
  recurrenceCount: number;
  lastSeenAt: string;
}

/**
 * Operational memory manager
 */
export class OperationalMemoryManager {
  private workspacePath: string;
  private operationalDir: string;
  private rawDir: string;
  private candidatesDir: string;
  private patternsDir: string;
  private archiveDir: string;
  private indexPath: string;
  private index: Map<string, IndexEntry>;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.operationalDir = path.join(workspacePath, 'memory', 'operational');
    this.rawDir = path.join(this.operationalDir, 'raw');
    this.candidatesDir = path.join(this.operationalDir, 'candidates');
    this.patternsDir = path.join(this.operationalDir, 'patterns');
    this.archiveDir = path.join(this.operationalDir, 'archive');
    this.indexPath = path.join(this.operationalDir, 'index.json');
    this.index = new Map();
    
    this.ensureDirectories();
    this.loadIndex();
  }

  /**
   * Ensure directory structure exists
   */
  private ensureDirectories(): void {
    const dirs = [this.operationalDir, this.rawDir, this.candidatesDir, this.patternsDir, this.archiveDir];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Load index from disk
   */
  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
        this.index = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[OperationalMemory] Failed to load index:', error);
      this.index = new Map();
    }
  }

  /**
   * Save index to disk
   */
  private saveIndex(): void {
    try {
      const data = Object.fromEntries(this.index);
      fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2) + '\n');
    } catch (error) {
      console.error('[OperationalMemory] Failed to save index:', error);
    }
  }

  /**
   * Generate unique ID for memory entry
   */
  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate patternKey from components (if not provided)
   */
  generatePatternKey(type: PatternType, scope: Scope, summary: string): string {
    const slug = summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return `${type}.${scope}.${slug}`;
  }

  /**
   * Create new operational memory entry
   */
  create(memory: Partial<OperationalMemory>): OperationalMemory {
    const now = new Date().toISOString();
    const entry: OperationalMemory = {
      patternKey: memory.patternKey || this.generatePatternKey(
        memory.type || 'error-pattern',
        memory.scope || 'global',
        memory.summary || 'unnamed-pattern'
      ),
      type: memory.type || 'error-pattern',
      summary: memory.summary || '',
      symptom: memory.symptom || '',
      trigger: memory.trigger || '',
      rootCause: memory.rootCause || '',
      fix: memory.fix || '',
      scope: memory.scope || 'global',
      confidence: memory.confidence ?? 0.5,
      recurrenceCount: memory.recurrenceCount ?? 1,
      firstSeenAt: memory.firstSeenAt || now,
      lastSeenAt: memory.lastSeenAt || now,
      status: memory.status || 'raw',
      evidence: memory.evidence || [],
      relatedPatterns: memory.relatedPatterns || [],
      tags: memory.tags || [],
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };

    this.saveEntry(entry);
    // Index is updated from within saveEntry via updateIndexWithPath

    return entry;
  }

  /**
   * Save entry to appropriate directory based on status
   */
  private saveEntry(entry: OperationalMemory): void {
    let dir: string;
    let relativeDir: string;
    
    switch (entry.status) {
      case 'raw':
        dir = this.rawDir;
        relativeDir = 'raw';
        break;
      case 'candidate':
        dir = this.candidatesDir;
        relativeDir = 'candidates';
        break;
      case 'reviewed':
      case 'promoted':
        dir = this.patternsDir;
        relativeDir = 'patterns';
        break;
      case 'archived':
        dir = this.archiveDir;
        relativeDir = 'archive';
        break;
      default:
        dir = this.rawDir;
        relativeDir = 'raw';
    }

    // Create subdirectory by date for raw entries
    if (entry.status === 'raw') {
      const date = entry.createdAt?.slice(0, 10) || 'unknown';
      dir = path.join(dir, date);
      relativeDir = path.join(relativeDir, date);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const filename = `${entry.id}.yaml`;
    const filepath = path.join(dir, filename);
    const relativePath = path.join(relativeDir, filename);
    
    const yamlDoc = this.entryToYAML(entry);
    fs.writeFileSync(filepath, yamlDoc);
    
    // Update index with the correct relative path
    this.updateIndexWithPath(entry, relativePath);
  }
  
  /**
   * Update index with specific path
   */
  private updateIndexWithPath(entry: OperationalMemory, relativePath: string): void {
    this.index.set(entry.patternKey, {
      patternKey: entry.patternKey,
      filePath: relativePath,
      status: entry.status,
      type: entry.type,
      scope: entry.scope,
      recurrenceCount: entry.recurrenceCount,
      lastSeenAt: entry.lastSeenAt,
    });
    this.saveIndex();
  }

  /**
   * Convert entry to YAML document
   */
  private entryToYAML(entry: OperationalMemory): string {
    const doc = {
      patternKey: entry.patternKey,
      type: entry.type,
      summary: entry.summary,
      symptom: entry.symptom,
      trigger: entry.trigger,
      rootCause: entry.rootCause,
      fix: entry.fix,
      scope: entry.scope,
      confidence: entry.confidence,
      recurrenceCount: entry.recurrenceCount,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      status: entry.status,
      evidence: entry.evidence,
      relatedPatterns: entry.relatedPatterns?.length ? entry.relatedPatterns : undefined,
      promotedTo: entry.promotedTo,
      promotedAt: entry.promotedAt,
      tags: entry.tags?.length ? entry.tags : undefined,
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };

    return yaml.dump(doc, { indent: 2, lineWidth: -1 });
  }

  /**
   * Update index entry (for non-save operations)
   */
  private updateIndex(entry: OperationalMemory): void {
    let relativeDir: string;
    
    switch (entry.status) {
      case 'raw':
        relativeDir = 'raw';
        break;
      case 'candidate':
        relativeDir = 'candidates';
        break;
      case 'reviewed':
      case 'promoted':
        relativeDir = 'patterns';
        break;
      case 'archived':
        relativeDir = 'archive';
        break;
      default:
        relativeDir = 'raw';
    }

    // Add date subdirectory for raw entries
    if (entry.status === 'raw') {
      const date = entry.createdAt?.slice(0, 10) || 'unknown';
      relativeDir = path.join(relativeDir, date);
    }

    const filename = `${entry.id}.yaml`;
    const relativePath = path.join(relativeDir, filename);
    
    this.updateIndexWithPath(entry, relativePath);
  }

  /**
   * Get directory for status
   */
  private getDirectoryForStatus(status: Status): string {
    switch (status) {
      case 'raw': return this.rawDir;
      case 'candidate': return this.candidatesDir;
      case 'reviewed':
      case 'promoted': return this.patternsDir;
      case 'archived': return this.archiveDir;
      default: return this.rawDir;
    }
  }

  /**
   * Load entry by patternKey
   */
  get(patternKey: string): OperationalMemory | null {
    const entry = this.index.get(patternKey);
    if (!entry) return null;

    try {
      const filepath = path.join(this.workspacePath, 'memory', 'operational', entry.filePath);
      if (!fs.existsSync(filepath)) return null;

      const yamlContent = fs.readFileSync(filepath, 'utf8');
      const data = yaml.load(yamlContent) as Partial<OperationalMemory>;
      
      return this.normalizeEntry(data);
    } catch (error) {
      console.error('[OperationalMemory] Failed to load entry:', error);
      return null;
    }
  }

  /**
   * Normalize partial entry to full schema
   */
  private normalizeEntry(data: Partial<OperationalMemory>): OperationalMemory {
    return {
      patternKey: data.patternKey || '',
      type: data.type || 'error-pattern',
      summary: data.summary || '',
      symptom: data.symptom || '',
      trigger: data.trigger || '',
      rootCause: data.rootCause || '',
      fix: data.fix || '',
      scope: data.scope || 'global',
      confidence: data.confidence ?? 0.5,
      recurrenceCount: data.recurrenceCount ?? 1,
      firstSeenAt: data.firstSeenAt || '',
      lastSeenAt: data.lastSeenAt || '',
      status: data.status || 'raw',
      evidence: data.evidence || [],
      relatedPatterns: data.relatedPatterns || [],
      promotedTo: data.promotedTo,
      promotedAt: data.promotedAt,
      tags: data.tags || [],
      id: data.id,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  /**
   * Update existing entry
   */
  update(patternKey: string, updates: Partial<OperationalMemory>): OperationalMemory | null {
    const existing = this.get(patternKey);
    if (!existing) return null;

    const updated: OperationalMemory = {
      ...existing,
      ...updates,
      patternKey: existing.patternKey, // Never change patternKey
      updatedAt: new Date().toISOString(),
    };

    // Remove old index entry
    this.index.delete(patternKey);
    
    // Save updated entry
    this.saveEntry(updated);
    this.updateIndex(updated);

    return updated;
  }

  /**
   * Change status of entry
   */
  changeStatus(patternKey: string, newStatus: Status): OperationalMemory | null {
    return this.update(patternKey, { status: newStatus });
  }

  /**
   * Increment recurrence count
   */
  incrementRecurrence(patternKey: string): OperationalMemory | null {
    const existing = this.get(patternKey);
    if (!existing) return null;

    return this.update(patternKey, {
      recurrenceCount: existing.recurrenceCount + 1,
      lastSeenAt: new Date().toISOString(),
    });
  }

  /**
   * Search operational memories
   */
  search(query: string, filters?: {
    type?: PatternType;
    status?: Status;
    scope?: Scope;
    limit?: number;
  }): OperationalMemory[] {
    const results: OperationalMemory[] = [];
    const queryLower = query.toLowerCase();

    for (const [patternKey, indexEntry] of this.index.entries()) {
      // Apply filters
      if (filters?.type && indexEntry.type !== filters.type) continue;
      if (filters?.status && indexEntry.status !== filters.status) continue;
      if (filters?.scope && indexEntry.scope !== filters.scope) continue;

      // Load entry
      const entry = this.get(patternKey);
      if (!entry) continue;

      // Search fields
      const searchable = [
        entry.patternKey,
        entry.type,
        entry.summary,
        entry.symptom,
        entry.trigger,
        entry.rootCause,
        entry.fix,
        entry.scope,
        ...(entry.tags || []),
      ].join(' ').toLowerCase();

      if (searchable.includes(queryLower)) {
        results.push(entry);
      }
    }

    // Sort by recurrence count (highest first)
    results.sort((a, b) => b.recurrenceCount - a.recurrenceCount);

    // Apply limit
    const limit = filters?.limit ?? 50;
    return results.slice(0, limit);
  }

  /**
   * Get all entries by status
   */
  getAllByStatus(status: Status): OperationalMemory[] {
    const results: OperationalMemory[] = [];

    for (const [patternKey, indexEntry] of this.index.entries()) {
      if (indexEntry.status === status) {
        const entry = this.get(patternKey);
        if (entry) results.push(entry);
      }
    }

    // Sort by lastSeenAt (most recent first)
    results.sort((a, b) => 
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );

    return results;
  }

  /**
   * Get review queue (candidates awaiting review)
   */
  getReviewQueue(): OperationalMemory[] {
    return this.getAllByStatus('candidate');
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<Status, number>;
    byType: Record<PatternType, number>;
    byScope: Record<Scope, number>;
    highRecurrence: number;
  } {
    const stats = {
      total: this.index.size,
      byStatus: { raw: 0, candidate: 0, reviewed: 0, promoted: 0, archived: 0 },
      byType: {
        'error-pattern': 0,
        'anti-pattern': 0,
        'recovery-pattern': 0,
        'success-pattern': 0,
        'optimization': 0,
        'capability-gap': 0,
      },
      byScope: { tool: 0, agent: 0, project: 0, gateway: 0, global: 0 },
      highRecurrence: 0,
    };

    for (const [, indexEntry] of this.index.entries()) {
      stats.byStatus[indexEntry.status]++;
      stats.byType[indexEntry.type]++;
      stats.byScope[indexEntry.scope]++;
      if (indexEntry.recurrenceCount >= 3) stats.highRecurrence++;
    }

    return stats;
  }

  /**
   * Merge two patterns (combine evidence, increment recurrence)
   */
  merge(patternKey: string, duplicateKey: string): OperationalMemory | null {
    const primary = this.get(patternKey);
    const duplicate = this.get(duplicateKey);

    if (!primary || !duplicate) return null;

    // Merge evidence
    const mergedEvidence = [
      ...primary.evidence,
      ...duplicate.evidence,
    ].filter((v, i, a) => a.indexOf(v) === i); // Dedupe

    // Update primary
    const merged = this.update(patternKey, {
      recurrenceCount: primary.recurrenceCount + duplicate.recurrenceCount,
      evidence: mergedEvidence,
      lastSeenAt: duplicate.lastSeenAt,
    });

    // Archive duplicate
    this.changeStatus(duplicateKey, 'archived');

    return merged;
  }

  /**
   * Promote pattern to workspace guidance
   */
  promote(patternKey: string, target: string): OperationalMemory | null {
    const entry = this.get(patternKey);
    if (!entry) return null;

    return this.update(patternKey, {
      status: 'promoted',
      promotedTo: target,
      promotedAt: new Date().toISOString(),
    });
  }
}

export default OperationalMemoryManager;
