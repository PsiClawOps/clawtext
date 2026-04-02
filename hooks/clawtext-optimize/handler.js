/**
 * clawtext-optimize — Context Pressure Management Hook
 *
 * Monitors token usage on every message:preprocessed and applies graduated
 * relevance-weighted pruning before OpenClaw core's tool-result-context-guard
 * fires its oldest-first eviction.
 *
 * Three passes:
 *   Pass 1 (60–70% pressure): Tool result compression
 *   Pass 2 (70–80% pressure): Mid-history de-duplication
 *   Pass 3 (80–85% pressure): Deep scored pruning with checkpoint
 *
 * Never prunes: system messages, last 20 messages, checkpoint markers,
 * messages from active WORKQUEUE item creation forward.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Constants ─────────────────────────────────────────────────────────────────

const GLOBAL_STATE_DIR = path.join(os.homedir(), '.openclaw/workspace/state/clawtext/prod');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_STATE_DIR, 'optimize-config.json');
const OPTIMIZE_LOG = path.join(GLOBAL_STATE_DIR, 'optimize-log.jsonl');
const AGENTS_DIR = path.join(os.homedir(), '.openclaw/agents');

const DEFAULTS = {
  triggerRatio: 0.60,
  budgetRatio: 0.25,
  contextWindowTokens: 120000,
  recentWindowSize: 20,
};

// ── Logging ───────────────────────────────────────────────────────────────────

function logOptimize(entry) {
  try {
    if (!fs.existsSync(GLOBAL_STATE_DIR)) fs.mkdirSync(GLOBAL_STATE_DIR, { recursive: true });
    fs.appendFileSync(OPTIMIZE_LOG, JSON.stringify({ iso: new Date().toISOString(), ...entry }) + '\n');
  } catch { /* best effort */ }
}

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig(workspacePath) {
  // Try workspace-specific config first, then global
  const candidates = [];
  if (workspacePath) {
    candidates.push(path.join(workspacePath, 'state/clawtext/prod/optimize-config.json'));
  }
  candidates.push(GLOBAL_CONFIG_PATH);

  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return {
          triggerRatio: raw.triggerRatio ?? DEFAULTS.triggerRatio,
          budgetRatio: raw.budget?.budgetRatio ?? raw.budgetRatio ?? DEFAULTS.budgetRatio,
          contextWindowTokens: raw.budget?.contextWindowTokens ?? raw.contextWindowTokens ?? DEFAULTS.contextWindowTokens,
          recentWindowSize: raw.recentWindowSize ?? DEFAULTS.recentWindowSize,
        };
      }
    } catch { /* fallthrough */ }
  }

  return { ...DEFAULTS };
}

// ── Token Estimation ──────────────────────────────────────────────────────────

/**
 * Estimate token count for a message. Uses 4 chars ≈ 1 token heuristic.
 */
function estimateTokens(msg) {
  if (!msg) return 0;
  if (typeof msg === 'string') return Math.ceil(msg.length / 4);

  let chars = 0;

  // Role overhead
  if (msg.role) chars += msg.role.length + 10;

  // Content
  if (typeof msg.content === 'string') {
    chars += msg.content.length;
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block === 'string') {
        chars += block.length;
      } else if (block.text) {
        chars += block.text.length;
      } else if (block.type === 'tool_use' || block.type === 'toolCall') {
        chars += (block.name?.length || 0) + 20;
        const args = typeof block.input === 'string' ? block.input :
                     typeof block.arguments === 'string' ? block.arguments :
                     JSON.stringify(block.input || block.arguments || {});
        chars += args.length;
      } else if (block.type === 'tool_result' || block.type === 'toolResult') {
        const content = block.content || block.output || '';
        if (typeof content === 'string') {
          chars += content.length;
        } else if (Array.isArray(content)) {
          for (const c of content) {
            chars += (c.text || c.content || JSON.stringify(c)).length;
          }
        }
      } else {
        chars += JSON.stringify(block).length;
      }
    }
  } else if (msg.content && typeof msg.content === 'object') {
    chars += JSON.stringify(msg.content).length;
  }

  return Math.ceil(chars / 4);
}

/**
 * Estimate total tokens for the full messages array.
 */
function estimateTotalTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg);
  }
  return total;
}

// ── Workspace Resolution ──────────────────────────────────────────────────────

