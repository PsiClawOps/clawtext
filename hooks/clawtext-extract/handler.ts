import fs from 'fs';
import path from 'path';
import os from 'os';

const BUFFER_FILE = path.join(os.homedir(), '.openclaw/workspace/memory/extract-buffer.jsonl');

/**
 * ClawText Auto-Extract Hook
 *
 * Appends every message (in/out) to a buffer file.
 * A periodic cron job processes the buffer with an LLM to extract memories.
 * This handler must stay fast — no LLM calls, no blocking I/O waits.
 */
const handler = async (event) => {
  // Only care about message events
  if (event.type !== 'message') return;
  if (event.action !== 'preprocessed' && event.action !== 'sent') return;

  try {
    const ctx = event.context || {};

    // Skip empty content
    const content = event.action === 'preprocessed'
      ? (ctx.bodyForAgent || ctx.body || '').trim()
      : (ctx.content || '').trim();
    if (!content || content.length < 10) return;

    // Skip bot system noise
    const from = ctx.from || ctx.to || 'unknown';
    if (content.startsWith('HEARTBEAT_OK') || content.startsWith('NO_REPLY')) return;

    const record = {
      ts: Date.now(),
      dir: event.action === 'sent' ? 'out' : 'in',
      from,
      channel: ctx.channelId || 'unknown',
      conversationId: ctx.conversationId || ctx.groupId || null,
      content: content.slice(0, 4000), // cap very long messages
    };

    // Append to buffer (fire-and-forget, no await to stay fast)
    const line = JSON.stringify(record) + '\n';
    fs.appendFile(BUFFER_FILE, line, (err) => {
      if (err && process.env.DEBUG_CLAWTEXT) {
        console.error('[clawtext-extract] buffer write error:', err.message);
      }
    });
  } catch (err) {
    // Never crash the gateway
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-extract] hook error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
