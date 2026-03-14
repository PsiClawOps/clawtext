/**
 * ClawText Operational Memory Retrieval & Injection
 * 
 * Task classification and retrieval:
 * - Determine when operational memory is relevant
 * - Separate retrieval path for operational patterns
 * - Merge with normal memory when appropriate
 * - Injection rules (never in normal chat)
 */

import { OperationalMemoryManager, OperationalMemory, Scope, Status } from './operational.js';
import { OperationalAggregationManager } from './operational-aggregation.js';

/**
 * Task type classification
 */
export type TaskType = 
  | 'normal-chat'
  | 'debugging'
  | 'tool-use'
  | 'command-execution'
  | 'config-change'
  | 'deployment'
  | 'gateway-work'
  | 'plugin-work'
  | 'unknown';

/**
 * Task context for classification
 */
export interface TaskContext {
  userMessage: string;
  systemPrompt?: string;
  recentHistory?: string[];
  toolsAvailable?: string[];
  currentTask?: string;
}

/**
 * Classification result
 */
export interface ClassificationResult {
  taskType: TaskType;
  confidence: number;
  shouldQueryOperational: boolean;
  reasoning: string;
}

/**
 * Operational retrieval result
 */
export interface OperationalRetrievalResult {
  patterns: OperationalMemory[];
  taskType: TaskType;
  queryUsed: string;
  totalPatterns: number;
  injectionReady: boolean;
  scopeIsolationEnabled?: boolean;
  allowedScopes?: Scope[];
}

interface RankedOperationalPattern {
  pattern: OperationalMemory;
  score: number;
}

/**
 * Operational retrieval manager
 */
export class OperationalRetrievalManager {
  private memoryManager: OperationalMemoryManager;
  private aggregationManager: OperationalAggregationManager;
  private workspacePath: string;

  // Task type keywords for classification
  private taskKeywords: Record<TaskType, string[]> = {
    'normal-chat': ['hello', 'hi', 'thanks', 'help', 'what', 'how', 'explain', 'tell me', 'can you', 'are you', 'good morning'],
    'debugging': ['debug', 'error', 'fix', 'issue', 'problem', 'not working', 'broken', 'fail', 'exception', 'bug', 'trouble', 'stuck'],
    'tool-use': ['tool', 'api', 'call', 'function', 'execute', 'invoke', 'use tool', 'call tool', 'tool call'],
    'command-execution': ['exec', 'command', 'run', 'shell', 'bash', 'terminal', 'cli', 'execute command', 'npm', 'yarn', 'install'],
    'config-change': ['config', 'configuration', 'setting', 'change config', 'update config', 'modify', 'tune', 'adjust'],
    'deployment': ['deploy', 'release', 'publish', 'push', 'ship', 'production', 'live', 'deploying', 'releasing'],
    'gateway-work': ['gateway', 'openclaw', 'plugin', 'skill', 'extension', 'gateway config', 'openclaw config', 'clawbridge', 'bridge', 'discord', 'thread', 'forum', 'transfer'],
    'plugin-work': ['plugin', 'extension', 'skill', 'install', 'enable', 'disable plugin', 'add plugin', 'clawbridge', 'bridge'],
    'unknown': [],
  };

