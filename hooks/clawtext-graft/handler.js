/**
 * clawtext-graft hook handler
 *
 * Strips tool call/result data and stateful session metadata from session
 * transcripts to ensure clean state across provider boundaries.
 *
 * Behavior: matches OpenClaw's own fallback behavior — strip all toolCall
 * blocks, toolResult entries, responseIds, and dead error stubs. No prose
 * substitution. Clean slate for the new provider.
 *
 * Trigger condition (conditional): fires when a transcript contains any of:
 *   - toolCall blocks in assistant messages
 *   - toolResult entries
 *   - responseId on any assistant message
 *   - stopReason=error messages referencing a call_id (dead stateful stubs)
 *
 * Two modes:
 *   gateway:startup      — proactive sweep of all session transcripts on boot
 *   message:preprocessed — runtime guard for mid-session provider switches
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.homedir(), '.openclaw/workspace/state/clawtext/prod');
const GRAFT_LOG = path.join(STATE_DIR, 'graft-log.jsonl');
const POISON_LOG = path.join(STATE_DIR, 'poison-log.jsonl');
const AGENTS_DIR = path.join(os.homedir(), '.openclaw/agents');

function log(entry) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(GRAFT_LOG, JSON.stringify({ ...entry, iso: new Date().toISOString() }) + '\n');
  } catch { /* best effort */ }
}

function logPoison(entry) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(POISON_LOG, JSON.stringify({ ...entry, iso: new Date().toISOString() }) + '\n');
  } catch { /* best effort */ }
}

// ─── Tool Call Summarization ──────────────────────────────────────────────────

/**
 * Extract agent workspace path from session transcript metadata.
 * Falls back to null if not found.
 */
function extractAgentWorkspace(entries) {
  for (const e of entries) {
    if (e?.type === 'session' && e.cwd) return e.cwd;
  }
  return null;
}

/**
 * Build a structured summary of stripped tool calls and save to agent workspace.
 * Returns { summaryPath, compactNotice } for transcript injection.
 */
