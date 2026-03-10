/**
 * ClawText Memory API
 * Simple programmatic interface for agents to add and retrieve memories
 * 
 * Usage:
 *   import { ClawTextMemory } from './src/memory.js';
 *   const memory = new ClawTextMemory(workspacePath);
 *   
 *   // Add a memory
 *   await memory.add('User prefers dark mode', { type: 'preference', project: 'ui' });
 *   
 *   // Search memories
 *   const results = await memory.search('user interface preferences');
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import HotMemoryCache from './hot-cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ClawTextMemory {
  constructor(workspacePath = process.env.HOME + '/.openclaw/workspace') {
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

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _generateId() {
    return 'mem_' + crypto.randomBytes(8).toString('hex');
  }

  _hashContent(content) {
    return crypto.createHash('sha1').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Add a memory programmatically
   * @param {string} content - The memory content
   * @param {object} options - Optional metadata
   * @param {string} options.type - Memory type: fact, decision, preference, learning, protocol, todo, note
   * @param {string} options.project - Project name
   * @param {string[]} options.entities - Entity references
   * @param {string[]} options.keywords - Keywords for search
   * @param {number} options.confidence - Confidence score 0-1
   * @param {string} options.agentId - Agent ID creating this memory
   * @param {string} options.agentName - Human-readable agent name
   * @param {string} options.visibility - shared | private | cross-agent
   * @param {string} options.targetAgent - For cross-agent: intended recipient
   * @returns {object} The created memory
   */
  async add(content, options = {}) {
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
      // Session continuity (same agent across sessions)
      sessionId: options.sessionId || null,
      relatesToSession: options.relatesToSession || null,
    };

    // Save to memories directory
    const filepath = path.join(this.memoriesDir, `${id}.json`);
    fs.writeFileSync(filepath, JSON.stringify(memory, null, 2));
    
    // Also add to hot cache for fast retrieval
    this.hotCache.admit([memory]);

    // Optionally update clusters (for RAG retrieval)
    await this._refreshClusters();

    return memory;
  }

  /**
   * Search memories using semantic-like matching
   * @param {string} query - Search query
   * @param {object} options - Search options
   * @param {number} options.limit - Max results
   * @param {string} options.project - Filter by project
   * @param {string} options.type - Filter by type
   * @param {string} options.agentId - Current agent ID (for multi-agent filtering)
   * @param {boolean} options.includeShared - Include shared memories
   * @param {boolean} options.includePrivate - Include private memories (only if agentId matches)
   * @param {boolean} options.includeCrossAgent - Include cross-agent memories to this agent
   * @returns {object[]} Array of matching memories
   */
  async search(query, options = {}) {
    const limit = options.limit || 10;
    const projectFilter = options.project;
    const typeFilter = options.type;
    const agentId = options.agentId;

    // 1. Check hot cache first (filtered by agent context)
    const cacheResults = this.hotCache.query(query, projectFilter ? [projectFilter] : [], limit);
    
    // 2. Search file-based memories with multi-agent filtering
    const fileResults = this._searchFiles(query, { 
      project: projectFilter, 
      type: typeFilter, 
      limit,
      agentId,
      includeShared: options.includeShared !== false,
      includePrivate: options.includePrivate,
      includeCrossAgent: options.includeCrossAgent,
    });
    
    // 3. Filter cache results by agent context too
    const filteredCache = this._filterByAgentContext(cacheResults, agentId, options);
    
    // 4. Merge and dedupe
    const combined = [...filteredCache, ...fileResults];
    const seen = new Set();
    const unique = [];
    
    for (const mem of combined) {
      const key = mem.id || mem.dedupeHash;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(mem);
      }
    }

    return unique.slice(0, limit);
  }

  _filterByAgentContext(memories, agentId, options) {
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

  _searchFiles(query, options = {}) {
    if (!fs.existsSync(this.memoriesDir)) return [];
    
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    const results = [];

    for (const file of fs.readdirSync(this.memoriesDir).filter(f => f.endsWith('.json'))) {
      try {
        const filepath = path.join(this.memoriesDir, file);
        const memory = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        // Apply filters
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
          // Include current session
          if (memory.sessionId !== options.sessionId) {
            // Also include memories from related sessions if requested
            if (!options.includeRelatedSessions) continue;
            const related = memory.relatesToSession || [];
            if (!Array.isArray(related) || !related.includes(options.sessionId)) continue;
          }
        }
        
        // Score by term matching
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
      } catch (e) { /* skip bad files */ }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);
  }

  _extractKeywords(text) {
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

  async _refreshClusters() {
    // In a full implementation, this would rebuild the cluster index
    // For now, memories are searchable via the API directly
  }

  /**
   * Get all memories with optional filtering
   */
  async getAll(options = {}) {
    if (!fs.existsSync(this.memoriesDir)) return [];
    
    const memories = [];
    for (const file of fs.readdirSync(this.memoriesDir).filter(f => f.endsWith('.json'))) {
      try {
        const filepath = path.join(this.memoriesDir, file);
        const memory = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        if (options.project && memory.project !== options.project) continue;
        if (options.type && memory.type !== options.type) continue;
        
        memories.push(memory);
      } catch (e) { /* skip */ }
    }
    
    return memories.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Delete a memory by ID
   */
  async delete(id) {
    const filepath = path.join(this.memoriesDir, `${id}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  }

  /**
   * Get system statistics
   */
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