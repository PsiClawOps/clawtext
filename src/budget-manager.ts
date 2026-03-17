import type { ContextSlotSource, SlotConfig } from './slot-provider.js';

export type OverflowMode = 'redistribute' | 'none';

export interface BudgetManagerConfig {
  budgetRatio?: number;
  contextWindowTokens: number;
  slots?: Partial<Record<ContextSlotSource, SlotConfig>>;
  overflowMode?: OverflowMode;
}

export interface SlotBudgetAllocation {
  source: ContextSlotSource;
  budgetBytes: number;
  ratio: number;
  minBytes: number;
  policy: string;
  enabled: boolean;
}

export interface RedistributionResult {
  allocations: Record<ContextSlotSource, SlotBudgetAllocation>;
  redistributed: Record<ContextSlotSource, number>;
  overflowPoolBytes: number;
}

const EMPTY_SLOT_CONFIG: SlotConfig = {
  ratio: 0,
  policy: 'disabled',
  enabled: false,
};

export const DEFAULT_SLOT_CONFIGS: Record<ContextSlotSource, SlotConfig> = {
  system: { ratio: 0.05, policy: 'always-include', enabled: true },
  memory: { ratio: 0.2, policy: 'scored-select', enabled: true },
  library: { ratio: 0.15, policy: 'on-demand', enabled: true },
  clawbridge: { ratio: 0.08, policy: 'if-present', enabled: true },
  'topic-anchor': { ratio: 0.1, policy: 'if-bound', enabled: true },
  'recent-history': { ratio: 0.12, policy: 'always-include', enabled: true },
  'mid-history': { ratio: 0.15, policy: 'scored-select', enabled: true },
  'deep-history': { ratio: 0.08, policy: 'decision-only', enabled: true },
  'decision-tree': { ratio: 0.08, policy: 'pattern-match', enabled: true },
  journal: { ratio: 0.09, policy: 'cold-start-only', enabled: true },
  'cross-session': { ...EMPTY_SLOT_CONFIG },
  'situational-awareness': { ...EMPTY_SLOT_CONFIG },
  custom: { ...EMPTY_SLOT_CONFIG },
};

const OVERFLOW_PRIORITY: ContextSlotSource[] = [
  'mid-history',
  'memory',
  'library',
  'deep-history',
];

export class BudgetManager {
  private readonly config: Required<Omit<BudgetManagerConfig, 'slots'>> & {
    slots: Record<ContextSlotSource, SlotConfig>;
  };

  constructor(config: BudgetManagerConfig) {
    this.config = {
      budgetRatio: config.budgetRatio ?? 0.15,
      contextWindowTokens: Math.max(1, Math.floor(config.contextWindowTokens)),
      overflowMode: config.overflowMode ?? 'redistribute',
      slots: {
        ...DEFAULT_SLOT_CONFIGS,
        ...(config.slots ?? {}),
      },
    };
  }

  totalBudgetBytes(): number {
    const ratio = Math.max(0, this.config.budgetRatio);
    return Math.floor(this.config.contextWindowTokens * ratio * 4);
  }

  allocate(): Record<ContextSlotSource, SlotBudgetAllocation> {
    const totalBytes = this.totalBudgetBytes();
    const allocations = {} as Record<ContextSlotSource, SlotBudgetAllocation>;

    (Object.keys(this.config.slots) as ContextSlotSource[]).forEach((source) => {
      const cfg = this.config.slots[source];
      const ratio = Math.max(0, cfg.ratio);
      const minBytes = Math.max(0, cfg.minBytes ?? 0);
      const allocated = cfg.enabled ? Math.max(minBytes, Math.floor(totalBytes * ratio)) : 0;

      allocations[source] = {
        source,
        budgetBytes: allocated,
        ratio,
        minBytes,
        policy: cfg.policy,
        enabled: cfg.enabled,
      };
    });

    return allocations;
  }

  redistribute(
    allocations: Record<ContextSlotSource, SlotBudgetAllocation>,
    usageBySource: Partial<Record<ContextSlotSource, number>>,
  ): RedistributionResult {
    const redistributed = {} as Record<ContextSlotSource, number>;
    (Object.keys(allocations) as ContextSlotSource[]).forEach((source) => {
      redistributed[source] = 0;
    });

    if (this.config.overflowMode !== 'redistribute') {
      return { allocations, redistributed, overflowPoolBytes: 0 };
    }

    let overflowPoolBytes = 0;
    (Object.keys(allocations) as ContextSlotSource[]).forEach((source) => {
      const allocated = allocations[source].budgetBytes;
      const used = Math.max(0, usageBySource[source] ?? 0);
      if (allocated > used) {
        overflowPoolBytes += allocated - used;
      }
    });

    if (overflowPoolBytes <= 0) {
      return { allocations, redistributed, overflowPoolBytes: 0 };
    }

    let remaining = overflowPoolBytes;
    for (const source of OVERFLOW_PRIORITY) {
      if (remaining <= 0) break;
      const target = allocations[source];
      if (!target || !target.enabled) continue;

      redistributed[source] += remaining;
      target.budgetBytes += remaining;
      remaining = 0;
    }

    return {
      allocations,
      redistributed,
      overflowPoolBytes,
    };
  }
}