function summarizeAndSaveToolCalls(toolCallPairs, agentWorkspace, sessionKey) {
  if (!toolCallPairs.length) return null;

  const date = new Date().toISOString().slice(0, 10);
  const filesRead = [];
  const filesWritten = [];
  const execCommands = [];
  const keyFindings = [];

  for (const { name, args, result } of toolCallPairs) {
    if (name === 'read' || name === 'Read') {
      const p = args.file || args.path || args.filePath || args.file_path || '?';
      const preview = result.split('\n').slice(0, 2).join(' ').slice(0, 120);
      filesRead.push({ path: p, preview });
    } else if (name === 'write' || name === 'Write' || name === 'edit' || name === 'Edit') {
      const p = args.file || args.path || args.filePath || args.file_path || '?';
      filesWritten.push(p);
    } else if (name === 'exec') {
      const cmd = (args.command || '').slice(0, 120);
      const resultLines = result.split('\n').filter(l => l.trim());
      const signal = (resultLines[resultLines.length - 1] || resultLines[0] || '(no output)').slice(0, 200);
      execCommands.push({ cmd, signal });
      // Capture experiment/scoring findings
      if (/csr|score|total|experiment|exp00/i.test(result)) {
        keyFindings.push(`\`${cmd.slice(0, 60)}\`\n${result.slice(0, 500)}`);
      }
    } else if (name === 'memory_search' || name === 'memory_get') {
      keyFindings.push(`memory: ${args.query || ''} → ${result.slice(0, 300)}`);
    }
  }

  const mdLines = [
    `# Graft Summary — ${date}`,
    `_Session: ${sessionKey}_`,
    `_Generated: ${new Date().toISOString()}_`,
    `_Tool calls stripped: ${toolCallPairs.length}_`,
    '',
  ];

  if (filesRead.length) {
    mdLines.push('## Files Read');
    for (const f of filesRead) mdLines.push(`- \`${f.path}\`\n  ${f.preview}`);
    mdLines.push('');
  }
  if (filesWritten.length) {
    mdLines.push('## Files Written/Edited');
    for (const f of filesWritten) mdLines.push(`- \`${f}\``);
    mdLines.push('');
  }
  if (execCommands.length) {
    mdLines.push('## Commands Run');
    for (const c of execCommands) mdLines.push(`- \`${c.cmd}\`\n  → ${c.signal}`);
    mdLines.push('');
  }
  if (keyFindings.length) {
    mdLines.push('## Key Findings');
    for (const f of keyFindings) mdLines.push(`### Finding\n${f}\n`);
    mdLines.push('');
  }

  // Save to agent workspace memory dir
  let summaryPath = null;
  if (agentWorkspace) {
    try {
      const memDir = path.join(agentWorkspace, 'memory');
      if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      summaryPath = path.join(memDir, `${date}-graft-summary-${ts}.md`);
      fs.writeFileSync(summaryPath, mdLines.join('\n'));
    } catch { summaryPath = null; }
  }

  // Build compact notice for transcript injection
  const readPaths = filesRead.slice(0, 3).map(f => path.basename(f.path)).join(', ');
  const morePaths = filesRead.length > 3 ? ` +${filesRead.length - 3} more` : '';
  const cmdCount = execCommands.length;
  const noticeLines = [
    `⚠️ **clawtext-graft:** ${toolCallPairs.length} tool calls from prior session stripped for cross-provider compatibility.`,
  ];
  if (summaryPath) noticeLines.push(`📄 Full summary saved to: \`${summaryPath}\``);
  if (filesRead.length) noticeLines.push(`📂 Files read: ${readPaths}${morePaths}`);
  if (cmdCount) noticeLines.push(`⚙️ Commands run: ${cmdCount} (see summary for details)`);
  if (keyFindings.length) noticeLines.push(`🔬 Key findings captured: ${keyFindings.length} (check summary)`);
  noticeLines.push(`\n_Review the summary file to restore context before continuing work._`);

  return { summaryPath, compactNotice: noticeLines.join('\n') };
}

// ─── Needs Strip Detection ────────────────────────────────────────────────────

/**
 * Returns true if the transcript contains any tool call data, tool results,
 * stateful responseIds, or dead error stubs that need to be stripped.
 * Conditional trigger — avoids touching clean transcripts.
 */
function transcriptNeedsStrip(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return false;

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const msg = entry.message;
      if (!msg) continue;

      // toolResult entry
      if (msg.role === 'toolResult') return true;

      if (msg.role === 'assistant') {
        // responseId from stateful session
        if (msg.responseId) return true;

        // dead error stub referencing a call_id
        if (msg.stopReason === 'error' && msg.errorMessage && msg.errorMessage.includes('call_id')) return true;

        // toolUse stopReason — provider expects a following toolResult that no longer exists
        if (msg.stopReason === 'toolUse') return true;

        // toolCall blocks in content
        if (Array.isArray(msg.content) && msg.content.some(b => b.type === 'toolCall')) return true;
      }

      // tool_use_id in any content block (user or assistant) — Anthropic artifact
      if ((msg.role === 'assistant' || msg.role === 'user') && Array.isArray(msg.content)) {
        if (msg.content.some(b => b.tool_use_id)) return true;
      }
    } catch { /* skip malformed lines */ }
  }

  // Second pass: check for consecutive same-role messages
  let prevRole = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const role = entry.message?.role;
      if (role === 'assistant' || role === 'user') {
        if (role === prevRole) return true;
        prevRole = role;
      }
    } catch { /* skip */ }
  }

  return false;
}

// ─── Strip Logic ─────────────────────────────────────────────────────────────

/**
 * Strip all tool call blocks, tool result entries, responseIds, tool_use_id fields,
 * and dead error stubs from the transcript. Assistant messages retain only text
 * content blocks. Backs up the original (once) before writing.
 * Logs all poison events to poison-log.jsonl for diagnosis.
 */