function resolveWorkspace(event) {
  // Try event.workspace first
  if (event.workspace) return event.workspace;

  // Try deriving from sessionKey
  const sessionKey = event.sessionKey || '';
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    const agentId = parts[1];
    const sessionsFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    try {
      if (fs.existsSync(sessionsFile)) {
        const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
        const entry = data[sessionKey];
        if (entry?.cwd) return entry.cwd;
      }
    } catch { /* fallthrough */ }

    // Common workspace patterns
    const councilPath = path.join(os.homedir(), '.openclaw/workspace-council', agentId);
    if (fs.existsSync(councilPath)) return councilPath;
    const researchPath = path.join(os.homedir(), '.openclaw/workspace-research', agentId);
    if (fs.existsSync(researchPath)) return researchPath;
  }

  return null;
}

// ── WORKQUEUE Parsing ─────────────────────────────────────────────────────────

/**
 * Parse WORKQUEUE.md to extract Active and Completed item IDs.
 * Simple line scanning — no markdown parser needed.
 */
function parseWorkqueue(workspacePath) {
  const result = { activeIds: [], completedIds: [], activeStartTs: null };
  if (!workspacePath) return result;

  const wqPath = path.join(workspacePath, 'WORKQUEUE.md');
  try {
    if (!fs.existsSync(wqPath)) return result;
    const content = fs.readFileSync(wqPath, 'utf-8');
    const lines = content.split('\n');

    let section = '';
    for (const line of lines) {
      if (line.startsWith('## Incoming')) { section = 'incoming'; continue; }
      if (line.startsWith('## Active')) { section = 'active'; continue; }
      if (line.startsWith('## Completed')) { section = 'completed'; continue; }
      if (line.startsWith('## ')) { section = ''; continue; }

      const idMatch = line.match(/`(WQ-\d{8}-\d{3})`/);
      if (!idMatch) continue;

      if (section === 'active') {
        result.activeIds.push(idMatch[1]);
        // Try to extract start timestamp
        const tsMatch = line.match(/Started:\s*(\S+)/);
        if (tsMatch && !result.activeStartTs) {
          result.activeStartTs = tsMatch[1];
        }
      } else if (section === 'completed') {
        result.completedIds.push(idMatch[1]);
      }
    }
  } catch { /* fallthrough */ }

  return result;
}

// ── Message Classification ────────────────────────────────────────────────────

function isSystemMessage(msg) {
  return msg?.role === 'system' || msg?.role === 'developer';
}

function hasCheckpointMarker(msg) {
  const text = typeof msg?.content === 'string' ? msg.content :
               Array.isArray(msg?.content) ? msg.content.map(b => b.text || '').join('') : '';
  return text.includes('checkpoint') || text.includes('WQ-') && text.includes('_checkpoint');
}

function isToolResultPair(msg) {
  if (!msg || !Array.isArray(msg.content)) return false;
  return msg.content.some(b =>
    b.type === 'tool_use' || b.type === 'toolCall' ||
    b.type === 'tool_result' || b.type === 'toolResult'
  );
}

function getToolResultContent(msg) {
  if (!msg || !Array.isArray(msg.content)) return '';
  return msg.content
    .filter(b => b.type === 'tool_result' || b.type === 'toolResult')
    .map(b => {
      const c = b.content || b.output || '';
      return typeof c === 'string' ? c :
             Array.isArray(c) ? c.map(x => x.text || '').join('') : JSON.stringify(c);
    })
    .join('');
}

function getToolName(msg) {
  if (!msg || !Array.isArray(msg.content)) return null;
  for (const b of msg.content) {
    if ((b.type === 'tool_use' || b.type === 'toolCall') && b.name) return b.name;
  }
  return null;
}

function getToolArgs(msg) {
  if (!msg || !Array.isArray(msg.content)) return null;
  for (const b of msg.content) {
    if ((b.type === 'tool_use' || b.type === 'toolCall')) {
      return b.input || b.arguments || {};
    }
  }
  return null;
}

function getMessageText(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text)
      .join('\n');
  }
  return '';
}

/**
 * Check if message contains reference to a completed WORKQUEUE item.
 */
function isFromCompletedItem(msg, completedIds) {
  if (!completedIds.length) return false;
  const text = getMessageText(msg) + JSON.stringify(msg.content || '');
  return completedIds.some(id => text.includes(id));
}

/**
 * Extract file path from a tool call (read/write/edit).
 */
function getFilePath(msg) {
  const args = getToolArgs(msg);
  if (!args) return null;
  if (typeof args === 'string') {
    try { return JSON.parse(args).file || JSON.parse(args).path || null; }
    catch { return null; }
  }
  return args.file || args.path || args.filePath || args.file_path || null;
}

// ── Pass 1: Tool Result Compression ──────────────────────────────────────────

