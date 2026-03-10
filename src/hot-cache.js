import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * ClawText Hot Memory Cache v1
 *
 * Small, JSON-backed, in-memory cache for ultra-fast recall of recent/high-value
 * memories. This is a performance layer only — canonical memory lives elsewhere.
 */
export class HotMemoryCache {
  constructor(workspacePath, config = {}) {
    this.workspacePath = workspacePath;
    this.cacheDir = path.join(workspacePath, 'memory', 'cache');
    this.persistPath = path.join(this.cacheDir, 'hot.json');
    this.statsPath = path.join(this.cacheDir, 'stats.json');
    this.items = [];
    this.stats = {
      hits: 0,
      misses: 0,
      admissions: 0,
      evictions: 0,
      prunedExpired: 0,
      lastLoadedAt: null,
      lastSavedAt: null,
    };
    this.config = {
      enabled: true,
      maxItems: 300,
      maxPerProject: 50,
      maxSnippetChars: 600,
      maxResultsPerQuery: 5,
      defaultTtlDays: 14,
      stickyTtlDays: 60,
      admissionConfidence: 0.60,  // TUNING: Lowered from 0.78 to admit more cluster results
      admissionScore: 0.8,        // TUNING: Lowered from 1.5 to capture more BM25 matches
      persistEveryAdmissions: 5,
      persistEveryHits: 10,
      ...config,
    };

    this._pendingAdmissions = 0;
    this._pendingHits = 0;
    this.load();
  }

  load() {
    try {
      this.ensureDir();
      if (fs.existsSync(this.persistPath)) {
        const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
        this.items = Array.isArray(data.items) ? data.items : [];
      }
      if (fs.existsSync(this.statsPath)) {
        const data = JSON.parse(fs.readFileSync(this.statsPath, 'utf8'));
        this.stats = { ...this.stats, ...data };
      }
      this.pruneExpired(false);
      this.stats.lastLoadedAt = new Date().toISOString();
    } catch (error) {
      console.error('[ClawText HotCache] Failed to load cache:', error);
      this.items = [];
    }
  }

  ensureDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  save() {
    try {
      this.ensureDir();
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        items: this.items,
      };
      fs.writeFileSync(this.persistPath, JSON.stringify(payload, null, 2) + '\n');
      this.stats.lastSavedAt = new Date().toISOString();
      fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2) + '\n');
    } catch (error) {
      console.error('[ClawText HotCache] Failed to save cache:', error);
    }
  }

  buildCacheKey(memory) {
    const seed = [memory.project || 'general', memory.type || 'fact', memory.content || ''].join('::');
    return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
  }

  toCacheItem(memory, score = 0, options = {}) {
    const now = new Date();
    const ttlDays = options.sticky ? this.config.stickyTtlDays : this.config.defaultTtlDays;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const snippet = (memory.content || '').replace(/\s+/g, ' ').trim().slice(0, this.config.maxSnippetChars);

    return {
      cacheKey: this.buildCacheKey(memory),
      memoryId: memory.id || null,
      project: memory.project || 'general',
      type: memory.type || 'fact',
      summary: snippet,
      snippet,
      content: memory.content,
      entities: Array.isArray(memory.entities) ? memory.entities : [],
      keywords: Array.isArray(memory.keywords) ? memory.keywords : [],
      confidence: memory.confidence || 0,
      importance: options.importance || memory.confidence || 0.5,
      sourceLane: options.sourceLane || 'curated',
      source: memory.source || null,
      hitCount: 0,
      lastHitAt: null,
      createdAt: now.toISOString(),
      updatedAt: memory.updatedAt || now.toISOString(),
      expiresAt,
      sticky: Boolean(options.sticky),
      lastScore: score,
    };
  }

  memoryFromCacheItem(item) {
    return {
      content: item.content || item.summary || item.snippet,
      type: item.type || 'fact',
      source: item.source || 'hot-cache',
      project: item.project || 'general',
      confidence: item.confidence || 0.8,
      keywords: item.keywords || [],
      entities: item.entities || [],
      updatedAt: item.updatedAt,
      cache: {
        cacheKey: item.cacheKey,
        hitCount: item.hitCount,
        sourceLane: item.sourceLane,
      },
    };
  }

  scoreItem(query, item, projectKeywords = []) {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [
      item.summary || '',
      item.snippet || '',
      ...(item.entities || []),
      ...(item.keywords || []),
      item.project || '',
      item.type || '',
    ].join(' ').toLowerCase();

    let termScore = 0;
    for (const term of queryTerms) {
      if (haystack.includes(term)) termScore += 1;
    }

    if (termScore === 0) return 0;

    const projectMatch = projectKeywords.length === 0
      ? 1
      : projectKeywords.some(kw => (item.project || '').includes(kw) || kw.includes(item.project || '')) ? 1 : 0.5;

    const recencyAgeMs = Date.now() - new Date(item.updatedAt || item.createdAt || Date.now()).getTime();
    const recencyDays = Math.max(0, recencyAgeMs / (24 * 60 * 60 * 1000));
    const recencyScore = Math.max(0, 1 - (recencyDays / this.config.defaultTtlDays));
    const hitScore = Math.min(1, (item.hitCount || 0) / 10);
    const stickyScore = item.sticky ? 0.15 : 0;

    return (
      termScore * 0.45 +
      (item.confidence || 0) * 0.2 +
      recencyScore * 0.15 +
      hitScore * 0.1 +
      projectMatch * 0.1 +
      stickyScore
    );
  }

  query(query, projectKeywords = [], limit = this.config.maxResultsPerQuery) {
    if (!this.config.enabled || !query) return [];

    this.pruneExpired(false);

    const results = this.items
      .map(item => ({ item, score: this.scoreItem(query, item, projectKeywords) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (results.length === 0) {
      this.stats.misses += 1;
      return [];
    }

    this.stats.hits += results.length;
    this._pendingHits += results.length;
    const mapped = results.map(({ item, score }) => {
      item.hitCount = (item.hitCount || 0) + 1;
      item.lastHitAt = new Date().toISOString();
      item.lastScore = score;
      return this.memoryFromCacheItem(item);
    });
    if (this._pendingHits >= this.config.persistEveryHits) {
      this._pendingHits = 0;
      this.save();
    }
    return mapped;
  }

  admit(memories = [], context = {}) {
    if (!this.config.enabled || !Array.isArray(memories) || memories.length === 0) return 0;

    let admitted = 0;
    for (const memory of memories) {
      const score = memory.score || 0;
      const confidence = memory.confidence || 0;
      if (confidence < this.config.admissionConfidence || score < this.config.admissionScore) {
        continue;
      }

      const cacheKey = this.buildCacheKey(memory);
      const existing = this.items.find(item => item.cacheKey === cacheKey);
      if (existing) {
        existing.summary = (memory.content || existing.summary || '').replace(/\s+/g, ' ').trim().slice(0, this.config.maxSnippetChars);
        existing.snippet = existing.summary;
        existing.content = memory.content || existing.content;
        existing.confidence = Math.max(existing.confidence || 0, confidence);
        existing.updatedAt = memory.updatedAt || new Date().toISOString();
        existing.lastScore = Math.max(existing.lastScore || 0, score);
        continue;
      }

      const projectItems = this.items.filter(item => item.project === (memory.project || 'general'));
      if (projectItems.length >= this.config.maxPerProject) {
        const worstProjectItem = [...projectItems].sort((a, b) => this.evictionScore(a) - this.evictionScore(b))[0];
        this.removeByKey(worstProjectItem.cacheKey);
      }

      const sticky = confidence >= 0.92 && score >= 3;
      this.items.push(this.toCacheItem(memory, score, {
        sticky,
        sourceLane: 'curated',
        importance: Math.min(1, (confidence * 0.7) + Math.min(score / 5, 0.3)),
      }));
      admitted += 1;
      this.stats.admissions += 1;
      this._pendingAdmissions += 1;
    }

    if (admitted > 0) {
      this.enforceLimits();
      if (this._pendingAdmissions >= this.config.persistEveryAdmissions) {
        this._pendingAdmissions = 0;
        this.save();
      }
    }

    return admitted;
  }

  evictionScore(item) {
    const hitBonus = Math.min(1, (item.hitCount || 0) / 10);
    const confidence = item.confidence || 0;
    const stickyBonus = item.sticky ? 0.2 : 0;
    const lastTouched = new Date(item.lastHitAt || item.updatedAt || item.createdAt || Date.now()).getTime();
    const ageDays = Math.max(0, (Date.now() - lastTouched) / (24 * 60 * 60 * 1000));
    const freshness = Math.max(0, 1 - (ageDays / this.config.stickyTtlDays));
    return confidence * 0.35 + hitBonus * 0.25 + freshness * 0.2 + stickyBonus + (item.importance || 0) * 0.2;
  }

  removeByKey(cacheKey) {
    const index = this.items.findIndex(item => item.cacheKey === cacheKey);
    if (index >= 0) {
      this.items.splice(index, 1);
      this.stats.evictions += 1;
      return true;
    }
    return false;
  }

  enforceLimits() {
    if (this.items.length <= this.config.maxItems) return;
    this.items = this.items
      .sort((a, b) => this.evictionScore(b) - this.evictionScore(a))
      .slice(0, this.config.maxItems);
  }

  pruneExpired(saveAfter = true) {
    const before = this.items.length;
    const now = Date.now();
    this.items = this.items.filter(item => {
      if (!item.expiresAt) return true;
      return new Date(item.expiresAt).getTime() > now;
    });
    const removed = before - this.items.length;
    if (removed > 0) {
      this.stats.prunedExpired += removed;
      if (saveAfter) this.save();
    }
    return removed;
  }

  getStats() {
    const byProject = {};
    const byType = {};
    for (const item of this.items) {
      byProject[item.project] = (byProject[item.project] || 0) + 1;
      byType[item.type] = (byType[item.type] || 0) + 1;
    }

    return {
      enabled: this.config.enabled,
      itemCount: this.items.length,
      byProject,
      byType,
      config: this.config,
      stats: this.stats,
    };
  }
}

export default HotMemoryCache;
