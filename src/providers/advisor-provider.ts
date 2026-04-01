import path from 'path';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import { getAdvisorByDomain, listCouncilPerspectives } from '../slots/advisor.js';
import { resolveSessionRow } from '../slots/sessionMatrix.js';

function uniqueDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function inferRelevantDomains(ctx: SlotContext): string[] {
  const fromTopics = Array.isArray(ctx.recentTopics) ? ctx.recentTopics : [];
  const normalized = fromTopics.flatMap((topic) =>
    String(topic ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  const common = ['security', 'infrastructure', 'infra', 'ui', 'scene', 'rendering', 'docs', 'memory'];
  const matches = common.filter((candidate) => normalized.includes(candidate));
  return uniqueDomains(matches.map((value) => (value === 'infra' ? 'infrastructure' : value)));
}

function formatAdvisorBlock(lines: string[]): string {
  return ['## Advisor Context', ...lines].join('\n');
}

export class AdvisorProvider implements SlotProvider {
  readonly id = 'advisor';
  readonly source = 'advisor' as const;
  readonly priority = 28;
  readonly prunable = true;

  private readonly workspacePath: string;

  constructor(options?: { workspacePath?: string }) {
    this.workspacePath = options?.workspacePath ?? path.join(process.env.HOME || '', '.openclaw', 'workspace');
  }

  available(ctx: SlotContext): boolean {
    const owner = resolveSessionRow(this.workspacePath, {
      sessionKey: ctx.sessionKey,
      channelId: ctx.channelId,
      threadRef: `discord:thread:${ctx.channelId}`,
      channelRef: `discord:channel:${ctx.channelId}`,
    });
    if (owner?.ownerAdvisorId) return true;
    return listCouncilPerspectives(this.workspacePath).length > 0;
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const session = resolveSessionRow(this.workspacePath, {
      sessionKey: ctx.sessionKey,
      channelId: ctx.channelId,
      threadRef: `discord:thread:${ctx.channelId}`,
      channelRef: `discord:channel:${ctx.channelId}`,
    });
    const lines: string[] = [];

    if (session?.ownerAdvisorId) {
      lines.push(`- Active advisor owner: ${session.ownerAdvisorId}`);
      if (session.domain) lines.push(`- Session domain: ${session.domain}`);
      lines.push(`- Session project: ${session.project}`);
    }

    const domains = uniqueDomains([
      ...(session?.domain ? [session.domain] : []),
      ...inferRelevantDomains(ctx),
    ]);

    for (const domain of domains.slice(0, 2)) {
      const { advisor, rule } = getAdvisorByDomain(this.workspacePath, domain);
      if (!advisor) continue;
      lines.push(
        `- Domain route [${domain}]: ${advisor.id}${rule ? ` (${rule.strategy}, current=${rule.currentAdvisorId})` : ''}`,
      );
    }

    const perspectives = listCouncilPerspectives(this.workspacePath)
      .filter((entry) => entry.status === 'active')
      .slice(0, 4);

    // TUNE-006: only add perspectives list when there's a routing signal.
    // A bare seat list ("Council perspectives: Compass, Vanguard, ...") with no
    // ownerAdvisorId and no domain route match adds zero information — suppress it.
    const hasDomainSignal = !!session?.ownerAdvisorId || lines.some(l => l.startsWith('- Domain route'));
    if (perspectives.length > 0 && hasDomainSignal) {
      lines.push(`- Council perspectives: ${perspectives.map((entry) => entry.label).join(', ')}`);
    }

    if (lines.length === 0) return [];

    const content = formatAdvisorBlock(lines);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > budgetBytes) return [];

    return [
      {
        id: `${this.id}:context`,
        source: this.source,
        content,
        score: session?.ownerAdvisorId ? 0.94 : 0.82,
        bytes,
        included: true,
        reason: session?.ownerAdvisorId ? 'session-owner-advisor' : 'available-council-perspectives',
      },
    ];
  }

  prune(slots: ContextSlot[], _targetFreeBytes: number, aggressiveness: number): ContextSlot[] {
    if (aggressiveness >= 0.8) return [];
    return slots;
  }
}