function stripTranscript(transcriptPath, sessionKey) {
  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      entries.push(null);
    }
  }

  let strippedToolCalls = 0;
  let strippedToolResults = 0;
  let strippedEmptyAssistants = 0;
  const sessionId = transcriptPath.split('/').pop();

  // Pre-pass: collect tool call + result pairs for summarization BEFORE stripping
  const resultsById = new Map();
  for (const e of entries) {
    const msg = e?.message;
    if (msg?.role !== 'toolResult') continue;
    const id = msg.toolCallId || msg.toolUseId;
    if (!id) continue;
    let text = '';
    if (Array.isArray(msg.content)) text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    else if (typeof msg.content === 'string') text = msg.content;
    resultsById.set(id, text);
  }
  const toolCallPairs = [];
  for (const e of entries) {
    const msg = e?.message;
    if (msg?.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const b of msg.content) {
      if (b.type !== 'toolCall') continue;
      let args = b.arguments || {};
      if (typeof args === 'string') try { args = JSON.parse(args); } catch {}
      toolCallPairs.push({ name: b.name || '?', args, result: resultsById.get(b.id) || '' });
    }
  }

  // Pass 1: strip toolCall blocks, tool_use_id, and stateful metadata
  for (const entry of entries) {
    if (!entry?.message) continue;
    const msg = entry.message;

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const before = msg.content.length;
      msg.content = msg.content.filter(b => b.type !== 'toolCall');
      const removed = before - msg.content.length;
      if (removed > 0) {
        strippedToolCalls += removed;
        logPoison({ type: 'toolCall_block', sessionKey, sessionId, msgId: entry.id, count: removed });
      }

      // Strip tool_use_id from remaining content blocks
      for (const block of msg.content) {
        if (block.tool_use_id) {
          logPoison({ type: 'tool_use_id_in_assistant_block', sessionKey, sessionId, msgId: entry.id, tool_use_id: block.tool_use_id });
          delete block.tool_use_id;
        }
      }

      delete msg.api;
      delete msg.responseId;
    }

    // Strip tool_use_id from user content blocks (Anthropic toolResult artifacts)
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.tool_use_id) {
          logPoison({ type: 'tool_use_id_in_user_block', sessionKey, sessionId, msgId: entry.id, tool_use_id: block.tool_use_id });
          delete block.tool_use_id;
        }
      }
    }
  }

  // Pass 2: remove toolResults, dead error stubs, and empty assistant messages
  const outputEntries = [];
  for (const entry of entries) {
    if (!entry) continue;

    const msg = entry.message;

    // Drop all toolResult entries
    if (msg?.role === 'toolResult') {
      strippedToolResults++;
      logPoison({ type: 'toolResult', sessionKey, sessionId, msgId: entry.id });
      continue;
    }

    if (msg?.role === 'assistant') {
      // Drop dead error stubs referencing stateful call_ids
      if (msg.stopReason === 'error' && msg.errorMessage && msg.errorMessage.includes('call_id')) {
        strippedEmptyAssistants++;
        logPoison({ type: 'error_stub_call_id', sessionKey, sessionId, msgId: entry.id, error: msg.errorMessage.slice(0, 200) });
        continue;
      }

      // Rewrite toolUse stopReason — provider expects a following toolResult
      // that no longer exists. Convert to a normal stop so replay doesn't hang.
      if (msg.stopReason === 'toolUse') {
        msg.stopReason = 'stop';
        logPoison({ type: 'toolUse_stopReason_rewritten', sessionKey, sessionId, msgId: entry.id });
      }

      // Drop empty assistant messages left behind after tool call stripping
      const content = msg.content;
      const isEmpty = !content || content.length === 0 ||
        (Array.isArray(content) && content.every(b => b.type === 'text' && !b.text?.trim()));
      if (isEmpty) {
        strippedEmptyAssistants++;
        logPoison({ type: 'empty_assistant', sessionKey, sessionId, msgId: entry.id });
        continue;
      }
    }

    outputEntries.push(entry);
  }

  // Pass 3: merge consecutive same-role messages (providers require strict alternation)
  const mergedEntries = [];
  let mergedCount = 0;
  let j = 0;
  while (j < outputEntries.length) {
    const e = outputEntries[j];
    const role = e.message?.role;

    if (role === 'assistant' || role === 'user') {
      const run = [e];
      while (j + 1 < outputEntries.length && outputEntries[j + 1].message?.role === role) {
        j++;
        run.push(outputEntries[j]);
      }

      if (run.length > 1) {
        mergedCount += run.length - 1;
        logPoison({ type: 'consecutive_same_role_merged', sessionKey, sessionId, role, count: run.length, msgIds: run.map(r => r.id) });

        // Merge all text content into the first entry
        const base = run[0];
        const allText = [];
        for (const r of run) {
          if (Array.isArray(r.message.content)) {
            for (const b of r.message.content) {
              if (b.type === 'text' && b.text?.trim()) allText.push(b.text.trim());
            }
          }
        }
        const MAX_MERGE_CHARS = 3000;
        let merged_text = allText.join('\n\n');
        if (merged_text.length > MAX_MERGE_CHARS) {
          logPoison({ type: 'merged_content_truncated', sessionKey, sessionId, role, originalChars: merged_text.length });
          merged_text = merged_text.slice(0, MAX_MERGE_CHARS) + '\n\n[context truncated — prior session tool output]';
        }
        base.message.content = merged_text
          ? [{ type: 'text', text: merged_text }]
          : [{ type: 'text', text: '(continued)' }];
        mergedEntries.push(base);
      } else {
        mergedEntries.push(e);
      }
    } else {
      mergedEntries.push(e);
    }
    j++;
  }

  // Summarize stripped tool calls and inject notice if significant work was done
  let summaryResult = null;
  if (toolCallPairs.length > 0) {
    const agentWorkspace = extractAgentWorkspace(entries);
    summaryResult = summarizeAndSaveToolCalls(toolCallPairs, agentWorkspace, sessionKey || sessionId);

    if (summaryResult?.compactNotice) {
      // Inject a user-role notice as the last entry so the agent sees it on next load
      const noticeEntry = {
        type: 'message',
        id: `graft-notice-${Date.now()}`,
        parentId: mergedEntries.length > 0 ? (mergedEntries[mergedEntries.length - 1]?.id || null) : null,
        timestamp: new Date().toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'text', text: summaryResult.compactNotice }],
          __graftNotice: true,
        },
      };
      mergedEntries.push(noticeEntry);
      logPoison({ type: 'graft_notice_injected', sessionKey, sessionId, summaryPath: summaryResult.summaryPath, toolCallCount: toolCallPairs.length });
    }
  }

  const outputLines = mergedEntries.map(e => JSON.stringify(e));

  // Backup original (only once per transcript)
  const backupPath = transcriptPath + '.pre-graft.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(transcriptPath, backupPath);
  }

  fs.writeFileSync(transcriptPath, outputLines.join('\n') + '\n');

  return {
    strippedToolCalls,
    strippedToolResults,
    strippedEmptyAssistants,
    mergedRuns: mergedCount,
    summaryPath: summaryResult?.summaryPath || null,
    outputLines: outputLines.length,
  };
}

