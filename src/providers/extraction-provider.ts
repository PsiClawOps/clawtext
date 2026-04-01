import path from 'path';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import {
  loadExtractionState,
  getStrategyForTopic,
  isExtractionEnabled,
  getExtractionConfig,
  getRetentionConfig,
} from '../extraction/index.js';

function formatExtractionBlock(lines: string[]): string {
  return ['## Extraction Context', ...lines].join('\n');
}

export class ExtractionProvider implements SlotProvider {
  readonly id = 'extraction';
  readonly source = 'extraction' as const;
  readonly priority = 22;
  readonly prunable = true;

  private readonly workspacePath: string;

  constructor(options?: { workspacePath?: string }) {
    this.workspacePath = options?.workspacePath ?? path.join(process.env.HOME || '', '.openclaw', 'workspace');
  }

  available(ctx: SlotContext): boolean {
    // Extract topic from channel or session
    const topic = this.inferTopic(ctx);
    if (!topic) return false;

    const state = loadExtractionState(this.workspacePath);
    if (!state.strategies || Object.keys(state.strategies).length === 0) return false;

    // TUNE-005: suppress slot when resolved strategy has no useful signal
    // Only emit when extraction is actively running (mode='full').
    // Lightweight/recall/disabled modes produce no actionable extraction context.
    const strategy = getStrategyForTopic(this.workspacePath, topic);
    if (!strategy) return false;
    return strategy.mode === 'full';
  }

  private inferTopic(ctx: SlotContext): string | null {
    // Try channel ID first
    if (ctx.channelId) {
      return ctx.channelId;
    }
    // Try session key
    if (ctx.sessionKey) {
      const parts = ctx.sessionKey.split(':');
      if (parts.length > 0) return parts[parts.length - 1];
    }
    return null;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const topic = this.inferTopic(ctx);
    if (!topic) return [];

    const strategy = getStrategyForTopic(this.workspacePath, topic);
    if (!strategy) return [];

    const lines: string[] = [
      `- Topic: ${topic}`,
      `- Strategy: ${strategy.displayName}`,
      `- Mode: ${strategy.mode}`,
    ];

    if (strategy.extraction) {
      const ext = strategy.extraction;
      lines.push(`- Extraction depth: ${ext.depth}`);
      lines.push(`- Entity types: ${ext.entityTypes.join(', ')}`);
      lines.push(`- Sentiment: ${ext.sentiment ? 'yes' : 'no'}`);
      lines.push(`- Decisions: ${ext.decisions ? 'yes' : 'no'}`);
      lines.push(`- Tasks: ${ext.tasks ? 'yes' : 'no'}`);
    }

    if (strategy.retention) {
      const ret = strategy.retention;
      lines.push(`- Retention: every ${ret.everyNTurns} turns`);
      if (ret.tags.length > 0) {
        lines.push(`- Tags: ${ret.tags.join(', ')}`);
      }
    }

    if (strategy.mode === 'disabled') {
      lines.push('- Memory disabled for this topic');
    } else if (strategy.mode === 'recall') {
      lines.push('- Recall-only mode (no storage)');
    }

    const content = formatExtractionBlock(lines);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > budgetBytes) return [];

    return [
      {
        id: `extraction:${topic}`,
        source: this.source,
        content,
        score: 0.85,
        bytes,
        included: true,
        reason: `extraction-strategy:${strategy.strategyId}`,
      },
    ];
  }

  prune(slots: ContextSlot[], _targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (aggressiveness >= 0.8) return [];
    return slots;
  }
}
