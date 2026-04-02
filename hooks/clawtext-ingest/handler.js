import fs from 'fs';
import path from 'path';
import os from 'os';
const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod');
const TAIL_PENDING_FILE = path.join(STATE_DIR, 'compaction-tail-pending.json');
const MARKER_FILE = path.join(STATE_DIR, 'compaction-marker.json');
// How many raw messages to capture as tail
const TAIL_SIZE = 10;
// Per-message preview cap for tail injection
const PREVIEW_CAP = 300;
// Aggregate preview budget across the whole tail payload
const MAX_TAIL_PREVIEW_CHARS = 3000;
// Summary budget — max chars for the entire summary block
const MAX_SUMMARY_CHARS = 1500;
// Messages kept after compaction (the "surviving" window) — not evicted
const SURVIVING_WINDOW = 30;
// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureStateDir() {
    if (!fs.existsSync(STATE_DIR)) {
        fs.mkdirSync(STATE_DIR, { recursive: true });
    }
}
/**
 * Extract the channel ID from sessionKey or hookCtx.
 */
function extractChannelId(sessionKey, ctx) {
    const ctxChannel = ctx.channelId || '';
    if (ctxChannel && ctxChannel !== 'unknown')
        return ctxChannel;
    for (const marker of [':channel:', ':topic:', ':webchat:']) {
        if (sessionKey.includes(marker)) {
            return sessionKey.split(marker).pop() || '';
        }
    }
    return sessionKey;
}
function buildPreview(text, cap = PREVIEW_CAP) {
    return text.slice(0, cap) + (text.length > cap ? '…' : '');
}
function applyTailBudget(messages) {
    if (messages.length === 0)
        return messages;
    let remaining = MAX_TAIL_PREVIEW_CHARS;
    const bounded = [];
    for (const message of messages) {
        if (remaining <= 0)
            break;
        const cap = Math.min(PREVIEW_CAP, remaining);
        const preview = buildPreview(message.preview, cap).trim();
        if (!preview)
            continue;
        bounded.push({ ...message, preview });
        remaining -= preview.length;
    }
    return bounded;
}
function readTailFromSessionFile(sessionFile) {
    if (!sessionFile || !fs.existsSync(sessionFile))
        return [];
    try {
        const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n').filter(Boolean);
        const messages = [];
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type !== 'message')
                    continue;
                const msg = entry.message;
                if (!msg)
                    continue;
                const role = msg.role || 'unknown';
                if (role !== 'user' && role !== 'assistant')
                    continue;
                let text = '';
                if (typeof msg.content === 'string') {
                    text = msg.content;
                }
                else if (Array.isArray(msg.content)) {
                    text = msg.content
                        .filter(b => b.type === 'text')
                        .map(b => String(b.text || ''))
                        .join(' ');
                }
                const ts = typeof msg.timestamp === 'number' ? msg.timestamp :
                    (typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : null);
                if (text.trim()) {
                    messages.push({ role, preview: text, ts: ts ?? null });
                }
            }
            catch { /* skip malformed lines */ }
        }
        return applyTailBudget(messages.slice(-TAIL_SIZE));
    }
    catch {
        return [];
    }
}
// ── Summary extraction ────────────────────────────────────────────────────────
/**
 * Extract text content from a message object (handles string and content-block arrays).
 */
function extractText(msg) {
    if (typeof msg.content === 'string')
        return msg.content;
    if (Array.isArray(msg.content)) {
        return msg.content
            .filter(b => b.type === 'text')
            .map(b => String(b.text || ''))
            .join(' ');
    }
    return '';
}
/**
 * Extract role from a message, handling both direct and nested message formats.
 */
function extractRole(msg) {
    return msg.role || 'unknown';
}
// Decision-signaling keywords (case-insensitive match)
const DECISION_KEYWORDS = [
    'decided', 'agreed', 'will use', 'confirmed', 'locked',
    'going with', 'chose', 'selected', 'approved', 'rejected',
    'settled on', 'committed to',
];
// File path pattern — matches common file paths in content
const FILE_PATH_RE = /(?:\/[\w.@-]+){2,}(?:\.\w+)?/g;
// WORKQUEUE item ID pattern
const WQ_ID_RE = /WQ-\d{8}-\d{3}/g;
/**
 * Extract a structured summary from the eviction window messages.
 * Eviction window = all messages except the last SURVIVING_WINDOW.
 */
