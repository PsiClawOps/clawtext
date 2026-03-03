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
    this.clustersDir = path.join(workspacePath, 'memory', 'clusters');
    this.clusters = new Map();
    this.config = {
      enabled: true,
      maxMemories: 5,
      minConfidence: 0.6,
      injectMode: 'smart',
      tokenBudget: 4000,
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

    const files = fs.readdirSync(this.clustersDir).filter(f => f.startsWith('cluster-'));

    files.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.clustersDir, file), 'utf8'));
        const projectId = data.projectId || path.basename(file, '.json').replace('cluster-', '');
        this.clusters.set(projectId, data);
      } catch (e) {
        console.error(`Failed to load cluster ${file}:`, e);
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
    if (this.config.enabled || !query) return [];

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
          // Pass targetProjects to scoring function for project weighting
          const score = this.bm25Score(query, memory, targetProjects);
          if (score > 0) {
            allMemories.push({ 
              ...memory, 
              score,
              project: project // Preserve project context for scoring
            });
          }
        }
      });
    });

    return allMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMemories)
      .map(({ score, ...memory }) => memory);
  }

  /**
   * Format memories for injection into prompt
   */
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

    const formatted = this.formatMemories(memories);
    const injectedTokens = this.estimateTokens(formatted);

    if (injectedTokens > this.config.tokenBudget) {
      console.warn(`[ClawText RAG] Injection would exceed budget: ${injectedTokens} > ${this.config.tokenBudget}`);
      return { prompt: systemPrompt, injected: 0, tokens: 0 };
    }

    let injectedPrompt = systemPrompt;
    if (this.config.injectMode === 'smart' || this.config.injectMode === 'full') {
      injectedPrompt = systemPrompt + formatted;
    } else if (this.config.injectMode === 'snippets') {
      const snippets = memories
        .map(m => `- [${m.type}] ${m.content.split('\n')[0].substring(0, 100)}...`)
        .join('\n');
      injectedPrompt = systemPrompt + '\n## Context Snippets\n' + snippets + '\n';
    }

    return {
      prompt: injectedPrompt,
      injected: memories.length,
      tokens: injectedTokens,
    };
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
