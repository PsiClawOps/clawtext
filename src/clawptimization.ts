import os from 'os';
import path from 'path';
import { DEFAULT_SLOT_CONFIGS } from './budget-manager.js';
import { PromptCompositor, type CompositionResult, type CompositionStrategy } from './prompt-compositor.js';
import type { ContextSlot, ContextSlotSource, SlotConfig, SlotProvider } from './slot-provider.js';

export type OptimizationResult = CompositionResult;

export interface ClawptimizationConfig {
  enabled: boolean;
  budgetBytes?: number;
  minScore: number;
  preserveReasons: boolean;
  strategy: CompositionStrategy;
  logDecisions: boolean;
  budget?: {
    budgetRatio?: number;
    contextWindowTokens?: number;
    slots?: Partial<Record<ContextSlotSource, SlotConfig>>;
    overflowMode?: 'redistribute' | 'none';
  };
}

export const DEFAULT_CLAWPTIMIZATION_CONFIG: ClawptimizationConfig = {
  enabled: false,
  minScore: 0.25,
  preserveReasons: true,
  strategy: 'passthrough',
  logDecisions: true,
  budget: {
    budgetRatio: 0.15,
    contextWindowTokens: 160_000,
    slots: { ...DEFAULT_SLOT_CONFIGS },
    overflowMode: 'redistribute',
  },
};

export class Clawptimizer {
  private readonly workspacePath: string;
  private readonly config: ClawptimizationConfig;

  constructor(workspacePath: string, config: Partial<ClawptimizationConfig> = {}) {
    this.workspacePath = workspacePath;
    this.config = {
      ...DEFAULT_CLAWPTIMIZATION_CONFIG,
      ...config,
      budget: {
        ...DEFAULT_CLAWPTIMIZATION_CONFIG.budget,
        ...(config.budget ?? {}),
        slots: {
          ...DEFAULT_CLAWPTIMIZATION_CONFIG.budget?.slots,
          ...(config.budget?.slots ?? {}),
        },
      },
    };
  }

  optimize(slots: ContextSlot[]): OptimizationResult {
    const contextWindowTokens = this.resolveContextWindowTokens();
    const compositor = new PromptCompositor({
      enabled: this.config.enabled,
      strategy: this.config.strategy,
      minScore: this.config.minScore,
      preserveReasons: this.config.preserveReasons,
      logDecisions: false,
      workspacePath: this.workspacePath,
      budget: {
        contextWindowTokens,
        budgetRatio: this.config.budget?.budgetRatio,
        slots: this.config.budget?.slots,
        overflowMode: this.config.budget?.overflowMode,
      },
    });

    const grouped = new Map<ContextSlotSource, ContextSlot[]>();
    for (const slot of slots) {
      const source = slot.source ?? 'custom';
      const current = grouped.get(source) ?? [];
      current.push({ ...slot });
      grouped.set(source, current);
    }

    for (const [source, sourceSlots] of grouped.entries()) {
      const provider: SlotProvider = {
        id: `legacy:${source}`,
        source,
        priority: 100,
        available: () => sourceSlots.length > 0,
        fill: () => sourceSlots.map((slot) => ({ ...slot, source })),
      };
      compositor.register(provider);
    }

    return compositor.compose({
      channelId: 'legacy',
      sessionKey: 'legacy',
      modelContextWindowTokens: contextWindowTokens,
      currentTurnCount: 0,
    });
  }

  scoreContent(
    content: string,
    metadata: { source: string; ageMs?: number; isRawLog?: boolean; precedingGapMs?: number },
  ): number {
    const text = content.trim();
    if (!text) return 0;

    const length = text.length;
    const words = text.split(/\s+/).filter(Boolean).length;

    const substance = Math.min(1, words / 80);

    const ageMs = metadata.ageMs ?? 0;
    const freshness = ageMs <= 0 ? 1 : 1 / (1 + ageMs / (1000 * 60 * 60 * 12));

    const noveltyGapMs = metadata.precedingGapMs ?? 0;
    const novelty = noveltyGapMs <= 0 ? 0.6 : Math.min(1, 0.6 + noveltyGapMs / (1000 * 60 * 60 * 24));

    const rawPenalty = metadata.isRawLog ? 0.25 : 1;

    const sourceBoostMap: Record<string, number> = {
      system: 1,
      memory: 0.92,
      'topic-anchor': 0.96,
      library: 0.88,
      journal: 0.82,
      'recent-history': 0.8,
      'mid-history': 0.78,
      'deep-history': 0.75,
      custom: 0.8,
    };

    const sourceBoost = sourceBoostMap[metadata.source] ?? 0.8;

    const weighted = (freshness * 0.35 + substance * 0.4 + novelty * 0.25) * rawPenalty * sourceBoost;
    const finalScore = Math.max(0, Math.min(1, weighted));

    if (length < 40) {
      return Math.max(0.1, finalScore * 0.8);
    }

    return finalScore;
  }

  logDecision(result: OptimizationResult, sessionKey: string): void {
    if (!this.config.logDecisions) return;

    const compositor = new PromptCompositor({
      enabled: this.config.enabled,
      strategy: this.config.strategy,
      minScore: this.config.minScore,
      preserveReasons: this.config.preserveReasons,
      logDecisions: true,
      workspacePath: this.workspacePath,
      budget: {
        contextWindowTokens: this.resolveContextWindowTokens(),
        budgetRatio: this.config.budget?.budgetRatio,
        slots: this.config.budget?.slots,
        overflowMode: this.config.budget?.overflowMode,
      },
    });

    compositor.logDecision(result, sessionKey);
  }

  private resolveContextWindowTokens(): number {
    const configured = this.config.budget?.contextWindowTokens;
    if (configured && configured > 0) return Math.floor(configured);

    if (this.config.budgetBytes && this.config.budgetBytes > 0) {
      const ratio = this.config.budget?.budgetRatio ?? 0.15;
      return Math.max(16_000, Math.floor(this.config.budgetBytes / (4 * ratio)));
    }

    return 160_000;
  }
}

export type { ContextSlot, ContextSlotSource, SlotConfig } from './slot-provider.js';

export function resolveWorkspacePath(defaultHome = os.homedir()): string {
  return path.join(defaultHome, '.openclaw', 'workspace');
}