  // Task types that should query operational memory
  private operationalQueryTypes: TaskType[] = [
    'debugging',
    'tool-use',
    'command-execution',
    'config-change',
    'deployment',
    'gateway-work',
    'plugin-work',
  ];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.aggregationManager = new OperationalAggregationManager(workspacePath);
  }

  private isScopeIsolationEnabled(): boolean {
    return process.env.CLAWTEXT_SCOPE_ISOLATION_ENABLED === 'true';
  }

  private getRetrievalStatuses(): Status[] {
    return ['reviewed', 'promoted'];
  }

  private isSyntheticPattern(pattern: OperationalMemory): boolean {
    const haystack = [
      pattern.patternKey,
      pattern.summary,
      pattern.symptom,
      pattern.trigger,
      ...(pattern.evidence || []),
    ].join(' ').toLowerCase();

    return (
      haystack.includes('synthetic') ||
      haystack.includes('phase-7') ||
      haystack.includes('wrapper test') ||
      haystack.includes('verification test')
    );
  }

  private getQueryTokens(query: string): string[] {
    const stopwords = new Set([
      'and', 'the', 'that', 'with', 'from', 'into', 'this', 'have', 'need', 'should', 'would', 'could', 'what', 'how', 'are', 'not', 'for'
    ]);

    return Array.from(new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !stopwords.has(token))
    ));
  }

  private countQueryMatches(pattern: OperationalMemory, query: string): number {
    const haystack = [
      pattern.patternKey,
      pattern.summary,
      pattern.symptom,
      pattern.trigger,
      pattern.rootCause,
      pattern.fix,
      ...(pattern.tags || []),
      ...(pattern.evidence || []),
    ].join(' ').toLowerCase();

    const tokens = this.getQueryTokens(query);
    return tokens.reduce((sum, token) => {
      const normalized = token.length > 4 ? token.slice(0, 4) : token;
      return sum + ((haystack.includes(token) || haystack.includes(normalized)) ? 1 : 0);
    }, 0);
  }

  private recencyScore(lastSeenAt: string): number {
    const ts = new Date(lastSeenAt).getTime();
    if (!Number.isFinite(ts)) return 0;

    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    if (ageDays <= 1) return 10;
    if (ageDays <= 7) return 7;
    if (ageDays <= 30) return 4;
    return 1;
  }

  private scorePattern(pattern: OperationalMemory, query: string): number {
    let score = 0;

    const queryMatches = this.countQueryMatches(pattern, query);
    score += queryMatches * 18;
    if (query.trim() && queryMatches === 0) score -= 10;

    score += Math.min(pattern.recurrenceCount, 6) * 4;
    score += Math.round(pattern.confidence * 20);
    score += this.recencyScore(pattern.lastSeenAt);
    score += pattern.status === 'promoted' ? 8 : 4;

    if (pattern.rootCause !== 'TBD') score += 4;
    else score -= 6;

    if (pattern.fix !== 'TBD') score += 4;
    else score -= 6;

    if (this.isSyntheticPattern(pattern)) score -= 60;

    return score;
  }

  private rankPatterns(patterns: OperationalMemory[], query: string): OperationalMemory[] {
    return patterns
      .map((pattern) => ({ pattern, score: this.scorePattern(pattern, query) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.pattern);
  }

  /**
   * Determine allowed scopes for strict retrieval mode.
   * Default remains broad unless feature flag is enabled.
   */
  private getAllowedScopes(taskType: TaskType): Scope[] {
    switch (taskType) {
      case 'tool-use':
        return ['tool', 'agent', 'global'];
      case 'command-execution':
        return ['tool', 'agent', 'gateway', 'global'];
      case 'config-change':
      case 'deployment':
      case 'gateway-work':
      case 'plugin-work':
        return ['gateway', 'agent', 'tool', 'global'];
      case 'debugging':
        return ['project', 'tool', 'agent', 'gateway', 'global'];
      case 'normal-chat':
      case 'unknown':
      default:
        return ['global'];
    }
  }

  /**
   * Optional strict filter to reduce cross-scope noise.
   * Only active when CLAWTEXT_SCOPE_ISOLATION_ENABLED=true.
   */
  private applyScopeIsolation(patterns: OperationalMemory[], allowedScopes: Scope[]): OperationalMemory[] {
    return patterns.filter((p) => allowedScopes.includes(p.scope));
  }

  /**
   * Classify a task based on context
   */
  classifyTask(context: TaskContext): ClassificationResult {
    const text = this.combineContext(context).toLowerCase();
    
    // Count keyword matches for each task type
    const scores: Record<TaskType, number> = {
      'normal-chat': 0,
      'debugging': 0,
      'tool-use': 0,
      'command-execution': 0,
      'config-change': 0,
      'deployment': 0,
      'gateway-work': 0,
      'plugin-work': 0,
      'unknown': 0,
    };

    // Score each task type
    Object.entries(this.taskKeywords).forEach(([taskType, keywords]) => {
      const type = taskType as TaskType;
      keywords.forEach(keyword => {
        if (text.includes(keyword.toLowerCase())) {
          scores[type]++;
        }
      });
    });

    // Find best match
    let bestType: TaskType = 'unknown';
    let bestScore = 0;

    Object.entries(scores).forEach(([taskType, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestType = taskType as TaskType;
      }
    });

    // Calculate confidence
    const totalWords = text.split(/\s+/).length;
    const confidence = totalWords > 0 ? Math.min(1.0, bestScore / Math.max(1, totalWords / 10)) : 0.3;

    // Determine if operational memory should be queried
    const shouldQueryOperational = this.operationalQueryTypes.includes(bestType) && bestScore > 0;

    // Generate reasoning
    const reasoning = this.generateReasoning(bestType, bestScore, confidence);

    return {
      taskType: bestType,
      confidence,
      shouldQueryOperational,
      reasoning,
    };
  }

  /**
   * Combine context into searchable text
   */
  private combineContext(context: TaskContext): string {
    const parts = [
      context.userMessage || '',
      context.systemPrompt || '',
      ...(context.recentHistory || []),
      ...(context.toolsAvailable || []).map(t => `tool: ${t}`),
      context.currentTask || '',
    ];
    return parts.join(' ').toLowerCase();
  }

  /**
   * Generate reasoning for classification
   */
  private generateReasoning(taskType: TaskType, score: number, confidence: number): string {
    if (score === 0) {
      return 'No clear task indicators found, defaulting to unknown';
    }

    const confidenceLevel = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low';
    return `Classified as ${taskType} with ${confidenceLevel} confidence (${confidence.toFixed(2)})`;
  }

  /**
   * Retrieve operational patterns for a task
   */
  async retrieveForTask(context: TaskContext, query?: string): Promise<OperationalRetrievalResult> {
    const classification = this.classifyTask(context);
    const scopeIsolationEnabled = this.isScopeIsolationEnabled();
    const allowedScopes = this.getAllowedScopes(classification.taskType);

    // Combine query from context if not provided
    const searchQuery = query || context.userMessage || '';

    // Only query operational memory for relevant task types
    let patterns: OperationalMemory[] = [];

    if (classification.shouldQueryOperational) {
      const retrievalStatuses = this.getRetrievalStatuses();
      let retrievable = retrievalStatuses.flatMap((status) =>
        this.memoryManager.getAllByStatus(status)
      );

      if (scopeIsolationEnabled) {
        retrievable = this.applyScopeIsolation(retrievable, allowedScopes);
      }

      const ranked = this.rankPatterns(retrievable, searchQuery);
      const hasQuery = this.getQueryTokens(searchQuery).length > 0;
      const hasPositiveMatch = ranked.some((pattern) => this.countQueryMatches(pattern, searchQuery) > 0);

      patterns = ranked
        .filter((pattern) => {
          if (!hasQuery) return true;
          const matches = this.countQueryMatches(pattern, searchQuery);
          if (hasPositiveMatch) return matches >= 2 || (pattern.recurrenceCount >= 5 && !this.isSyntheticPattern(pattern));
          return pattern.recurrenceCount >= 3;
        })
        .slice(0, 8);
    }

    return {
      patterns,
      taskType: classification.taskType,
      queryUsed: searchQuery,
      totalPatterns: patterns.length,
      injectionReady: patterns.length > 0 && classification.shouldQueryOperational,
      scopeIsolationEnabled,
      allowedScopes: scopeIsolationEnabled ? allowedScopes : undefined,
    };
  }

  /**
   * Format operational patterns for injection
   */
  formatForInjection(patterns: OperationalMemory[]): string {
    if (patterns.length === 0) {
      return '';
    }

    let output = '\n\n## Operational Patterns to Consider\n\n';
    output += 'Based on past experiences, consider these patterns:\n\n';

    patterns.forEach((pattern, i) => {
      const typeEmoji = {
        'error-pattern': '⚠️',
        'anti-pattern': '🚫',
        'recovery-pattern': '✅',
        'success-pattern': '🌟',
        'optimization': '⚡',
        'capability-gap': '🔍',
      };

      output += `${i + 1}. ${typeEmoji[pattern.type] || '•'} **${pattern.patternKey}**\n`;
      output += `   - Summary: ${pattern.summary}\n`;
      output += `   - Recurrence: ${pattern.recurrenceCount}\n`;
      
      if (pattern.rootCause !== 'TBD') {
        output += `   - Root cause: ${pattern.rootCause}\n`;
      }
      
      if (pattern.fix !== 'TBD') {
        output += `   - Fix: ${pattern.fix}\n`;
      }
      
      output += '\n';
    });

    return output;
  }

  /**
   * Merge operational patterns with normal memory injection
   */
  mergeWithNormalMemory(normalInjection: string, operationalResult: OperationalRetrievalResult): string {
    if (!operationalResult.injectionReady || operationalResult.patterns.length === 0) {
      return normalInjection;
    }

    const operationalInjection = this.formatForInjection(operationalResult.patterns);
    
    // Insert operational patterns before the end of the injection
    return normalInjection.trimEnd() + operationalInjection;
  }

  /**
   * Check if operational memory should be injected for this task
   */
  shouldInjectOperational(taskType: TaskType): boolean {
    return this.operationalQueryTypes.includes(taskType);
  }

  /**
   * Get operational memory summary for health reports
   */
  getHealthSummary(): {
    totalRetrievable: number;
    highRecurrence: number;
    byType: Record<string, number>;
    byScope: Record<string, number>;
  } {
    const retrievable = this.rankPatterns(
      this.getRetrievalStatuses().flatMap((status) => this.memoryManager.getAllByStatus(status)),
      ''
    );

    const byType: Record<string, number> = {};
    const byScope: Record<string, number> = {};

    retrievable.forEach(p => {
      byType[p.type] = (byType[p.type] || 0) + 1;
      byScope[p.scope] = (byScope[p.scope] || 0) + 1;
    });

    return {
      totalRetrievable: retrievable.length,
      highRecurrence: retrievable.filter(p => p.recurrenceCount >= 3).length,
      byType,
      byScope,
    };
  }
}

export default OperationalRetrievalManager;