function extractSummary(messages) {
    // Determine eviction window
    const evictionEnd = Math.max(0, messages.length - SURVIVING_WINDOW);
    const evictionWindow = messages.slice(0, evictionEnd);
    const decisions = [];
    const filePaths = new Set();
    const commands = [];
    const wqItems = new Set();
    const keyFindings = [];
    for (const msg of evictionWindow) {
        const role = extractRole(msg);
        const text = extractText(msg).trim();
        if (!text)
            continue;
        // Extract WQ item IDs from any message
        const wqMatches = text.match(WQ_ID_RE);
        if (wqMatches) {
            for (const m of wqMatches)
                wqItems.add(m);
        }
        // Extract file paths from any message
        const pathMatches = text.match(FILE_PATH_RE);
        if (pathMatches) {
            for (const p of pathMatches) {
                // Filter out noise — must look like a real path (not a URL scheme)
                if (!p.startsWith('//') && p.length < 200) {
                    filePaths.add(p);
                }
            }
        }
        // Extract decisions (from assistant messages)
        if (role === 'assistant') {
            const lowerText = text.toLowerCase();
            for (const keyword of DECISION_KEYWORDS) {
                if (lowerText.includes(keyword)) {
                    // Extract the sentence containing the keyword
                    const sentences = text.split(/[.!?\n]+/);
                    for (const sentence of sentences) {
                        if (sentence.toLowerCase().includes(keyword) && sentence.trim().length > 10) {
                            const trimmed = sentence.trim().slice(0, 150);
                            if (decisions.length < 10) {
                                decisions.push(trimmed);
                            }
                            break; // one decision per keyword match per message
                        }
                    }
                    break; // one keyword match per message
                }
            }
            // Key findings — longer assistant messages that aren't raw tool output
            if (text.length > 200 && !text.startsWith('{') && !text.startsWith('[') && !text.includes('```\n{')) {
                const finding = text.slice(0, 150);
                if (keyFindings.length < 5) {
                    keyFindings.push(finding);
                }
            }
        }
        // Extract commands from tool_calls or exec-style patterns
        if (role === 'assistant' || role === 'tool') {
            // Look for tool_calls in the message
            const toolCalls = msg.tool_calls;
            if (Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                    const fn = tc.function;
                    if (fn && fn.name === 'exec') {
                        try {
                            const args = typeof fn.arguments === 'string'
                                ? JSON.parse(fn.arguments)
                                : fn.arguments;
                            if (args && typeof args.command === 'string' && commands.length < 15) {
                                commands.push(args.command.slice(0, 200));
                            }
                        }
                        catch { /* skip malformed */ }
                    }
                }
            }
        }
    }
    return {
        decisions: decisions.slice(0, 8),
        filesTouched: Array.from(filePaths).slice(0, 20),
        commandsRun: commands.slice(0, 15),
        workqueueItems: Array.from(wqItems).slice(0, 5),
        keyFindings: keyFindings.slice(0, 5),
    };
}
/**
 * Enforce the MAX_SUMMARY_CHARS budget on the summary.
 * Progressively trims arrays until under budget.
 */
