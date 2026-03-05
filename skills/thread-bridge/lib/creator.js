const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.resolve(process.cwd(), 'memory/thread-bridge-log.jsonl');

async function createForumPost(forumChannelId, title, initialMessage) {
  // For Discord forum channels (type 15) use the dedicated thread create subcommand
  const safeMsg = JSON.stringify(String(initialMessage || ''));
  const safeTitle = JSON.stringify(title || 'New Thread');
  const cmd = `openclaw message thread create --channel discord --target channel:${forumChannelId} --thread-name=${safeTitle} -m ${safeMsg} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 20000 });
    try {
      const parsed = JSON.parse(stdout);
      // thread info may be under parsed.thread or parsed.channel
      const id = parsed.id || (parsed.thread && parsed.thread.id) || (parsed.channel && parsed.channel.id) || parsed.thread_id;
      const url = parsed.url || (parsed.thread && parsed.thread.url) || (parsed.channel && parsed.channel.url);
      return { id, url, raw: parsed };
    } catch (e) {
      return { id: null, url: null, raw: stdout };
    }
  } catch (err) {
    throw new Error(`Failed to create forum post: ${err.message}`);
  }
}

async function createChannelThread(channelId, title, initialMessage) {
  const safeMsg = JSON.stringify(String(initialMessage || ''));
  const safeTitle = JSON.stringify(title || 'New Thread');
  const cmd = `openclaw message thread create --channel discord --target channel:${channelId} --thread-name=${safeTitle} -m ${safeMsg} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 20000 });
    try {
      const parsed = JSON.parse(stdout);
      const id = parsed.id || (parsed.thread && parsed.thread.id) || (parsed.channel && parsed.channel.id) || parsed.thread_id;
      const url = parsed.url || (parsed.thread && parsed.thread.url) || (parsed.channel && parsed.channel.url);
      return { id, url, raw: parsed };
    } catch (e) {
      return { id: null, url: null, raw: stdout };
    }
  } catch (err) {
    throw new Error(`Failed to create channel thread: ${err.message}`);
  }
}

async function createThread(targetChannelId, title, initialMessage) {
  // Backwards-compatible wrapper: try to detect channel type and pick forum vs channel thread
  try {
    const infoCmd = `openclaw message channel info --channel discord --target channel:${targetChannelId} --json`;
    const { stdout } = await execp(infoCmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    const ch = parsed && parsed.channel;
    if (ch && (ch.type === 15 || ch.type === 'GUILD_FORUM' || ch.type_name === 'GUILD_FORUM')) {
      return await createForumPost(targetChannelId, title, initialMessage);
    }
    // default: channel thread
    return await createChannelThread(targetChannelId, title, initialMessage);
  } catch (err) {
    // If we couldn't determine type, default to forum post (safe for our callers) but still try
    return await createForumPost(targetChannelId, title, initialMessage);
  }
}

async function verifyThreadInForum(threadId, expectedForumId) {
  // Validate that thread's parent_id matches expected forum
  const cmd = `openclaw message channel info --channel discord --target channel:${threadId} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    const parent = parsed && parsed.channel && parsed.channel.parent_id;
    return String(parent) === String(expectedForumId);
  } catch (err) {
    return false;
  }
}

async function nextPartNumber(forumChannelId, sourceTitle) {
  // Best-effort: query recent threads in forum and count parts
  const cmd = `openclaw message thread list --channel discord --channel-id ${forumChannelId} --limit 50 --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    let parsed;
    try { parsed = JSON.parse(stdout); } catch (e) { parsed = null; }
    if (parsed && Array.isArray(parsed.threads)) {
      const regex = new RegExp(`^${escapeRegex(sourceTitle)}\\s*—\\s*Part\\s*(\\d+)$`);
      let max = 1;
      parsed.threads.forEach(t => {
        if (t.name) {
          const m = t.name.match(regex);
          if (m) max = Math.max(max, Number(m[1]) + 1);
        }
      });
      return max;
    }
    return 2;
  } catch (err) {
    return 2;
  }
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\\]\\/g, '\\\\$&'); }

function buildThreadUrl(forumId, threadId) {
  // Best-effort constructing Discord URL
  return `https://discord.com/channels/${process.env.DISCORD_GUILD_ID || ''}/${forumId}/${threadId}`;
}

async function autoTitleFromSummary(summary) {
  // Pick first line or generate short title
  if (!summary) return 'Split Thread';
  const firstLine = summary.split('\n').find(l => l.trim());
  let title = firstLine ? firstLine.trim().slice(0, 80) : 'Split Thread';
  return title;
}

async function logOperation(obj) {
  try {
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString() }, obj));
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    // swallow logging errors
    console.error('Failed to log thread-bridge operation', err.message);
  }
}

module.exports = { createForumPost, createChannelThread, createThread, verifyThreadInForum, nextPartNumber, buildThreadUrl, autoTitleFromSummary, logOperation };