function pass1_compressToolResults(messages, protectedStart, config, wqData) {
  const recentCutoff = messages.length - config.recentWindowSize;
  let pruned = 0;
  let bytesRemoved = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // Skip protected ranges
    if (i >= recentCutoff) continue;
    if (i >= protectedStart && protectedStart >= 0) continue;
    if (isSystemMessage(msg)) continue;
    if (hasCheckpointMarker(msg)) continue;

    // Only process tool-bearing messages
    if (!Array.isArray(msg.content)) continue;

    const newContent = [];
    let modified = false;

    for (const block of msg.content) {
      if (block.type !== 'tool_result' && block.type !== 'toolResult') {
        newContent.push(block);
        continue;
      }

      const resultText = typeof block.content === 'string' ? block.content :
                         Array.isArray(block.content) ? block.content.map(x => x.text || '').join('') :
                         JSON.stringify(block.content || '');

      // Already grafted?
      if (resultText.includes('📎')) {
        newContent.push(block);
        continue;
      }

      // From a completed WORKQUEUE item? Compress aggressively.
      const isCompleted = isFromCompletedItem(msg, wqData.completedIds);
      const maxLen = isCompleted ? 100 : 500;

      if (resultText.length > maxLen) {
        const originalLen = resultText.length;
        const truncated = resultText.slice(0, maxLen - 30) + `\n[truncated — ${originalLen} chars]`;
        modified = true;
        pruned++;
        bytesRemoved += originalLen - truncated.length;

        if (typeof block.content === 'string') {
          newContent.push({ ...block, content: truncated });
        } else {
          newContent.push({ ...block, content: [{ type: 'text', text: truncated }] });
        }
      } else {
        newContent.push(block);
      }
    }

    if (modified) {
      msg.content = newContent;
    }
  }

  return { pruned, bytesRemoved };
}

// ── Pass 2: Mid-History De-duplication ───────────────────────────────────────

function pass2_deduplicateMidHistory(messages, protectedStart, config) {
  const recentCutoff = messages.length - config.recentWindowSize;
  let pruned = 0;
  let bytesRemoved = 0;

  // Track file reads — keep most recent, replace earlier
  const fileReadIndices = new Map(); // filePath → [indices]

  // First: index all file reads
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i >= recentCutoff) continue;
    if (i >= protectedStart && protectedStart >= 0) continue;
    if (isSystemMessage(msg)) continue;

    const toolName = getToolName(msg);
    if (toolName === 'read' || toolName === 'cat') {
      const filePath = getFilePath(msg);
      if (filePath) {
        if (!fileReadIndices.has(filePath)) fileReadIndices.set(filePath, []);
        fileReadIndices.get(filePath).push(i);
      }
    }
  }

  // Replace earlier reads with stubs
  for (const [filePath, indices] of fileReadIndices) {
    if (indices.length <= 1) continue;

    // Keep the last one, replace all earlier
    for (let j = 0; j < indices.length - 1; j++) {
      const idx = indices[j];
      const msg = messages[idx];
      if (!msg || !Array.isArray(msg.content)) continue;

      const newContent = msg.content.map(block => {
        if (block.type === 'tool_result' || block.type === 'toolResult') {
          const originalText = typeof block.content === 'string' ? block.content :
                               Array.isArray(block.content) ? block.content.map(x => x.text || '').join('') : '';
          bytesRemoved += originalText.length;
          pruned++;
          const stub = `[earlier read of ${filePath} — superseded]`;
          return typeof block.content === 'string' ?
            { ...block, content: stub } :
            { ...block, content: [{ type: 'text', text: stub }] };
        }
        return block;
      });
      msg.content = newContent;
    }
  }

  // Remove [compacted: tool output removed...] marker stubs
  for (let i = 0; i < messages.length; i++) {
    if (i >= recentCutoff) continue;
    if (i >= protectedStart && protectedStart >= 0) continue;

    const msg = messages[i];
    if (!msg || !Array.isArray(msg.content)) continue;

    let modified = false;
    const newContent = msg.content.map(block => {
      const text = block.text || (typeof block.content === 'string' ? block.content : '');
      if (text.includes('[compacted: tool output removed')) {
        modified = true;
        pruned++;
        bytesRemoved += text.length;
        return { type: 'text', text: '[compacted]' };
      }
      return block;
    });
    if (modified) msg.content = newContent;
  }

  return { pruned, bytesRemoved };
}

// ── Pass 3: Deep Scored Pruning ──────────────────────────────────────────────

/**
 * Score a message for retention. Higher = keep. Range roughly 0–1.
 */
