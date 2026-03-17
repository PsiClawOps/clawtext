import fs from 'fs';
import path from 'path';
import {
  getClawTextProdStateRoot,
  getClawTextTopicAnchorsDir,
} from './runtime-paths.js';

export interface TopicAnchorData {
  topic: string;
  meta: Record<string, string>;
  currentStatus: string;
  keyDecisions: string[];
  history: string[];
}

export interface TopicAnchorSyncParams {
  topic: string;
  sessionKey: string;
  channelId?: string;
  channelName?: string;
  trigger: 'rolling' | 'interval' | 'reset';
  messagesSince: number;
  recentContent: string[];
  lastSender?: string;
}

const MAX_DECISIONS = 16;
const MAX_HISTORY = 20;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function compactLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniquePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseMetaLines(lines: string[]): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^-\s*\*\*(.+?)\*\*:\s*(.+)$/);
    if (match) meta[match[1]] = match[2].trim();
  }
  return meta;
}

function normalizeJsonStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniquePreserveOrder(value.map((entry) => String(entry ?? '').trim()).filter(Boolean));
  }
  if (typeof value === 'string') {
    return uniquePreserveOrder(
      compactLines(value).map((line) => line.replace(/^[-*]\s*/, '').trim()),
    );
  }
  return [];
}

function parseMarkdownAnchor(topic: string, markdown: string): TopicAnchorData {
  const sections: Record<'meta' | 'current' | 'decisions' | 'history', string[]> = {
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
    if (rawLine.trim().startsWith('# ')) continue;
    sections[mode].push(rawLine);
  }

  return {
    topic,
    meta: parseMetaLines(sections.meta),
    currentStatus: sections.current.join('\n').trim(),
    keyDecisions: uniquePreserveOrder(
      compactLines(sections.decisions.join('\n')).map((line) => line.replace(/^[-*]\s*/, '').trim()),
    ),
    history: uniquePreserveOrder(
      compactLines(sections.history.join('\n')).map((line) => line.replace(/^[-*]\s*/, '').trim()),
    ),
  };
}

function parseJsonAnchor(topic: string, parsed: Record<string, unknown>): TopicAnchorData {
  const rawMeta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta as Record<string, unknown> : {};
  const meta = Object.fromEntries(
    Object.entries(rawMeta)
      .map(([key, value]) => [key, String(value ?? '').trim()])
      .filter(([, value]) => Boolean(value)),
  );

  return {
    topic,
    meta,
    currentStatus: typeof parsed.currentStatus === 'string'
      ? parsed.currentStatus.trim()
      : typeof parsed.status === 'string'
        ? parsed.status.trim()
        : '',
    keyDecisions: normalizeJsonStringList(parsed.keyDecisions ?? parsed.decisions),
    history: normalizeJsonStringList(parsed.history),
  };
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

export function loadTopicAnchor(workspacePath: string, topic: string): TopicAnchorData | null {
  for (const filePath of candidatePaths(workspacePath, topic)) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) continue;
      const parsed = filePath.endsWith('.json')
        ? parseJsonAnchor(topic, JSON.parse(raw) as Record<string, unknown>)
        : parseMarkdownAnchor(topic, raw);
      if (!parsed.currentStatus && !parsed.keyDecisions.length && !parsed.history.length && !Object.keys(parsed.meta).length) {
        continue;
      }
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

export function serializeTopicAnchor(anchor: TopicAnchorData): string {
  const parts: string[] = [`# ${anchor.topic}`, ''];

  parts.push('## Meta');
  const metaEntries = Object.entries(anchor.meta);
  if (metaEntries.length === 0) {
    parts.push('(none yet)');
  } else {
    for (const [key, value] of metaEntries) {
      parts.push(`- **${key}**: ${value}`);
    }
  }
  parts.push('');

  parts.push('## Current Status');
  parts.push(anchor.currentStatus || '(no status yet)');
  parts.push('');

  parts.push('## Key Decisions');
  if (anchor.keyDecisions.length === 0) {
    parts.push('(none yet)');
  } else {
    for (const line of anchor.keyDecisions) parts.push(`- ${line}`);
  }
  parts.push('');

  parts.push('## History');
  if (anchor.history.length === 0) {
    parts.push('(none yet)');
  } else {
    for (const line of anchor.history) parts.push(`- ${line}`);
  }
  parts.push('');

  return parts.join('\n');
}

export function saveTopicAnchor(workspacePath: string, anchor: TopicAnchorData): string {
  const dir = getClawTextTopicAnchorsDir(workspacePath);
  ensureDir(dir);
  const filePath = path.join(dir, `${anchor.topic}.md`);
  fs.writeFileSync(filePath, `${serializeTopicAnchor(anchor)}\n`, 'utf8');
  return filePath;
}

function summarizeCurrentStatus(recentContent: string[], prior: string): string {
  const snippets = uniquePreserveOrder(recentContent.slice(-4));
  if (snippets.length === 0) return prior;
  return snippets.map((snippet) => `- ${snippet}`).join('\n');
}

function extractDecisionCandidates(recentContent: string[]): string[] {
  const decisionSignals = [
    /\bdecid(?:e|ed|ing)\b/i,
    /\bdecision\b/i,
    /\bchose\b/i,
    /\bchosen\b/i,
    /\bprefer(?:s|red)?\b/i,
    /\bswitch(?:ed)?\b/i,
    /\bdefer(?:red)?\b/i,
    /\badopt(?:ed)?\b/i,
    /\buse\b.+\bover\b/i,
  ];

  return uniquePreserveOrder(
    recentContent.filter((line) => decisionSignals.some((pattern) => pattern.test(line))),
  );
}

function buildHistoryLine(params: TopicAnchorSyncParams): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const lastSnippet = params.recentContent.filter(Boolean).slice(-1)[0] || '';
  const summary = lastSnippet ? ` — ${lastSnippet.slice(0, 90)}` : '';

  if (params.trigger === 'reset') {
    return `${stamp}: saved before reset (${params.messagesSince} msgs, last sender: ${params.lastSender || 'unknown'})${summary}`;
  }
  if (params.trigger === 'interval') {
    return `${stamp}: checkpoint saved (${params.messagesSince} msgs, last sender: ${params.lastSender || 'unknown'})${summary}`;
  }
  return `${stamp}: topic anchor initialized${summary}`;
}

