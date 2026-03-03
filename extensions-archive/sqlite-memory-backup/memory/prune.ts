import { MemoryService } from './service.js';
import { ContextWindow } from './types.js';

export interface PruneResult {
  prunedMessages: any[];
  summary: string;
  tokensSaved: number;
}

export interface PruneOptions {
  tokenBudget?: number;
  preserveRecent?: number;  // Keep N most recent messages
  minMessagesToPrune?: number;
}

export class ContextPruner {
  private service: MemoryService;
  private summarizeFn: (messages: any[]) => Promise<string>;

  constructor(
    service: MemoryService,
    summarizeFn: (messages: any[]) => Promise<string>
  ) {
    this.service = service;
    this.summarizeFn = summarizeFn;
  }

  /**
   * Check if pruning is needed and prune if so
   */
  async pruneIfNeeded(
    sessionId: string,
    newMessageTokens: number = 0,
    options: PruneOptions = {}
  ): Promise<{ pruned: boolean; result?: PruneResult }> {
    const window = this.service.getContextWindow(sessionId);
    if (!window) return { pruned: false };

    const budget = options.tokenBudget || window.tokenBudget || 6000;
    const preserveRecent = options.preserveRecent || 4;
    const projectedTokens = window.tokenUsed + newMessageTokens;

    if (projectedTokens <= budget) {
      return { pruned: false };
    }

    // Calculate how many tokens we need to free up
    const tokensToFree = projectedTokens - budget + 500; // Buffer of 500 tokens
    const result = await this.prune(window, tokensToFree, preserveRecent);
    
    return { pruned: true, result };
  }

  /**
   * Prune messages from the context window
   */
  private async prune(
    window: ContextWindow,
    tokensToFree: number,
    preserveRecent: number
  ): Promise<PruneResult> {
    const messages = [...window.messages];
    
    // Don't prune if we have fewer messages than preserve threshold
    if (messages.length <= preserveRecent) {
      return {
        prunedMessages: [],
        summary: window.summary || '',
        tokensSaved: 0,
      };
    }

    // Identify messages to prune (oldest first, excluding preserved)
    const candidates = messages.slice(0, -preserveRecent);
    const toKeep = messages.slice(-preserveRecent);

    // Estimate tokens per message (rough)
    const tokensPerMessage = Math.ceil(window.tokenUsed / messages.length);
    const messagesToPruneCount = Math.ceil(tokensToFree / tokensPerMessage);
    
    const actualPruneCount = Math.min(
      messagesToPruneCount,
      candidates.length
    );

    const prunedMessages = candidates.slice(0, actualPruneCount);
    const remainingOld = candidates.slice(actualPruneCount);

    // Generate summary of pruned content
    const newSummary = await this.summarizeFn(prunedMessages);
    
    // Combine with existing summary if present
    const combinedSummary = window.summary 
      ? `${window.summary}\n\n[Additional context]: ${newSummary}`
      : newSummary;

    const tokensSaved = prunedMessages.length * tokensPerMessage;

    return {
      prunedMessages,
      summary: combinedSummary,
      tokensSaved,
    };
  }

  /**
   * Apply pruning results to a context window
   */
  applyPruning(
    sessionId: string,
    result: PruneResult,
    projectId?: string
  ): void {
    const window = this.service.getContextWindow(sessionId);
    if (!window) return;

    // Remove pruned messages
    const remainingMessages = window.messages.slice(result.prunedMessages.length);
    
    // Save updated context window with summary
    this.service.saveContextWindow({
      sessionId,
      agentId: window.agentId,
      projectId: projectId || window.projectId,
      messages: remainingMessages,
      tokenBudget: window.tokenBudget,
    });

    // Also store the summary as a memory for long-term reference
    this.service.createMemory({
      content: result.summary,
      type: 'summary',
      source: 'pruned',
      projectId,
    }, projectId);
  }

  /**
   * Force compact a context window regardless of budget
   */
  async compact(
    sessionId: string,
    projectId?: string
  ): Promise<string> {
    const window = this.service.getContextWindow(sessionId);
    if (!window || window.messages.length === 0) {
      return 'No context to compact.';
    }

    const summary = await this.summarizeFn(window.messages);
    
    // Clear all messages, keep just the summary
    this.service.saveContextWindow({
      sessionId,
      agentId: window.agentId,
      projectId: projectId || window.projectId,
      messages: [{ 
        role: 'system', 
        content: `Previous conversation summarized: ${summary}` 
      }],
      tokenBudget: window.tokenBudget,
    });

    // Store as memory
    this.service.createMemory({
      content: summary,
      type: 'summary',
      source: 'pruned',
      priority: 0.8, // Higher priority since user explicitly compacted
      projectId,
    }, projectId);

    return summary;
  }
}
