const { exec } = require('child_process');
const util = require('util');
const execp = util.promisify(exec);

// Fetcher: small wrapper around the `openclaw` CLI for reading thread/channel information
// Context notes: inbound metadata injected by OpenClaw may expose fields like:
// { from, content, channelId, conversationId, messageId, metadata: { threadId, senderId, guildId, channelName, ... } }
// This module expects to be run in the same environment that has the openclaw CLI configured.

async function fetchMessages(threadId, limit = 100) {
  // Use openclaw message read subcommand
  const safeLimit = Math.min(limit, 500);
  const cmd = `openclaw message read --channel discord --target channel:${threadId} --limit ${safeLimit} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 20000 });
    try {
      const parsed = JSON.parse(stdout);
      const msgsRaw = parsed.messages || parsed || [];
      // Filter out bot/system messages and attachments-only
      const msgs = (Array.isArray(msgsRaw) ? msgsRaw : []).filter(m => {
        if (!m) return false;
        if (m.type && (m.type === 'system' || m.type === 'bot')) return false;
        if (m.author && m.author.bot) return false;
        if (!m.content || (typeof m.content === 'string' && m.content.trim() === '')) return false;
        return true;
      }).map(m => ({ id: m.id, author: m.author && (m.author.username || m.author.name), content: m.content, ts: m.ts }));
      return msgs;
    } catch (e) {
      // Fallback: return raw text lines
      return stdout.split('\n').slice(-limit);
    }
  } catch (err) {
    throw new Error(`Failed to fetch messages: ${err.message}`);
  }
}

async function getForumForThread(threadId) {
  // Query thread metadata using channel info
  const cmd = `openclaw message channel info --channel discord --target channel:${threadId} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    // parsed.channel.parent_id should be the forum (parent) for forum posts
    return (parsed && parsed.channel && parsed.channel.parent_id) || null;
  } catch (err) {
    // Best-effort fallback
    return null;
  }
}

async function getThreadTitle(threadId) {
  const cmd = `openclaw message channel info --channel discord --target channel:${threadId} --json`;
  try {
    const { stdout } = await execp(cmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    return (parsed && parsed.channel && (parsed.channel.name || parsed.channel.topic)) || `Thread ${threadId}`;
  } catch (err) {
    return `Thread ${threadId}`;
  }
}

async function archiveThread(threadId) {
  // Best-effort archive: delete recent messages inside the thread (if any)
  try {
    const infoCmd = `openclaw message channel info --channel discord --target channel:${threadId} --json`;
    const { stdout } = await execp(infoCmd, { timeout: 8000 });
    const parsed = JSON.parse(stdout);
    const last = parsed && parsed.channel && parsed.channel.last_message_id;
    if (last) {
      const delCmd = `openclaw message delete --channel discord --target channel:${threadId} --message-id ${last} --json`;
      await execp(delCmd, { timeout: 8000 });
      return true;
    }
    // If no message found, nothing to do
    return true;
  } catch (err) {
    throw new Error(`Failed to archive thread (best-effort): ${err.message}`);
  }
}

module.exports = { fetchMessages, getForumForThread, getThreadTitle, archiveThread };