function scoreMessage(msg, index, totalMessages, wqData, config) {
  let score = 0;

  // Recency: linear from 0 (oldest) to 0.4 (newest)
  score += (index / totalMessages) * 0.4;

  // Content type scoring
  const text = getMessageText(msg);
  const toolName = getToolName(msg);

  // Decision content: high value
  const decisionKeywords = ['decided', 'agreed', 'will use', 'confirmed', 'locked', 'going with', 'the fix'];
  if (decisionKeywords.some(kw => text.toLowerCase().includes(kw))) {
    score += 0.25;
  }

  // Code/file writes: high value
  if (toolName === 'write' || toolName === 'edit') {
    score += 0.2;
  }

  // Raw exec output: low value
  if (toolName === 'exec') {
    const resultContent = getToolResultContent(msg);
    if (resultContent.length > 500) score -= 0.15; // Long output = less valuable
  }

  // File reads: moderate value
  if (toolName === 'read') {
    score += 0.05;
  }

  // WORKQUEUE active item reference: highest value
  if (wqData.activeIds.length > 0) {
    const fullText = text + JSON.stringify(msg.content || '');
    if (wqData.activeIds.some(id => fullText.includes(id))) {
      score += 0.35;
    }
  }

  // Checkpoint marker: absolute protection (score > 1 = never prune)
  if (hasCheckpointMarker(msg)) {
    score += 2.0;
  }

  // User messages are slightly more valuable than assistant messages
  if (msg.role === 'user') score += 0.05;

  return Math.max(0, Math.min(score, 2.0));
}

function writeCheckpointFile(workspacePath, wqData, messages) {
  if (!workspacePath || !wqData.activeIds.length) return;

  const activeDir = path.join(workspacePath, 'active');
  try {
    if (!fs.existsSync(activeDir)) fs.mkdirSync(activeDir, { recursive: true });
  } catch { return; }

  for (const id of wqData.activeIds) {
    const checkpointPath = path.join(activeDir, `${id}_checkpoint.md`);

    // Extract last 5 assistant messages as summary
    const recentAssistant = messages
      .filter(m => m?.role === 'assistant')
      .slice(-5)
      .map(m => getMessageText(m).slice(0, 200))
      .filter(Boolean);

    // Extract recently modified files
    const recentFiles = new Set();
    messages.slice(-30).forEach(m => {
      const tn = getToolName(m);
      if (tn === 'write' || tn === 'edit') {
        const fp = getFilePath(m);
        if (fp) recentFiles.add(fp);
      }
    });

    // Extract last user instruction
    const lastUserMsg = [...messages].reverse().find(m => m?.role === 'user');
    const lastInstruction = lastUserMsg ? getMessageText(lastUserMsg).slice(0, 300) : '(none)';

    const content = [
      `# Checkpoint — ${id}`,
      `_Auto-generated by clawtext-optimize at ${new Date().toISOString()}_`,
      '',
      '## What Was Done',
      ...recentAssistant.map(s => `- ${s}`),
      '',
      '## Files Modified',
      ...[...recentFiles].map(f => `- ${f}`),
      '',
      '## Next Step',
      lastInstruction,
      '',
    ].join('\n');

    try {
      fs.writeFileSync(checkpointPath, content);
    } catch { /* best effort */ }
  }
}

function pass3_deepPrune(messages, protectedStart, config, wqData, workspacePath) {
  const recentCutoff = messages.length - config.recentWindowSize;
  let pruned = 0;
  let bytesRemoved = 0;

  // Write checkpoint before we start shedding
  writeCheckpointFile(workspacePath, wqData, messages);

  // Score all pruneable messages
  const candidates = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i >= recentCutoff) continue; // Protected: recent window
    if (i >= protectedStart && protectedStart >= 0) continue; // Protected: active WQ item
    if (isSystemMessage(msg)) continue; // Protected: system
    if (hasCheckpointMarker(msg)) continue; // Protected: checkpoint

    const score = scoreMessage(msg, i, messages.length, wqData, config);
    candidates.push({ index: i, score });
  }

  // Sort by score ascending (lowest = prune first)
  candidates.sort((a, b) => a.score - b.score);

  // Calculate target: bring pressure below 75%
  const targetTokens = config.contextWindowTokens * 0.75;
  let currentTokens = estimateTotalTokens(messages);

  // Prune until below target or out of candidates
  const removeIndices = new Set();
  for (const candidate of candidates) {
    if (currentTokens <= targetTokens) break;

    const msg = messages[candidate.index];
    const msgTokens = estimateTokens(msg);
    removeIndices.add(candidate.index);
    currentTokens -= msgTokens;
    bytesRemoved += msgTokens * 4; // rough byte estimate
    pruned++;
  }

  // Remove pruned messages (iterate in reverse to maintain indices)
  if (removeIndices.size > 0) {
    // Replace removed messages with null, then filter
    for (const idx of removeIndices) {
      messages[idx] = null;
    }
  }

  return { pruned, bytesRemoved, removedIndices: removeIndices };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

