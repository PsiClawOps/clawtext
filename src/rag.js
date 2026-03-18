import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * RAG layer for ClawText memory injection
 * Reads pre-built clusters and injects top N memories into prompt context
 */
export class ClawTextRAG {
  constructor(workspacePath = process.env.HOME + '/.openclaw/workspace') {
    this.workspacePath = workspacePath;
    this.clustersDir = path.join(workspacePath, 'memory', 'clusters');
    this.clusters = new Map();
    this.config = {
      enabled: true,
      maxMemories: 5,
      minConfidence: 0.6,
      injectMode: 'smart',
      tokenBudget: 4000,
      // Hybrid RRF merge params
      bm25Weight: 1.0,
      mem0Weight: 1.0,
      rrfK: 60,
      // Optional context curation mode (default OFF)
      contextLibrarianEnabled: process.env.CLAWTEXT_CONTEXT_LIBRARIAN_ENABLED === 'true',
      contextLibrarianMaxSelect: 4,
      contextLibrarianAlwaysIncludeRecent: 1
    };

    this.loadClusters();
  }

  /**
   * Load all cluster files into memory (O(1) lookup)
   */
  loadClusters() {
    if (!fs.existsSync(this.clustersDir)) {
      console.warn(`Clusters directory not found: ${this.clustersDir}`);
      return;
    }

    const entries = fs.readdirSync(this.clustersDir, { withFileTypes: true });
    const files = entries.filter((entry) => {
      if (!entry.name.startsWith('cluster-')) return false;
      if (!entry.isFile()) return false;
      return entry.name.endsWith('.json');
    });

    entries.forEach((entry) => {
      if (!entry.name.startsWith('cluster-')) return;
      if (!entry.isFile()) {
        console.warn(`[ClawText RAG] Skipping non-file cluster entry: ${entry.name}`);
      } else if (!entry.name.endsWith('.json')) {
        console.warn(`[ClawText RAG] Skipping non-JSON cluster entry: ${entry.name}`);
      }
    });

    files.forEach((entry) => {
      const file = entry.name;
      try {
        const fullPath = path.join(this.clustersDir, file);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const projectId = data.projectId || path.basename(file, '.json').replace('cluster-', '');
        this.clusters.set(projectId, data);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[ClawText RAG] Failed to load cluster ${file}: ${message}`);
      }
    });

    console.log(`[ClawText RAG] Loaded ${this.clusters.size} clusters`);
  }

  /**
   * Enhanced BM25-style scoring with project weighting and metadata awareness
   * Fixes cross-domain pollution by:
   * 1. Prioritizing target project matches (2x weight)
   * 2. Penalizing cross-domain matches (0.5x weight)
   * 3. Boosting pattern-key and entity matches (1.5x weight)
   */
  bm25Score(query, memory, targetProjects = []) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const memoryText = (memory.content + ' ' + memory.keywords.join(' ')).toLowerCase();

    // Base term matching
    let score = 0;
    queryTerms.forEach(term => {
      if (memoryText.includes(term)) {
        score += 1;
      }
    });

    // Apply confidence multiplier
    score *= memory.confidence;

    // Mention frequency boost (backward compatible default = 1)
    const mentionCount = Number.isFinite(memory.mentionCount) ? Math.max(1, Number(memory.mentionCount)) : 1;
    const mentionBoost = 1 + Math.min(1, Math.log2(mentionCount) * 0.2);
    score *= mentionBoost;

    // Mild recency boost from lastMentionedAt
    if (memory.lastMentionedAt) {
      const ageMs = Date.now() - new Date(memory.lastMentionedAt).getTime();
      if (Number.isFinite(ageMs) && ageMs >= 0) {
        const days = ageMs / (24 * 60 * 60 * 1000);
        score *= 1 + Math.max(0, 0.1 * Math.exp(-days / 30));
      }
    }

    // Project-aware weighting (prevent cross-domain pollution)
    if (targetProjects.length > 0 && memory.project) {
      const isTargetProject = targetProjects.some(p => 
        p.includes(memory.project) || memory.project.includes(p)
      );
      score *= isTargetProject ? 2.0 : 0.5; // Boost target, penalize cross-domain
    }

    // Pattern-key metadata boost (helps self-correction system find related errors)
    if (memory.patternKey) {
      const patternKeyTerms = memory.patternKey.toLowerCase().split(/[._\-]/);
      const queryHasPatternTerm = patternKeyTerms.some(pt => query.toLowerCase().includes(pt));
      if (queryHasPatternTerm) {
        score *= 1.5; // Boost pattern-key matches
      }
    }

    // Entity mention boost (helps agents find memories about specific entities)
    if (memory.entities && Array.isArray(memory.entities)) {
      const queryHasEntity = memory.entities.some(e => 
        query.toLowerCase().includes(e.toLowerCase())
      );
      if (queryHasEntity) {
        score *= 1.5; // Boost entity-specific matches
      }
    }

    return Math.max(0, score); // Ensure non-negative
  }

  /**
   * Find relevant memories for a query with project-aware scoring
   */
  findRelevantMemories(query, projectKeywords = []) {
    // If disabled or empty query
    if (this.config.injectMode === 'off' || !this.config.enabled || !query) return [];

    // 1) BM25 / cluster results
    const bm25Results = this._findBM25(query, projectKeywords);

    // 2) Recent captures (Mem0 / log-archive) — lightweight scan
    const captureResults = this._findRecentCaptures(query);

    // 3) Merge with RRF (reciprocal rank fusion)
    const merged = this._rrfMerge(bm25Results, captureResults, {
      bm25Weight: this.config.bm25Weight || 1.0,
      mem0Weight: this.config.mem0Weight || 1.0,
      rrfK: this.config.rrfK || 60,
      maxResults: this.config.maxMemories || 5
    });

    return merged;
  }

  /**
   * Format memories for injection into prompt
   */
  _findBM25(query, projectKeywords = []) {
    let targetProjects = projectKeywords.length > 0
      ? Array.from(this.clusters.keys()).filter(p =>
          projectKeywords.some(kw => p.includes(kw) || kw.includes(p))
        )
      : Array.from(this.clusters.keys());

    if (targetProjects.length === 0) {
      targetProjects = Array.from(this.clusters.keys());
    }

    const allMemories = [];

    targetProjects.forEach(project => {
      const cluster = this.clusters.get(project);
      if (!cluster) return;

      cluster.memories.forEach(memory => {
        if (memory.confidence >= this.config.minConfidence) {
          const score = this.bm25Score(query, memory, targetProjects);
          if (score > 0) {
            allMemories.push({ ...memory, score, project });
          }
        }
      });
    });

    return allMemories.sort((a,b)=>b.score-a.score).slice(0, this.config.maxMemories).map(m=>({source:'bm25',score:m.score, memory:m}));
  }

  _findRecentCaptures(query){
    // Use mem0.js query if available (faster than scanning files)
    try{
      const mem0 = require('./mem0.js').default || require('./mem0.js');
      // ensure mem0 index exists
      mem0.initMem0();
      // index archive if mem0 empty (bootstrap)
      const stats = require('fs').statSync(path.join(this.workspacePath, 'state', 'clawtext', 'prod', 'mem0.jsonl'));
      // if file exists and non-empty, skip; otherwise index
      if (stats.size === 0){ mem0.indexArchiveToMem0(); }
      const results = mem0.queryMem0(query, this.config.maxMemories, this.config.phraseRules || []);
      return results;
    }catch(e){
      // fallback to file scan if mem0 unavailable
      const archiveDir = path.join(this.workspacePath, 'memory', 'log-archive');
      if (!fs.existsSync(archiveDir)) return [];
      const files = fs.readdirSync(archiveDir).filter(f=>f.endsWith('.md'));
      const results = [];
      const q = query.toLowerCase();

      files.forEach(f => {
        try{
          const p = path.join(archiveDir,f);
          const text = fs.readFileSync(p,'utf8');
          const excerpt = text.slice(0,1200);
          const lc = excerpt.toLowerCase();
          let hitScore = 0;
          // simple term matches
          q.split(/\s+/).forEach(term=>{ if(term.length>2 && lc.includes(term)) hitScore += 1; });
          // match phrase rules if present
          if (this.config.phraseRules){
            for(const pr of this.config.phraseRules){
              try{ const re = new RegExp(pr.pattern,'i'); if(re.test(excerpt)) hitScore += (pr.weight||0.5); }catch(e){}
            }
          }
          // look for count metadata
          const m = text.match(/count:\s*(\d+)/i);
          const count = m ? parseInt(m[1],10) : 1;
          if (hitScore>0){
            // score factoring frequency
            const score = hitScore * Math.log10(Math.max(1,count))+ (count>1?0.5:0);
            results.push({source:'mem0', score, memory:{content: excerpt, key: f.replace('.md',''), count}});
          }
        }catch(e){ }
      });

      return results.sort((a,b)=>b.score-a.score).slice(0, this.config.maxMemories).map(m=>({source:m.source, score:m.score, memory:m.memory}));
    }
  }

  _rrfMerge(bm25List, mem0List, opts={bm25Weight:1.0, mem0Weight:1.0, rrfK:60, maxResults:5}){
    const mergedScores = new Map();

    function addRank(list, weight, label){
      for(let i=0;i<list.length;i++){
        const item = list[i];
        const rank = i+1;
        const key = item.memory.key || (item.memory.id || ('mem_'+i+'_'+label));
        const rrf = weight * (1.0 / (opts.rrfK + rank));
        const prev = mergedScores.get(key) || {score:0, items:[]};
        prev.score += rrf;
        prev.items.push(item);
        mergedScores.set(key, prev);
      }
    }

    addRank(bm25List, opts.bm25Weight, 'bm25');
    addRank(mem0List, opts.mem0Weight, 'mem0');

    const arr = Array.from(mergedScores.entries()).map(([k,v])=>({key:k,score:v.score,items:v.items}));
    arr.sort((a,b)=>b.score-a.score);
    const top = arr.slice(0, opts.maxResults);
    // normalize output to memory objects
    return top.map(t=>{
      // prefer bm25 source memory if present
      const memItem = t.items.find(x=>x.source==='bm25') || t.items[0];
      const out = Object.assign({}, memItem.memory);
      out._source = memItem.source || (memItem.source==='bm25' ? 'bm25' : 'mem0');
      out._mergedScore = t.score;
      return out;
    });
  }

  // Optional select-then-hydrate curation on top of retrieval results.
  // Additive and default-off to avoid behavior drift.
  curateMemoriesWithLibrarian(memories, query) {
    if (!this.config.contextLibrarianEnabled || memories.length <= 2) return memories;

    const terms = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = memories.map((m, id) => {
      const summary = `${m.type || 'fact'} ${(m.content || '').split('\n')[0]} ${(m.keywords || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (summary.includes(t)) score += 1;
      }
      score += (m.confidence || 0) * 0.5;
      if (m.type === 'decision' || m.type === 'context') score += 0.35;
      if (m._mergedScore) score += Math.min(0.5, m._mergedScore);
      return { id, memory: m, score };
    });

    const selected = scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.contextLibrarianMaxSelect)
      .map(s => s.id);

    const recency = scored
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.memory.updatedAt || a.memory.lastSeenAt || 0).getTime();
        const tb = new Date(b.memory.updatedAt || b.memory.lastSeenAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, this.config.contextLibrarianAlwaysIncludeRecent)
      .map(s => s.id);

    const keep = new Set([...selected, ...recency]);
    return memories.filter((_, idx) => keep.has(idx));
  }