// ─── Transcript Discovery ────────────────────────────────────────────────────

function discoverAllTranscripts() {
  const transcripts = [];

  if (!fs.existsSync(AGENTS_DIR)) return transcripts;

  let agentDirs;
  try {
    agentDirs = fs.readdirSync(AGENTS_DIR);
  } catch { return transcripts; }

  // Only process transcripts updated in the last 24h
  const staleCutoff = Date.now() - (24 * 60 * 60 * 1000);

  for (const agent of agentDirs) {
    const sessionsFile = path.join(AGENTS_DIR, agent, 'sessions', 'sessions.json');
    if (!fs.existsSync(sessionsFile)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
      for (const [sessionKey, entry] of Object.entries(data)) {
        const sessionFile = entry.sessionFile;
        if (!sessionFile || typeof sessionFile !== 'string') continue;
        if (!fs.existsSync(sessionFile)) continue;

        if (entry.status === 'ended' || entry.status === 'completed') continue;

        try {
          const stat = fs.statSync(sessionFile);
          if (stat.size < 1024) continue;
          if (stat.mtimeMs < staleCutoff) continue;
        } catch { continue; }

        transcripts.push({ sessionKey, transcriptPath: sessionFile, agent });
      }
    } catch { /* skip malformed sessions.json */ }
  }

  return transcripts;
}

