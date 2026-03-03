import ClawTextRAG from './rag.js';

/**
 * Plugin hook for automatic context injection
 * Fires on before_prompt_build to inject relevant memories
 */
export class ClawTextInjectionPlugin {
  private rag: ClawTextRAG;
  private projectKeywords: Record<string, string[]> = {
    moltmud: ['moltmud', 'agent', 'game'],
    openclaw: ['openclaw', 'gateway', 'plugin'],
    rgcs: ['rgcs', 'raycast', 'script'],
  };

  constructor() {
    this.rag = new ClawTextRAG();
  }

  /**
   * Hook: before_prompt_build
   * Called before each prompt is built, allows modification of system prompt
   */
  async onBeforePromptBuild(context: {
    systemPrompt: string;
    userMessage: string;
    sessionId?: string;
    model?: string;
  }): Promise<{ systemPrompt: string; injectionStats?: any }> {
    try {
      // Extract project keywords from user message or session context
      let projectKeywords: string[] = [];
      Object.entries(this.projectKeywords).forEach(([_project, keywords]) => {
        const matched = keywords.filter(kw =>
          context.userMessage.toLowerCase().includes(kw) ||
          context.systemPrompt.toLowerCase().includes(kw)
        );
        if (matched.length > 0) {
          projectKeywords.push(...matched);
        }
      });

      // Inject memories
      const { prompt, injected, tokens } = this.rag.injectMemories(
        context.systemPrompt,
        context.userMessage,
        projectKeywords
      );

      if (injected > 0) {
        console.log(
          `[ClawText] Injected ${injected} memories (${tokens} tokens) for session ${context.sessionId}`
        );
      }

      return {
        systemPrompt: prompt,
        injectionStats: {
          memoriesInjected: injected,
          tokensAdded: tokens,
          projectKeywords,
        },
      };
    } catch (error) {
      console.error('[ClawText] Injection failed:', error);
      return { systemPrompt: context.systemPrompt };
    }
  }

  /**
   * Get RAG stats (for monitoring)
   */
  getStats() {
    return this.rag.getStats();
  }

  /**
   * Reload clusters (for hot updates)
   */
  reload() {
    this.rag = new ClawTextRAG();
    return this.getStats();
  }
}

export default ClawTextInjectionPlugin;