function trimSummaryToBudget(summary) {
    const measure = () => JSON.stringify(summary).length;
    // Progressive trimming — trim the biggest arrays first
    while (measure() > MAX_SUMMARY_CHARS && summary.filesTouched.length > 10) {
        summary.filesTouched.pop();
    }
    while (measure() > MAX_SUMMARY_CHARS && summary.commandsRun.length > 5) {
        summary.commandsRun.pop();
    }
    while (measure() > MAX_SUMMARY_CHARS && summary.keyFindings.length > 2) {
        summary.keyFindings.pop();
    }
    while (measure() > MAX_SUMMARY_CHARS && summary.decisions.length > 3) {
        summary.decisions.pop();
    }
    while (measure() > MAX_SUMMARY_CHARS && summary.filesTouched.length > 5) {
        summary.filesTouched.pop();
    }
    return summary;
}
// ── Read all messages from sessionFile or event.messages ──────────────────────
function readAllMessagesFromSessionFile(sessionFile) {
    if (!sessionFile || !fs.existsSync(sessionFile))
        return [];
    try {
        const lines = fs.readFileSync(sessionFile, 'utf8').trim().split('\n').filter(Boolean);
        const messages = [];
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                if (entry.type !== 'message')
                    continue;
                const msg = entry.message;
                if (msg)
                    messages.push(msg);
            }
            catch { /* skip */ }
        }
        return messages;
    }
    catch {
        return [];
    }
}
// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event, ctx) => {
    const sessionKey = ctx.sessionKey || ctx.sessionId || '';
    const channelId = extractChannelId(sessionKey, ctx);
    // ── BEFORE COMPACTION: capture tail + summary ─────────────────────────────
    if (event.type === 'before_compaction' || (event.type === 'compaction' && event.action === 'before')) {
        try {
            ensureStateDir();
            // Collect all messages for summary extraction
            let allMessages = [];
            if (event.sessionFile) {
                allMessages = readAllMessagesFromSessionFile(event.sessionFile);
            }
            else if (Array.isArray(event.messages) && event.messages.length > 0) {
                allMessages = event.messages;
            }
            // Extract tail from end of message list
            let tail = [];
            if (event.sessionFile) {
                tail = readTailFromSessionFile(event.sessionFile);
            }
            else if (allMessages.length > 0) {
                const recentMessages = allMessages.slice(-TAIL_SIZE);
                for (const msg of recentMessages) {
                    const role = msg.role || 'unknown';
                    let text = '';
                    if (typeof msg.content === 'string') {
                        text = msg.content;
                    }
                    else if (Array.isArray(msg.content)) {
                        text = msg.content
                            .filter(b => b.type === 'text')
                            .map(b => String(b.text || ''))
                            .join(' ');
                    }
                    if (text.trim()) {
                        tail.push({ role, preview: text, ts: null });
                    }
                }
            }
            tail = applyTailBudget(tail);
            // Extract summary from eviction window
            let summary;
            if (allMessages.length > SURVIVING_WINDOW) {
                summary = extractSummary(allMessages);
                summary = trimSummaryToBudget(summary);
                // Only include summary if it has meaningful content
                const hasContent = summary.decisions.length > 0
                    || summary.filesTouched.length > 0
                    || summary.commandsRun.length > 0
                    || summary.workqueueItems.length > 0
                    || summary.keyFindings.length > 0;
                if (!hasContent)
                    summary = undefined;
            }
            const pending = {
                capturedAt: Date.now(),
                sessionKey,
                channelId,
                tail,
            };
            if (summary) {
                pending.summary = summary;
            }
            fs.writeFileSync(TAIL_PENDING_FILE, JSON.stringify(pending, null, 2));
            if (process.env.DEBUG_CLAWTEXT) {
                console.log(`[clawtext-ingest] before_compaction: captured ${tail.length} tail messages, summary=${!!summary} for channel ${channelId}`);
            }
        }
        catch (err) {
            if (process.env.DEBUG_CLAWTEXT) {
                console.error('[clawtext-ingest] before_compaction error:', err instanceof Error ? err.message : String(err));
            }
        }
        return;
    }
    // ── AFTER COMPACTION: write marker ────────────────────────────────────────
    if (event.type === 'after_compaction' || (event.type === 'compaction' && event.action === 'after')) {
        try {
            ensureStateDir();
            let tail = [];
            let summary;
            if (fs.existsSync(TAIL_PENDING_FILE)) {
                try {
                    const pending = JSON.parse(fs.readFileSync(TAIL_PENDING_FILE, 'utf8'));
                    const age = Date.now() - (pending.capturedAt || 0);
                    if (age < 5 * 60 * 1000 && pending.sessionKey === sessionKey) {
                        tail = pending.tail;
                        summary = pending.summary;
                    }
                }
                catch { /* ignore corrupt pending file */ }
                try {
                    fs.unlinkSync(TAIL_PENDING_FILE);
                }
                catch { /* ignore */ }
            }
            if (tail.length === 0 && event.sessionFile) {
                tail = readTailFromSessionFile(event.sessionFile);
            }
            // If we had no summary from pending but have sessionFile, try extracting now
            // (less ideal — post-compaction some messages may already be gone)
            if (!summary && event.sessionFile) {
                const allMessages = readAllMessagesFromSessionFile(event.sessionFile);
                if (allMessages.length > 10) {
                    summary = extractSummary(allMessages);
                    summary = trimSummaryToBudget(summary);
                    const hasContent = summary.decisions.length > 0
                        || summary.filesTouched.length > 0
                        || summary.commandsRun.length > 0
                        || summary.workqueueItems.length > 0
                        || summary.keyFindings.length > 0;
                    if (!hasContent)
                        summary = undefined;
                }
            }
            const nowMs = Date.now();
            const marker = {
                ts: nowMs,
                iso: new Date(nowMs).toISOString(),
                sessionKey,
                channelId,
                compactedCount: event.compactedCount ?? 0,
                messageCount: event.messageCount ?? 0,
                tail,
            };
            if (summary) {
                marker.summary = summary;
            }
            fs.writeFileSync(MARKER_FILE, JSON.stringify(marker, null, 2));
            if (process.env.DEBUG_CLAWTEXT) {
                console.log(`[clawtext-ingest] after_compaction: wrote marker for channel ${channelId}, compactedCount=${marker.compactedCount}, tail=${tail.length}, summary=${!!summary}`);
            }
        }
        catch (err) {
            if (process.env.DEBUG_CLAWTEXT) {
                console.error('[clawtext-ingest] after_compaction error:', err instanceof Error ? err.message : String(err));
            }
        }
        return;
    }
};
export default handler;
//# sourceMappingURL=handler.js.map