const handler = async (event) => {
  // Only handle message:preprocessed
  if (event.type !== 'message' || event.action !== 'preprocessed') return;

  // Need the messages array
  const messages = event.messages;
  if (!Array.isArray(messages) || messages.length < 30) return; // Too short to worry about

  const sessionKey = event.sessionKey || 'unknown';
  const workspacePath = resolveWorkspace(event);
  const config = loadConfig(workspacePath);

  // ── Pressure Check ──
  const totalTokens = estimateTotalTokens(messages);
  const pressure = totalTokens / config.contextWindowTokens;

  // Below trigger? No-op.
  if (pressure < config.triggerRatio) return;

  logOptimize({
    event: 'pressure_detected',
    session: sessionKey,
    pressure: Math.round(pressure * 100) / 100,
    totalTokens,
    contextWindow: config.contextWindowTokens,
    messageCount: messages.length,
  });

  // ── Resolve Protected Range ──
  const wqData = parseWorkqueue(workspacePath);

  // Find the first message index associated with active WORKQUEUE items
  let protectedStart = -1;
  if (wqData.activeIds.length > 0) {
    for (let i = 0; i < messages.length; i++) {
      const text = getMessageText(messages[i]) + JSON.stringify(messages[i]?.content || '');
      if (wqData.activeIds.some(id => text.includes(id))) {
        protectedStart = i;
        break;
      }
    }
  }

  // ── Pass 1: Tool Result Compression (60–70%) ──
  if (pressure >= 0.60) {
    const result = pass1_compressToolResults(messages, protectedStart, config, wqData);
    if (result.pruned > 0) {
      logOptimize({
        event: 'pass_complete',
        session: sessionKey,
        pass: 1,
        strategy: 'tool-result-compress',
        pruned: result.pruned,
        bytesRemoved: result.bytesRemoved,
        pressure: Math.round(pressure * 100) / 100,
      });
    }
  }

  // Recheck pressure after pass 1
  const pressureAfterP1 = estimateTotalTokens(messages) / config.contextWindowTokens;

  // ── Pass 2: Mid-History De-duplication (70–80%) ──
  if (pressureAfterP1 >= 0.70) {
    const result = pass2_deduplicateMidHistory(messages, protectedStart, config);
    if (result.pruned > 0) {
      logOptimize({
        event: 'pass_complete',
        session: sessionKey,
        pass: 2,
        strategy: 'mid-history-dedup',
        pruned: result.pruned,
        bytesRemoved: result.bytesRemoved,
        pressure: Math.round(pressureAfterP1 * 100) / 100,
      });
    }
  }

  // Recheck pressure after pass 2
  const pressureAfterP2 = estimateTotalTokens(messages) / config.contextWindowTokens;

  // ── Pass 3: Deep Scored Pruning (80–85%) ──
  if (pressureAfterP2 >= 0.80) {
    const result = pass3_deepPrune(messages, protectedStart, config, wqData, workspacePath);
    if (result.pruned > 0) {
      logOptimize({
        event: 'pass_complete',
        session: sessionKey,
        pass: 3,
        strategy: 'deep-scored-prune',
        pruned: result.pruned,
        bytesRemoved: result.bytesRemoved,
        pressure: Math.round(pressureAfterP2 * 100) / 100,
      });

      // Filter nulls from the messages array (pass 3 nullifies removed messages)
      // We need to modify the array in-place since hooks receive a reference
      let writeIdx = 0;
      for (let readIdx = 0; readIdx < messages.length; readIdx++) {
        if (messages[readIdx] !== null) {
          messages[writeIdx] = messages[readIdx];
          writeIdx++;
        }
      }
      messages.length = writeIdx;
    }
  }

  // ── Final Pressure Report ──
  const finalTokens = estimateTotalTokens(messages);
  const finalPressure = finalTokens / config.contextWindowTokens;

  logOptimize({
    event: 'optimize_complete',
    session: sessionKey,
    initialPressure: Math.round(pressure * 100) / 100,
    finalPressure: Math.round(finalPressure * 100) / 100,
    initialTokens: totalTokens,
    finalTokens,
    messageCount: messages.length,
    passesRun: (pressure >= 0.60 ? 1 : 0) + (pressureAfterP1 >= 0.70 ? 1 : 0) + (pressureAfterP2 >= 0.80 ? 1 : 0),
  });
};

export default handler;
