import path from 'path';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import { resolveTopicForSession } from '../session-topic-map.js';
import { formatTopicAnchorForSlot, loadTopicAnchor } from '../topic-anchor.js';
export class TopicAnchorProvider implements SlotProvider {
  readonly id = 'topic-anchor';
  readonly source = 'topic-anchor' as const;
  readonly priority = 15;
  readonly prunable = true;

  private readonly workspacePath: string;

  constructor(options?: { workspacePath?: string }) {
    this.workspacePath = options?.workspacePath ?? path.join(process.env.HOME || '', '.openclaw', 'workspace');
  }

  available(ctx: SlotContext): boolean {
    const topic = resolveTopicForSession(this.workspacePath, {
      sessionKey: ctx.sessionKey,
      channelId: ctx.channelId,
    });
    if (!topic) return false;
    return Boolean(loadTopicAnchor(this.workspacePath, topic));
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const topic = resolveTopicForSession(this.workspacePath, {
      sessionKey: ctx.sessionKey,
      channelId: ctx.channelId,
    });
    if (!topic) return [];

    const record = loadTopicAnchor(this.workspacePath, topic);
    if (!record) return [];

    const content = formatTopicAnchorForSlot(record);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > budgetBytes) return [];

    return [
      {
        id: `${this.id}:${topic}`,
        source: this.source,
        content,
        score: 0.95,
        bytes,
        included: true,
        reason: `bound-topic:${topic}`,
      },
    ];
  }

  prune(slots: ContextSlot[], _targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (aggressiveness >= 0.75) return [];
    return slots;
  }
}
