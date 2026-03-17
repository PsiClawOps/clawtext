import fs from 'fs';
import path from 'path';
import os from 'os';
import { bindSessionToTopic, sanitizeTopicName } from '../../src/session-topic-map.ts';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'checkpoint');
const STATE_FILE = path.join(STATE_DIR, 'checkpoint-state.json');

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

    // ── RESET / NEW: immediate checkpoint ──
    if (event.type === 'agent' && (event.action === 'reset' || event.action === 'new')) {
      const state = readState();
      bindSessionToTopic(
        WORKSPACE,
        sessionKey,
        inferTopicName({ channelName, channel, sessionKey, recentContent: state.recentContent }),
        { channelId: channel },
      );

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
      if (!content || content.length < 10) return;
      if (content.startsWith('HEARTBEAT_OK') || content.startsWith('NO_REPLY')) return;

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

      bindSessionToTopic(
        WORKSPACE,
        sessionKey,
        inferTopicName({ channelName, channel, sessionKey, recentContent: state.recentContent }),
        { channelId: channel },
      );

      // Interval checkpoint
      if (state.messageCount >= CHECKPOINT_INTERVAL) {
        writeCheckpoint({
          sessionKey,
          channel,
          channelName,
          trigger: 'interval',
          messagesSince: state.messageCount,
          recentContent: state.recentContent,
          lastSender: state.lastSender,
        });
        state.messageCount = 0;
        state.lastCheckpointTs = Date.now();
        state.recentContent = [];
      }

      writeState(state);
    }
  } catch (err) {
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-checkpoint] hook error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
