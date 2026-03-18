export type ContextSlotSource =
  | 'system'
  | 'memory'
  | 'library'
  | 'clawbridge'
  | 'topic-anchor'
  | 'recent-history'
  | 'mid-history'
  | 'deep-history'
  | 'decision-tree'
  | 'journal'
  | 'cross-session'
  | 'situational-awareness'
  | 'custom';

export interface ContextSlot {
  id: string;
  source: ContextSlotSource;
  content: string;
  score: number;
  bytes: number;
  included: boolean;
  reason: string;
}

export interface SlotContext {
  channelId: string;
  sessionKey: string;
  modelContextWindowTokens: number;
  currentTurnCount: number;
  recentTopics?: string[];
}

export interface SlotProvider {
  id: string;
  source: ContextSlotSource;
  priority: number;
  available(ctx: SlotContext): boolean;
  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[];
  prunable?: boolean;
  prune?(
    slots: ContextSlot[],
    targetFreeBytes: number,
    aggressiveness: number,
  ): ContextSlot[];
}

export interface SlotConfig {
  ratio: number;
  policy: string;
  minBytes?: number;
  enabled: boolean;
}