  formatMemories(memories) {
    if (memories.length === 0) return '';

    const sections = {
      context: [],
      decision: [],
      fact: [],
      code: [],
    };

    memories.forEach(m => {
      const type = m.type || 'fact';
      if (sections[type]) {
        sections[type].push(m.content);
      }
    });

    let output = '\n## 🧠 Relevant Context\n\n';

    if (sections.context.length > 0) {
      output += '### Context\n' + sections.context.map(c => `- ${c}`).join('\n') + '\n\n';
    }

    if (sections.decision.length > 0) {
      output += '### Key Decisions\n' + sections.decision.map(d => `- ${d}`).join('\n') + '\n\n';
    }

    if (sections.fact.length > 0) {
      output += '### Facts\n' + sections.fact.map(f => `- ${f}`).join('\n') + '\n\n';
    }

    if (sections.code.length > 0) {
      output += '### Code Reference\n' + sections.code.join('\n') + '\n\n';
    }

    return output;
  }

  /**
   * Estimate tokens (rough: 4 chars per token)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Inject memories into system prompt
   */
  injectMemories(systemPrompt, query, projectKeywords = []) {
    if (this.config.injectMode === 'off') {
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    const memories = this.findRelevantMemories(query, projectKeywords);
    if (memories.length === 0) {
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    const curated = this.curateMemoriesWithLibrarian(memories, query);
    const formatted = this.formatMemories(curated);
    const injectedTokens = this.estimateTokens(formatted);

    if (injectedTokens > this.config.tokenBudget) {
      console.warn(`[ClawText RAG] Injection would exceed budget: ${injectedTokens} > ${this.config.tokenBudget}`);
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    let injectedPrompt = systemPrompt;
    if (this.config.injectMode === 'smart' || this.config.injectMode === 'full') {
      injectedPrompt = systemPrompt + formatted;
    } else if (this.config.injectMode === 'snippets') {
      const snippets = curated
        .map(m => `- [${m.type}] ${m.content.split('\n')[0].substring(0, 100)}...`)
        .join('\n');
      injectedPrompt = systemPrompt + '\n## Context Snippets\n' + snippets + '\n';
    }

    const result = {
      prompt: injectedPrompt,
      injected: curated.length,
      tokens: injectedTokens,
      memories: curated
    };

    // Append metrics log for evaluation
    try{
      const statsDir = path.join(this.workspacePath, 'state', 'clawtext', 'dev');
      if (!fs.existsSync(statsDir)) fs.mkdirSync(statsDir, { recursive: true });
      const logPath = path.join(statsDir, 'mem0-eval.jsonl');
      const entry = {
        ts: new Date().toISOString(),
        query,
        projectKeywords,
        injected: result.injected,
        tokens: result.tokens,
        memories: curated.map(m=>({ key: m.key || null, _source: m._source || null, _mergedScore: m._mergedScore || null }))
      };
      fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    }catch(e){ console.error('[ClawText RAG] failed to write mem0 eval log', e.message); }

    return result;
  }

  /**
   * Update config at runtime
   */
  setConfig(partial) {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Get current stats
   */
  getStats() {
    let totalMemories = 0;
    this.clusters.forEach(c => {
      totalMemories += c.memories.length;
    });

    return {
      clustersLoaded: this.clusters.size,
      totalMemories,
      config: this.config,
    };
  }
}

export default ClawTextRAG;
