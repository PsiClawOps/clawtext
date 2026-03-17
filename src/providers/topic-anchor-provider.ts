import fs from 'fs';
import path from 'path';
import type { ContextSlot, SlotContext, SlotProvider } from '../slot-provider.js';
import { resolveTopicForSession } from '../session-topic-map.js';
import {
  getClawTextProdStateRoot,
  getClawTextTopicAnchorsDir,
} from '../runtime-paths.js';

interface TopicAnchorSectionSet {
  meta: string;
  currentStatus: string;
  keyDecisions: string;
  history: string;
}

interface TopicAnchorRecord extends TopicAnchorSectionSet {
  topic: string;
}

function truncateLines(content: string, maxLines: number): string {
  const lines = content.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length <= maxLines) return lines.join('\n');
  return `${lines.slice(0, maxLines).join('\n')}\n…(${lines.length - maxLines} more lines)`;
}

function parseMarkdownSections(markdown: string): TopicAnchorSectionSet {
  const sections: Record<string, string[]> = {
    meta: [],
    current: [],
    decisions: [],
    history: [],
  };

  let mode: keyof typeof sections = 'meta';
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.trim().toLowerCase().replace(/^#+\s*/, '');
    if (heading === 'meta') {
      mode = 'meta';
      continue;
    }
    if (heading === 'current status') {
      mode = 'current';
      continue;
    }
    if (heading === 'key decisions') {
      mode = 'decisions';
      continue;
    }
    if (heading === 'history') {
      mode = 'history';
      continue;
    }
    sections[mode].push(rawLine);
  }

  return {
    meta: sections.meta.join('\n').trim(),
    currentStatus: sections.current.join('\n').trim(),
    keyDecisions: sections.decisions.join('\n').trim(),
    history: sections.history.join('\n').trim(),
  };
}

function fromJsonRecord(topic: string, record: Record<string, unknown>): TopicAnchorRecord {
  const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  return {
    topic,
    meta: asText(record.meta),
    currentStatus: asText(record.currentStatus ?? record.status),
    keyDecisions: asText(record.keyDecisions ?? record.decisions),
    history: asText(record.history),
  };
}

function fromMarkdown(topic: string, markdown: string): TopicAnchorRecord {
  const parsed = parseMarkdownSections(markdown);
  return {
    topic,
    ...parsed,
  };
}

function formatTopicAnchor(record: TopicAnchorRecord): string {
  return [
    `<!-- TOPIC_ANCHOR: ${record.topic} -->`,
    `## Topic Anchor: ${record.topic}`,
    record.meta ? `### Meta\n${record.meta}` : '',
    record.currentStatus ? `### Current Status\n${truncateLines(record.currentStatus, 14)}` : '',
    record.keyDecisions ? `### Key Decisions\n${truncateLines(record.keyDecisions, 16)}` : '',
    record.history ? `### History\n${truncateLines(record.history, 12)}` : '',
    '<!-- END TOPIC_ANCHOR -->',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function candidatePaths(workspacePath: string, topic: string): string[] {
  const stateRoot = getClawTextProdStateRoot(workspacePath);
  const topicDir = getClawTextTopicAnchorsDir(workspacePath);

  return [
    path.join(topicDir, `${topic}.json`),
    path.join(topicDir, `${topic}.md`),
    path.join(stateRoot, 'topic-anchor', `${topic}.json`),
    path.join(stateRoot, 'topic-anchor', `${topic}.md`),
    path.join(workspacePath, 'memory', `context-${topic}.md`),
  ];
}

function readTopicAnchor(workspacePath: string, topic: string): TopicAnchorRecord | null {
  const paths = candidatePaths(workspacePath, topic);

  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) continue;

      if (filePath.endsWith('.json')) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const record = fromJsonRecord(topic, parsed);
        if (!record.currentStatus && !record.keyDecisions && !record.history && !record.meta) continue;
        return record;
      }

      const record = fromMarkdown(topic, raw);
      if (!record.currentStatus && !record.keyDecisions && !record.history && !record.meta) continue;
      return record;
    } catch {
      continue;
    }
  }

  return null;
}

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
    return Boolean(readTopicAnchor(this.workspacePath, topic));
  }

  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[] {
    if (budgetBytes <= 0) return [];

    const topic = resolveTopicForSession(this.workspacePath, {
      sessionKey: ctx.sessionKey,
      channelId: ctx.channelId,
    });
    if (!topic) return [];

    const record = readTopicAnchor(this.workspacePath, topic);
    if (!record) return [];

    const content = formatTopicAnchor(record);
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
