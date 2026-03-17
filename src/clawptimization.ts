import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ContextSlot {
  id: string;
  source: 'journal' | 'memory' | 'discord-history' | 'library' | 'system';
  content: string;
  score: number;
  bytes: number;
  included: boolean;
  reason: string;
}

export interface OptimizationResult {
  slots: ContextSlot[];
  totalBytes: number;
  totalTokensEst: number;
  includedCount: number;
  droppedCount: number;
  budgetBytes: number;
  strategy: string;
}

export interface ClawptimizationConfig {
  enabled: boolean;
  budgetBytes: number;
  minScore: number;
  preserveReasons: boolean;
  strategy: 'scored-select' | 'passthrough' | 'budget-trim';
  logDecisions: boolean;
}

export const DEFAULT_CLAWPTIMIZATION_CONFIG: ClawptimizationConfig = {
  enabled: false,
  budgetBytes: 32000,
  minScore: 0.25,
  preserveReasons: true,
  strategy: 'passthrough',
  logDecisions: true,
};

export class Clawptimizer {
  private readonly workspacePath: string;
  private readonly config: ClawptimizationConfig;
  private readonly logFilePath: string;

  constructor(workspacePath: string, config: Partial<ClawptimizationConfig> = {}) {
    this.workspacePath = workspacePath;
    this.config = { ...DEFAULT_CLAWPTIMIZATION_CONFIG, ...config };
    this.logFilePath = path.join(
      this.workspacePath,
      'state',
      'clawtext',
      'prod',
      'optimization-log.jsonl',
    );
  }

  optimize(slots: ContextSlot[]): OptimizationResult {
    const cloned = slots.map((slot) => ({ ...slot, included: false }));

    if (!this.config.enabled || this.config.strategy === 'passthrough') {
      for (const slot of cloned) {
        slot.included = true;
        if (!slot.reason) {
          slot.reason = 'passthrough';
        }
      }
      const totalBytes = cloned.reduce((sum, slot) => sum + slot.bytes, 0);
      return {
        slots: cloned,
        totalBytes,
        totalTokensEst: Math.ceil(totalBytes / 4),
        includedCount: cloned.length,
        droppedCount: 0,
        budgetBytes: this.config.budgetBytes,
        strategy: this.config.strategy,
      };
    }

    const budget = Math.max(0, this.config.budgetBytes);
    const minScore = Math.max(0, Math.min(1, this.config.minScore));

    let ranking: ContextSlot[];
    if (this.config.strategy === 'budget-trim') {
      ranking = [...cloned];
    } else {
      ranking = [...cloned].sort((a, b) => b.score - a.score || a.bytes - b.bytes);
    }

    let bytesUsed = 0;
    for (const slot of ranking) {
      const eligible = slot.score >= minScore;
      const fits = bytesUsed + slot.bytes <= budget;

      if (eligible && fits) {
        slot.included = true;
        bytesUsed += slot.bytes;
        if (this.config.preserveReasons) {
          slot.reason = `${slot.reason} include:score>=${minScore.toFixed(2)} budget:${bytesUsed}/${budget}`.trim();
        } else {
          slot.reason = 'included';
        }
      } else {
        slot.included = false;
        const dropReason = !eligible
          ? `drop:minScore(${slot.score.toFixed(2)}<${minScore.toFixed(2)})`
          : `drop:budget(${bytesUsed + slot.bytes}>${budget})`;
        slot.reason = this.config.preserveReasons ? `${slot.reason} ${dropReason}`.trim() : 'dropped';
      }
    }

    const byOriginalOrder = cloned;
    const totalBytes = byOriginalOrder
      .filter((slot) => slot.included)
      .reduce((sum, slot) => sum + slot.bytes, 0);
    const includedCount = byOriginalOrder.filter((slot) => slot.included).length;
    const droppedCount = byOriginalOrder.length - includedCount;

    return {
      slots: byOriginalOrder,
      totalBytes,
      totalTokensEst: Math.ceil(totalBytes / 4),
      includedCount,
      droppedCount,
      budgetBytes: budget,
      strategy: this.config.strategy,
    };
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
      library: 0.88,
      journal: 0.82,
      'discord-history': 0.78,
    };

    const sourceBoost = sourceBoostMap[metadata.source] ?? 0.8;

    const weighted = (freshness * 0.35 + substance * 0.4 + novelty * 0.25) * rawPenalty * sourceBoost;
    const finalScore = Math.max(0, Math.min(1, weighted));

    // tiny floor for very short but potentially important snippets
    if (length < 40) {
      return Math.max(0.1, finalScore * 0.8);
    }

    return finalScore;
  }

  logDecision(result: OptimizationResult, sessionKey: string): void {
    if (!this.config.logDecisions) return;

    const originalBytes = result.slots.reduce((sum, slot) => sum + slot.bytes, 0);
    const dropped = result.slots.filter((slot) => !slot.included);
    const channel = this.deriveChannelFromSessionKey(sessionKey);

    const payload = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      sessionKey,
      channel,
      strategy: result.strategy,
      budgetBytes: result.budgetBytes,
      originalBytes,
      totalBytes: result.totalBytes,
      totalTokensEst: result.totalTokensEst,
      includedCount: result.includedCount,
      droppedCount: result.droppedCount,
      droppedReasons: dropped.map((slot) => slot.reason),
      slots: result.slots,
    };

    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.appendFileSync(this.logFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
  }

  private deriveChannelFromSessionKey(sessionKey: string): string {
    if (!sessionKey) return 'unknown';

    if (sessionKey.includes(':channel:')) {
      return sessionKey.split(':channel:').pop() || 'unknown';
    }
    if (sessionKey.includes(':topic:')) {
      return sessionKey.split(':topic:').pop() || 'unknown';
    }
    return 'unknown';
  }
}

export function resolveWorkspacePath(defaultHome = os.homedir()): string {
  return path.join(defaultHome, '.openclaw', 'workspace');
}