export function syncTopicAnchor(workspacePath: string, params: TopicAnchorSyncParams): { filePath: string; anchor: TopicAnchorData } {
  const now = new Date().toISOString();
  const existing = loadTopicAnchor(workspacePath, params.topic);
  const anchor: TopicAnchorData = existing ?? {
    topic: params.topic,
    meta: {},
    currentStatus: '',
    keyDecisions: [],
    history: [],
  };

  if (!anchor.meta.created) anchor.meta.created = now;
  anchor.meta.updated = now;
  anchor.meta.session = params.sessionKey;
  if (params.channelId && params.channelId !== 'unknown') anchor.meta.channel = params.channelId;
  if (params.channelName) anchor.meta.channelName = params.channelName;
  if (params.lastSender) anchor.meta.lastSender = params.lastSender;
  anchor.meta.lastTrigger = params.trigger;

  const nextStatus = summarizeCurrentStatus(params.recentContent, anchor.currentStatus);
  if (nextStatus) anchor.currentStatus = nextStatus;

  anchor.keyDecisions = uniquePreserveOrder([
    ...anchor.keyDecisions,
    ...extractDecisionCandidates(params.recentContent),
  ]).slice(-MAX_DECISIONS);

  if (params.trigger !== 'rolling') {
    const nextHistory = buildHistoryLine(params);
    anchor.history = uniquePreserveOrder([...anchor.history, nextHistory]).slice(-MAX_HISTORY);
  } else if (anchor.history.length === 0 && params.recentContent.length > 0) {
    anchor.history = [buildHistoryLine(params)];
  }

  return {
    filePath: saveTopicAnchor(workspacePath, anchor),
    anchor,
  };
}

export function formatTopicAnchorForSlot(anchor: TopicAnchorData, options?: { maxStatusLines?: number; maxDecisionLines?: number; maxHistoryLines?: number }): string {
  const maxStatusLines = options?.maxStatusLines ?? 14;
  const maxDecisionLines = options?.maxDecisionLines ?? 16;
  const maxHistoryLines = options?.maxHistoryLines ?? 12;

  const truncateLines = (content: string, maxLines: number): string => {
    const lines = content.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    if (lines.length <= maxLines) return lines.join('\n');
    return `${lines.slice(0, maxLines).join('\n')}\n…(${lines.length - maxLines} more lines)`;
  };

  return [
    `<!-- TOPIC_ANCHOR: ${anchor.topic} -->`,
    `## Topic Anchor: ${anchor.topic}`,
    Object.keys(anchor.meta).length
      ? `### Meta\n${Object.entries(anchor.meta).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}`
      : '',
    anchor.currentStatus ? `### Current Status\n${truncateLines(anchor.currentStatus, maxStatusLines)}` : '',
    anchor.keyDecisions.length ? `### Key Decisions\n${truncateLines(anchor.keyDecisions.map((line) => `- ${line}`).join('\n'), maxDecisionLines)}` : '',
    anchor.history.length ? `### History\n${truncateLines(anchor.history.map((line) => `- ${line}`).join('\n'), maxHistoryLines)}` : '',
    '<!-- END TOPIC_ANCHOR -->',
  ].filter(Boolean).join('\n\n');
}