function resolveTranscriptForSession(event) {
  if (event.transcriptPath && fs.existsSync(event.transcriptPath)) {
    return event.transcriptPath;
  }

  const sessionKey = event.sessionKey;
  if (!sessionKey) return null;

  const parts = sessionKey.split(':');
  if (parts.length < 2 || parts[0] !== 'agent') return null;
  const agentId = parts[1];

  const sessionsFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  if (!fs.existsSync(sessionsFile)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
    const entry = data[sessionKey];
    if (!entry?.sessionFile) return null;
    if (!fs.existsSync(entry.sessionFile)) return null;
    return entry.sessionFile;
  } catch { return null; }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

function handleGatewayStartup(event) {
  const transcripts = discoverAllTranscripts();

  log({ event: 'startup_sweep_begin', transcriptCount: transcripts.length });

  let stripped = 0;
  let skipped = 0;
  let errors = 0;

  for (const { sessionKey, transcriptPath, agent } of transcripts) {
    try {
      if (!transcriptNeedsStrip(transcriptPath)) {
        skipped++;
        continue;
      }

      log({ event: 'startup_strip_triggered', sessionKey, agent, transcriptPath });

      const result = stripTranscript(transcriptPath, sessionKey);
      stripped++;

      log({
        event: 'startup_strip_complete',
        sessionKey,
        agent,
        strippedToolCalls: result.strippedToolCalls,
        strippedToolResults: result.strippedToolResults,
        strippedEmptyAssistants: result.strippedEmptyAssistants,
        outputLines: result.outputLines,
      });
    } catch (err) {
      errors++;
      log({ event: 'startup_strip_error', sessionKey, agent, error: err.message });
    }
  }

  log({ event: 'startup_sweep_complete', total: transcripts.length, stripped, skipped, errors });

  if (stripped > 0) {
    console.log(`[clawtext-graft] Startup sweep: stripped ${stripped}/${transcripts.length} session transcripts (${errors} errors)`);
  }
}

function handleMessagePreprocessed(event) {
  const transcriptPath = resolveTranscriptForSession(event);
  if (!transcriptPath) return;

  if (!transcriptNeedsStrip(transcriptPath)) return;

  log({ event: 'runtime_strip_triggered', sessionKey: event.sessionKey, transcriptPath });

  try {
    const result = stripTranscript(transcriptPath, event.sessionKey);

    log({
      event: 'runtime_strip_complete',
      sessionKey: event.sessionKey,
      strippedToolCalls: result.strippedToolCalls,
      strippedToolResults: result.strippedToolResults,
      strippedEmptyAssistants: result.strippedEmptyAssistants,
      outputLines: result.outputLines,
    });
  } catch (err) {
    log({ event: 'runtime_strip_error', sessionKey: event.sessionKey, error: err.message });
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

const handler = async (event) => {
  if (event.type === 'gateway' && event.action === 'startup') {
    handleGatewayStartup(event);
    return;
  }

  if (event.type === 'message' && event.action === 'preprocessed') {
    handleMessagePreprocessed(event);
    return;
  }
};

export default handler;
