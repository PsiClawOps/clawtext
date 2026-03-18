import fs from 'fs';
import path from 'path';
import os from 'os';
import { bindSessionToTopic, sanitizeTopicName } from '../../src/session-topic-map.ts';
import { syncTopicAnchor } from '../../src/topic-anchor.ts';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'checkpoint');
const STATE_FILE = path.join(STATE_DIR, 'checkpoint-state.json');
const DIAG_FILE = path.join(STATE_DIR, 'checkpoint-diagnostic.jsonl');

// Write a checkpoint every N messages
const CHECKPOINT_INTERVAL = 25;

// ── State helpers ─────────────────────────────────────────────────────────────
function readState(): { messageCount: number; lastCheckpointTs: number; lastSender: string; recentContent: string[] } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* fallthrough */ }
  return { messageCount: 0, lastCheckpointTs: 0, lastSender: 'unknown', recentContent: [] };
}

function writeState(state: { messageCount: number; lastCheckpointTs: number; lastSender: string; recentContent: string[] }) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logDiagnostic(entry: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFile(
      DIAG_FILE,
      JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), ...entry }) + '\n',
      () => {},
    );
  } catch {
    // fire-and-forget
  }
}

// ── Extract lightweight topic signals from content ────────────────────────────
function extractTopicSignals(content: string): string {
  // Take first 120 chars of non-empty, non-noise content
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 10) return '';
  // Skip raw logs / JSON blobs
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return '';
  return trimmed.slice(0, 120);
}

function inferTopicName(params: {
  channelName?: string;
  channel: string;
  sessionKey: string;
  recentContent: string[];
}): string {
  const fromChannelName = String(params.channelName ?? '').trim();
  if (fromChannelName && fromChannelName.toLowerCase() !== 'unknown') {
    return sanitizeTopicName(fromChannelName);
  }

  const fromBreadcrumb = params.recentContent.find((entry) => entry.length >= 16);
  if (fromBreadcrumb) {
    return sanitizeTopicName(fromBreadcrumb.slice(0, 80));
  }

  if (params.channel && params.channel !== 'unknown') {
    return sanitizeTopicName(params.channel);
  }

  return sanitizeTopicName(params.sessionKey || 'general');
}

function getFilterReason(ctx: Record<string, unknown>, content = ''): string | null {
  const trigger = String(ctx.trigger || '').toLowerCase();
  if (trigger.includes('heartbeat')) return 'trigger-heartbeat';
  if (/(^|[\s:_./-])cron($|[\s:_./-])/.test(trigger)) return 'trigger-cron';
  if (/memory[\s:_-]*internal/.test(trigger)) return 'trigger-memory-internal';

  const identities = [ctx.sessionKey, ctx.sessionId, ctx.agentId, ctx.conversationId, ctx.channelId]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);

  for (const identity of identities) {
    if (identity.includes('heartbeat')) return 'identity-heartbeat';
    if (/(^|[\s:_./-])cron($|[\s:_./-])/.test(identity)) return 'identity-cron';
    if (/memory[\s:_-]*internal/.test(identity)) return 'identity-memory-internal';
  }

  const normalized = content.trim().toLowerCase();
  if (normalized.startsWith('read heartbeat.md if it exists')) return 'heartbeat-poll-prompt';

  return null;
}

function isFilteredSession(ctx: Record<string, unknown>, content = ''): boolean {
  return getFilterReason(ctx, content) !== null;
}

// ── Write checkpoint record to journal ───────────────────────────────────────
function writeCheckpoint(params: {
  sessionKey: string;
  channel: string;
  channelName?: string;
  trigger: 'reset' | 'interval';
  messagesSince: number;
  recentContent: string[];
  lastSender: string;
}) {
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);

  if (!fs.existsSync(JOURNAL_DIR)) fs.mkdirSync(JOURNAL_DIR, { recursive: true });

  const record = {
    type: 'checkpoint',
    ts: nowMs,
    iso: new Date(nowMs).toISOString(),
    sessionKey: params.sessionKey,
    channel: params.channel,
    channelName: params.channelName || null,
    trigger: params.trigger,
    messagesSinceLastCheckpoint: params.messagesSince,
    // Store up to 5 recent content snippets as topic breadcrumbs
    recentTopics: params.recentContent.filter(Boolean).slice(-5),
    lastSender: params.lastSender,
    lastMessageTs: nowMs,
  };

  const journalFile = path.join(JOURNAL_DIR, `${today}.jsonl`);
  fs.appendFile(journalFile, JSON.stringify(record) + '\n', (err) => {
    if (err && process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-checkpoint] write error:', err.message);
    }
  });
}

// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event: { type: string; action: string; sessionKey: string; context: Record<string, unknown> }) => {
  try {
    const ctx = event.context || {};
    const sessionKey = event.sessionKey || '';
    const channel = (ctx.channelId as string) || (ctx.conversationId as string) || 'unknown';
    const channelName = (ctx.channelName as string) || (ctx.groupSubject as string) || undefined;

    logDiagnostic({
      type: 'hook-invoked',
      eventType: event.type,
      action: event.action,
      sessionKey,
      channel,
      channelName: channelName || null,
      trigger: String(ctx.trigger || ''),
      ctxKeys: Object.keys(ctx).sort(),
      hasBodyForAgent: typeof ctx.bodyForAgent === 'string' && ctx.bodyForAgent.length > 0,
      hasBody: typeof ctx.body === 'string' && ctx.body.length > 0,
      hasContent: typeof ctx.content === 'string' && ctx.content.length > 0,
    });

    const initialFilterReason = getFilterReason({ ...ctx, sessionKey });
    if (initialFilterReason) {
      logDiagnostic({
        type: 'skip-filtered',
        phase: 'initial',
        reason: initialFilterReason,
        eventType: event.type,
        action: event.action,
        sessionKey,
        channel,
      });
      return;
    }

    // ── RESET / NEW: immediate checkpoint ──
    if (event.type === 'agent' && (event.action === 'reset' || event.action === 'new')) {
      const state = readState();
      const topic = inferTopicName({ channelName, channel, sessionKey, recentContent: state.recentContent });
      bindSessionToTopic(
        WORKSPACE,
        sessionKey,
        topic,
        { channelId: channel },
      );
      logDiagnostic({
        type: 'bound-topic',
        phase: 'reset',
        sessionKey,
        channel,
        topic,
        recentCount: state.recentContent.length,
        messageCount: state.messageCount,
      });

      if (state.messageCount > 0 || state.recentContent.length > 0) {
        const result = syncTopicAnchor(WORKSPACE, {
          topic,
          sessionKey,
          channelId: channel,
          channelName,
          trigger: 'reset',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        logDiagnostic({
          type: 'anchor-synced',
          phase: 'reset',
          sessionKey,
          channel,
          topic,
          filePath: result.filePath,
          messageCount: state.messageCount,
          recentCount: state.recentContent.length,
        });
      }

      if (state.messageCount > 0) {
        writeCheckpoint({
          sessionKey,
          channel,
          channelName,
          trigger: 'reset',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        logDiagnostic({
          type: 'checkpoint-written',
          phase: 'reset',
          sessionKey,
          channel,
          topic,
          messageCount: state.messageCount,
        });
      }
      // Reset counter after checkpoint
      writeState({ messageCount: 0, lastCheckpointTs: Date.now(), lastSender: 'unknown', recentContent: [] });
      return;
    }

    // ── MESSAGE: count and maybe checkpoint ──
    if (event.type === 'message' && (event.action === 'preprocessed' || event.action === 'sent')) {
      const content = event.action === 'preprocessed'
        ? ((ctx.bodyForAgent || ctx.body || '') as string).trim()
        : ((ctx.content || '') as string).trim();
      logDiagnostic({
        type: 'message-seen',
        action: event.action,
        sessionKey,
        channel,
        contentLength: content.length,
        preview: content.slice(0, 120),
      });
      if (!content || content.length < 10) {
        logDiagnostic({ type: 'skip-empty-or-short', action: event.action, sessionKey, channel, contentLength: content.length });
        return;
      }
      const contentFilterReason = getFilterReason({ ...ctx, sessionKey }, content);
      if (contentFilterReason) {
        logDiagnostic({
          type: 'skip-filtered',
          phase: 'message',
          reason: contentFilterReason,
          action: event.action,
          sessionKey,
          channel,
          contentLength: content.length,
        });
        return;
      }
      if (content.startsWith('HEARTBEAT_OK') || content.startsWith('NO_REPLY')) {
        logDiagnostic({ type: 'skip-control-message', action: event.action, sessionKey, channel, preview: content.slice(0, 40) });
        return;
      }

      const sender = (ctx.senderUsername || ctx.senderName || ctx.from || (event.action === 'sent' ? 'agent' : 'user')) as string;
      const snippet = extractTopicSignals(content);

      const state = readState();
      state.messageCount += 1;
      state.lastSender = sender;
      if (snippet) {
        state.recentContent.push(snippet);
        // Keep rolling window of last 10 snippets
        if (state.recentContent.length > 10) state.recentContent.shift();
      }

      const topic = inferTopicName({ channelName, channel, sessionKey, recentContent: state.recentContent });
      bindSessionToTopic(
        WORKSPACE,
        sessionKey,
        topic,
        { channelId: channel },
      );
      logDiagnostic({
        type: 'state-updated',
        action: event.action,
        sessionKey,
        channel,
        topic,
        sender,
        messageCount: state.messageCount,
        recentCount: state.recentContent.length,
        snippet: snippet || null,
      });

      // Materialize/update anchor periodically so the topic-anchor provider has real data to inject.
      if (state.messageCount === 1 || state.messageCount % 5 === 0) {
        const result = syncTopicAnchor(WORKSPACE, {
          topic,
          sessionKey,
          channelId: channel,
          channelName,
          trigger: 'rolling',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        logDiagnostic({
          type: 'anchor-synced',
          phase: 'rolling',
          sessionKey,
          channel,
          topic,
          filePath: result.filePath,
          messageCount: state.messageCount,
          recentCount: state.recentContent.length,
        });
      }

      // Interval checkpoint
      if (state.messageCount >= CHECKPOINT_INTERVAL) {
        const result = syncTopicAnchor(WORKSPACE, {
          topic,
          sessionKey,
          channelId: channel,
          channelName,
          trigger: 'interval',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        logDiagnostic({
          type: 'anchor-synced',
          phase: 'interval',
          sessionKey,
          channel,
          topic,
          filePath: result.filePath,
          messageCount: state.messageCount,
          recentCount: state.recentContent.length,
        });
        writeCheckpoint({
          sessionKey,
          channel,
          channelName,
          trigger: 'interval',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        logDiagnostic({
          type: 'checkpoint-written',
          phase: 'interval',
          sessionKey,
          channel,
          topic,
          messageCount: state.messageCount,
        });
        state.messageCount = 0;
        state.lastCheckpointTs = Date.now();
        state.recentContent = [];
      }

      writeState(state);
      logDiagnostic({
        type: 'state-written',
        action: event.action,
        sessionKey,
        channel,
        messageCount: state.messageCount,
        recentCount: state.recentContent.length,
      });
    }
  } catch (err) {
    logDiagnostic({
      type: 'hook-error',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-checkpoint] hook error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
