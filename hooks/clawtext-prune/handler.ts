import fs from 'fs';
import os from 'os';
import path from 'path';
import { ActivePruner, type PruningConfig } from '../../src/active-pruning.ts';
import { ContextPressureMonitor } from '../../src/context-pressure.ts';
import type { ContextSlot, ContextSlotSource } from '../../src/slot-provider.ts';
import { stripInjectedContext } from '../../src/injected-context.ts';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const OPT_LOG_FILE = path.join(STATE_DIR, 'optimization-log.jsonl');
const PRUNE_CONFIG_FILE = path.join(STATE_DIR, 'active-pruning-config.json');
const PRESSURE_STATE_FILE = path.join(STATE_DIR, 'context-pressure.json');

const DEFAULT_CONFIG: PruningConfig = {
  enabled: true,
  preserveLastNTurns: 5,
  compactionAvoidanceThresholdTokens: 1800,
};

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPruningConfig(): PruningConfig {
  try {
    if (!fs.existsSync(PRUNE_CONFIG_FILE)) {
      ensureDir(PRUNE_CONFIG_FILE);
      fs.writeFileSync(PRUNE_CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      return { ...DEFAULT_CONFIG };
    }

    const raw = JSON.parse(fs.readFileSync(PRUNE_CONFIG_FILE, 'utf8')) as Partial<PruningConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      preserveLastNTurns: Math.max(5, Math.floor(raw.preserveLastNTurns ?? DEFAULT_CONFIG.preserveLastNTurns)),
      compactionAvoidanceThresholdTokens: Math.max(
        1,
        Math.floor(raw.compactionAvoidanceThresholdTokens ?? DEFAULT_CONFIG.compactionAvoidanceThresholdTokens),
      ),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function inferSource(label: string): ContextSlotSource {
  const text = label.toLowerCase();
  if (text.includes('memory')) return 'memory';
  if (text.includes('library')) return 'library';
  if (text.includes('clawbridge') || text.includes('handoff')) return 'clawbridge';
  if (text.includes('topic anchor') || text.includes('topic_anchor')) return 'topic-anchor';
  if (text.includes('journal')) return 'journal';
  if (text.includes('decision')) return 'decision-tree';
  if (text.includes('deep')) return 'deep-history';
  if (text.includes('mid')) return 'mid-history';
  if (text.includes('recent') || text.includes('history')) return 'recent-history';
  return 'custom';
}

function contentFromUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return stripInjectedContext(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const raw =
      (typeof record.content === 'string' ? record.content : '') ||
      (typeof record.text === 'string' ? record.text : '') ||
      (typeof record.body === 'string' ? record.body : '') ||
      (typeof record.message === 'string' ? record.message : '') ||
      '';
    return stripInjectedContext(raw);
  }

  return '';
}

function toSlots(event: { prompt?: unknown; messages?: unknown[]; context?: Record<string, unknown> }): ContextSlot[] {
  const ctx = event.context ?? {};
  const candidates = Array.isArray((ctx as { slots?: unknown[] }).slots)
    ? ((ctx as { slots?: unknown[] }).slots ?? [])
    : [];

  if (candidates.length > 0) {
    return candidates
      .map((entry, idx) => {
        if (!entry || typeof entry !== 'object') return null;
        const slot = entry as Record<string, unknown>;
        const content = contentFromUnknown(slot);
        if (!content.trim()) return null;
        const source = typeof slot.source === 'string' ? (slot.source as ContextSlotSource) : inferSource(String(slot.id ?? ''));
        const id = typeof slot.id === 'string' ? slot.id : `slot-${idx + 1}`;
        const bytes = Buffer.byteLength(content, 'utf8');

        return {
          id,
          source,
          content,
          score: typeof slot.score === 'number' ? slot.score : 0.5,
          bytes,
          included: true,
          reason: 'before-compaction-snapshot',
        } as ContextSlot;
      })
      .filter((slot): slot is ContextSlot => Boolean(slot));
  }

  const messages = Array.isArray(event.messages) ? event.messages : [];
  if (messages.length > 0) {
    return messages
      .map((message, idx) => {
        const content = contentFromUnknown(message).trim();
        if (!content) return null;
        return {
          id: `msg-${idx + 1}`,
          source: idx >= messages.length - 6 ? 'recent-history' : idx >= messages.length - 20 ? 'mid-history' : 'deep-history',
          content,
          score: 0.5,
          bytes: Buffer.byteLength(content, 'utf8'),
          included: true,
          reason: 'message-derived-slot',
        } as ContextSlot;
      })
      .filter((slot): slot is ContextSlot => Boolean(slot));
  }

  const prompt = typeof event.prompt === 'string' ? stripInjectedContext(event.prompt) : '';
  if (!prompt.trim()) return [];

  const sections = prompt.split(/\n##\s+/).map((part) => part.trim()).filter(Boolean);
  return sections.map((section, idx) => {
    const [title, ...rest] = section.split('\n');
    const content = rest.join('\n').trim() || section;
    const label = title?.trim() || `prompt-${idx + 1}`;
    return {
      id: label,
      source: inferSource(label),
      content,
      score: 0.5,
      bytes: Buffer.byteLength(content, 'utf8'),
      included: true,
      reason: 'prompt-section-slot',
    } as ContextSlot;
  });
}

function extractTopics(slots: ContextSlot[]): string[] {
  const topics: string[] = [];

  for (const slot of slots) {
    const normalized = slot.content.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
    const compact = sentence.slice(0, 140);
    if (compact.length < 12) continue;
    topics.push(compact);
  }

  return [...new Set(topics)].slice(0, 30);
}

const handler = async (event: {
  type?: string;
  action?: string;
  sessionKey?: string;
  prompt?: unknown;
  messages?: unknown[];
  context?: Record<string, unknown>;
}) => {
  if (event.action && event.action !== 'before_compaction') return;

  try {
    const ctx = event.context ?? {};
    const config = loadPruningConfig();
    const slots = toSlots(event);
    const totalBytes = slots.reduce((sum, slot) => sum + slot.bytes, 0);
    const usedTokens = Math.ceil(totalBytes / 4);

    const contextWindowTokens = Number((ctx as { modelContextWindowTokens?: number }).modelContextWindowTokens) || 160_000;
    const pressureMonitor = new ContextPressureMonitor(PRESSURE_STATE_FILE);
    const assessedPressure = pressureMonitor.assess(contextWindowTokens, usedTokens);

    const emergencyPressure = {
      ...assessedPressure,
      aggressiveness: Math.max(0.9, assessedPressure.aggressiveness),
    };

    const pruner = new ActivePruner(config);
    const result = pruner.prune(slots, emergencyPressure);

    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const channel =
      (ctx.channelId as string) ||
      (ctx.conversationId as string) ||
      (ctx.groupId as string) ||
      'unknown';

    const checkpoint = {
      type: 'pre_compaction_checkpoint',
      ts: nowMs,
      iso: new Date(nowMs).toISOString(),
      sessionKey: event.sessionKey || null,
      channel,
      trigger: 'before_compaction',
      pressure: emergencyPressure,
      context: {
        slotCount: slots.length,
        totalBytes,
        totalTokensEst: usedTokens,
        sources: [...new Set(slots.map((slot) => slot.source))],
        topics: extractTopics(slots),
      },
      pruning: {
        aggressiveness: result.aggressiveness,
        freedBytes: result.freedBytes,
        freedTokensEst: result.freedTokensEst,
        shouldCancelCompaction: result.shouldCancelCompaction,
        decisions: result.decisions,
      },
    };

    ensureDir(path.join(JOURNAL_DIR, `${today}.jsonl`));
    fs.appendFileSync(path.join(JOURNAL_DIR, `${today}.jsonl`), `${JSON.stringify(checkpoint)}\n`, 'utf8');

    const logEntry = {
      ts: nowMs,
      iso: new Date(nowMs).toISOString(),
      type: 'active-prune',
      hook: 'clawtext-prune',
      phase: 'before_compaction',
      sessionKey: event.sessionKey || null,
      channel,
      pressure: emergencyPressure,
      slotCount: slots.length,
      totalBytes,
      totalTokensEst: usedTokens,
      pruning: result,
      note: result.shouldCancelCompaction
        ? 'Compaction may be avoidable; cancellation requires OpenClaw core support.'
        : 'Pruning did not meet compaction avoidance threshold.',
    };

    ensureDir(OPT_LOG_FILE);
    fs.appendFileSync(OPT_LOG_FILE, `${JSON.stringify(logEntry)}\n`, 'utf8');

    if (process.env.DEBUG_CLAWTEXT) {
      console.log(
        `[clawtext-prune] freed=${result.freedTokensEst} tokens, cancelCandidate=${result.shouldCancelCompaction}`,
      );
    }
  } catch (err) {
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-prune] hook error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
