/**
 * ClawText Memory API - TypeScript
 * Simple programmatic interface for agents to add and retrieve memories
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import HotMemoryCache, { type CacheableMemory } from './hot-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MemoryOptions {
  type?: string;
  project?: string;
  entities?: string[];
  keywords?: string[];
  tags?: string[];
  confidence?: number;
  importance?: number;
  metadata?: Record<string, any>;
  // Multi-agent fields
  agentId?: string;
  agentName?: string;
  visibility?: 'shared' | 'private' | 'cross-agent';
  targetAgent?: string;
  // Session continuity (same agent across sessions)
  sessionId?: string;
  relatesToSession?: string;
}

export interface SearchOptions {
  limit?: number;
  project?: string;
  type?: string;
  // Multi-agent options
  agentId?: string;
  includeShared?: boolean;
  includePrivate?: boolean;
  includeCrossAgent?: boolean;
  // Session continuity options
  sessionId?: string;
  includeRelatedSessions?: boolean;
}

export class ClawTextMemory {
  private workspacePath: string;
  private memoriesDir: string;
  private cacheDir: string;
  private clustersDir: string;
  private hotCache: HotMemoryCache;

  constructor(workspacePath: string = process.env.HOME + '/.openclaw/workspace') {
    this.workspacePath = workspacePath;
    this.memoriesDir = path.join(workspacePath, 'memory', 'api-memories');
    this.cacheDir = path.join(workspacePath, 'memory', 'cache');
    this.clustersDir = path.join(workspacePath, 'memory', 'clusters');
    
    this.hotCache = new HotMemoryCache(workspacePath, {
      enabled: true,
      maxItems: 300,
      maxPerProject: 50,
      maxSnippetChars: 600,
      maxResultsPerQuery: 5,
      defaultTtlDays: 14,
      stickyTtlDays: 60,
      admissionConfidence: 0.75,
      admissionScore: 1.2,
    });
    
    this._ensureDir(this.memoriesDir);
  }

  private _ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private _generateId(): string {
    return 'mem_' + crypto.randomBytes(8).toString('hex');
  }

  private _hashContent(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex').slice(0, 16);
  }

  async add(content: string, options: MemoryOptions = {}): Promise<Record<string, any>> {
    const id = this._generateId();
    const now = new Date().toISOString();
    const dedupeHash = this._hashContent(content);
    
    const memory = {
      id,
      sourceType: 'api',
      sourceId: null,
      sourceRef: null,
      project: options.project || 'general',
      type: options.type || 'note',
      lane: 'curated',
      status: 'promoted',
      confidence: options.confidence || 0.85,
      importance: options.importance || 0.7,
      createdAt: now,
      observedAt: now,
      updatedAt: now,
      entities: options.entities || [],
      tags: options.tags || [],
      keywords: options.keywords || this._extractKeywords(content),
      dedupeHash,
      summary: content.slice(0, 200),
      body: content,
      relations: { supersedes: [], related: [], derivedFrom: [] },
      metadata: options.metadata || {},
      // Multi-agent fields
      agentId: options.agentId || null,
      agentName: options.agentName || null,
      visibility: options.visibility || 'shared',
      targetAgent: options.targetAgent || null,
      // Session continuity
      sessionId: options.sessionId || null,
      relatesToSession: options.relatesToSession || null,
    };

    const filepath = path.join(this.memoriesDir, `${id}.json`);
    fs.writeFileSync(filepath, JSON.stringify(memory, null, 2));
    
    this.hotCache.admit([memory as unknown as CacheableMemory]);
    await this._refreshClusters();

    return memory;
  }

  async search(query: string, options: SearchOptions = {}): Promise<Record<string, any>[]> {
    const limit = options.limit || 10;
    
    const cacheResults = this.hotCache.query(query, options.project ? [options.project] : [], limit);
    const fileResults = this._searchFiles(query, options);
    
    // Multi-agent filtering for cache results
    const filteredCache = this._filterByAgentContext(cacheResults, options.agentId, options);
    
    const combined = [...filteredCache, ...fileResults];
    const seen = new Set<string>();
    const unique: Record<string, any>[] = [];
    
    for (const mem of combined as Record<string, any>[]) {
      const key = mem.id || (mem as any).dedupeHash || String((mem as any).summary || '').slice(0, 20) || Math.random().toString(36);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(mem);
      }
    }

    return unique.slice(0, limit);
  }

  private _filterByAgentContext(memories: Record<string, any>[], agentId: string | undefined, options: SearchOptions): Record<string, any>[] {
    if (!agentId) return memories;
    
    return memories.filter(mem => {
      const vis = mem.visibility || 'shared';
      
      if (vis === 'shared') return options.includeShared !== false;
      if (vis === 'private') {
        if (!options.includePrivate) return false;
        return mem.agentId === agentId;
      }
      if (vis === 'cross-agent') {
        if (!options.includeCrossAgent) return false;
        return mem.targetAgent === agentId;
      }
      return true;
    });
  }

  private _searchFiles(query: string, options: SearchOptions = {}): Record<string, any>[] {
    if (!fs.existsSync(this.memoriesDir)) return [];
    
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    const results: Record<string, any>[] = [];

    for (const file of fs.readdirSync(this.memoriesDir).filter(f => f.endsWith('.json'))) {
      try {
        const filepath = path.join(this.memoriesDir, file);
        const memory = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        if (options.project && memory.project !== options.project) continue;
        if (options.type && memory.type !== options.type) continue;
        
        // Multi-agent filtering
        if (options.agentId) {
          const vis = memory.visibility || 'shared';
          if (vis === 'private' && memory.agentId !== options.agentId) continue;
          if (vis === 'cross-agent' && memory.targetAgent !== options.agentId) continue;
          if (vis === 'shared' && !options.includeShared) continue;
        }
        
        // Session continuity filtering
        if (options.sessionId) {
          if (memory.sessionId !== options.sessionId) {
            if (!options.includeRelatedSessions) continue;
            const related = memory.relatesToSession || [];
            if (!Array.isArray(related) || !related.includes(options.sessionId)) continue;
          }
        }
        
        const text = (memory.body || memory.summary || '').toLowerCase();
        const keywords = (memory.keywords || []).join(' ').toLowerCase();
        const searchText = text + ' ' + keywords;
        
        let score = 0;
        for (const term of queryTerms) {
          if (searchText.includes(term)) score += 1;
        }
        
        if (score > 0) {
          results.push({ ...memory, score: score * (memory.confidence || 0.8) });
        }
      } catch (e) { /* skip */ }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);
  }

  private _extractKeywords(text: string): string[] {
    const common = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
                   'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                   'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
                   'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
                   'into', 'through', 'during', 'before', 'after', 'above', 'below',
                   'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither'];
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !common.includes(w));
    
    return [...new Set(words)].slice(0, 10);
  }

  private async _refreshClusters(): Promise<void> {
    // Placeholder for cluster refresh
  }

  async getAll(options: SearchOptions = {}): Promise<Record<string, any>[]> {
    if (!fs.existsSync(this.memoriesDir)) return [];
    
    const memories: Record<string, any>[] = [];
    for (const file of fs.readdirSync(this.memoriesDir).filter(f => f.endsWith('.json'))) {
      try {
        const filepath = path.join(this.memoriesDir, file);
        const memory = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        if (options.project && memory.project !== options.project) continue;
        if (options.type && memory.type !== options.type) continue;
        
        memories.push(memory);
      } catch (e) { /* skip */ }
    }
    
    return memories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async delete(id: string): Promise<boolean> {
    const filepath = path.join(this.memoriesDir, `${id}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  }

  getStats() {
    const count = fs.existsSync(this.memoriesDir) 
      ? fs.readdirSync(this.memoriesDir).filter(f => f.endsWith('.json')).length 
      : 0;
    
    return {
      totalMemories: count,
      hotCache: this.hotCache.getStats()
    };
  }
}

export default ClawTextMemory;