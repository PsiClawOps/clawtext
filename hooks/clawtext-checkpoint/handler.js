import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve dist relative to this file's actual location at runtime
const _distDir = '/home/lumadmin/.openclaw/workspace/repo/clawtext/dist';
const { bindSessionToTopic, sanitizeTopicName } = await import(path.join(_distDir, 'session-topic-map.js'));
const { syncTopicAnchor } = await import(path.join(_distDir, 'topic-anchor.js'));
const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'checkpoint');
const STATE_FILE = path.join(STATE_DIR, 'checkpoint-state.json');
const DIAG_FILE = path.join(STATE_DIR, 'checkpoint-diagnostic.jsonl');
// Write a checkpoint every N messages
const CHECKPOINT_INTERVAL = 25;
// ── State helpers ─────────────────────────────────────────────────────────────
function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    }
    catch { /* fallthrough */ }
    return { messageCount: 0, lastCheckpointTs: 0, lastSender: 'unknown', recentContent: [] };
}
function writeState(state) {
    if (!fs.existsSync(STATE_DIR))
        fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
function logDiagnostic(entry) {
    try {
        if (!fs.existsSync(STATE_DIR))
            fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.appendFile(DIAG_FILE, JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), ...entry }) + '\n', () => { });
    }
    catch {
        // fire-and-forget
    }
}
// ── Extract lightweight topic signals from content ────────────────────────────
function extractTopicSignals(content) {
    // Take first 120 chars of non-empty, non-noise content
    const trimmed = content.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 10)
        return '';
    // Skip raw logs / JSON blobs
    if (trimmed.startsWith('{') || trimmed.startsWith('['))
        return '';
    return trimmed.slice(0, 120);
}
function inferTopicName(params) {
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
function getFilterReason(ctx, content = '') {
    const trigger = String(ctx.trigger || '').toLowerCase();
    if (trigger.includes('heartbeat'))
        return 'trigger-heartbeat';
    if (/(^|[\s:_./-])cron($|[\s:_./-])/.test(trigger))
        return 'trigger-cron';
    if (/memory[\s:_-]*internal/.test(trigger))
        return 'trigger-memory-internal';
    const identities = [ctx.sessionKey, ctx.sessionId, ctx.agentId, ctx.conversationId, ctx.channelId]
        .map((value) => String(value || '').toLowerCase())
        .filter(Boolean);
    for (const identity of identities) {
        if (identity.includes('heartbeat'))
            return 'identity-heartbeat';
        if (/(^|[\s:_./-])cron($|[\s:_./-])/.test(identity))
            return 'identity-cron';
        if (/memory[\s:_-]*internal/.test(identity))
            return 'identity-memory-internal';
    }
    const normalized = content.trim().toLowerCase();
    if (normalized.startsWith('read heartbeat.md if it exists'))
        return 'heartbeat-poll-prompt';
    return null;
}
function isFilteredSession(ctx, content = '') {
    return getFilterReason(ctx, content) !== null;
}
// ── Write checkpoint record to journal ───────────────────────────────────────
function writeCheckpoint(params) {
    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    if (!fs.existsSync(JOURNAL_DIR))
        fs.mkdirSync(JOURNAL_DIR, { recursive: true });
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
// ── WORKQUEUE checkpoint helpers ──────────────────────────────────────────────
/**
 * Extract agent name from sessionKey.
 * agent:pylon:webchat:pylon-main → pylon
 */
function extractAgentNameFromSession(sessionKey) {
    if (!sessionKey.startsWith('agent:'))
        return null;
    const parts = sessionKey.split(':');
    return parts[1] || null;
}
/**
 * Resolve agent workspace path. Council agents live under workspace-council/{agent}.
 */
function resolveAgentWorkspacePath(agentName) {
    const councilPath = path.join(os.homedir(), '.openclaw', 'workspace-council', agentName);
    if (fs.existsSync(councilPath))
        return councilPath;
    return null;
}
/**
 * Parse WORKQUEUE.md for Active items. Returns WQ IDs.
 */
function parseActiveWorkqueueItems(workqueuePath) {
    if (!fs.existsSync(workqueuePath))
        return [];
    try {
        const content = fs.readFileSync(workqueuePath, 'utf8');
        const lines = content.split('\n');
        let inActive = false;
        const activeIds = [];
        for (const line of lines) {
            if (line.startsWith('## Active')) {
                inActive = true;
                continue;
            }
            if (line.startsWith('## ') && inActive)
                break;
            if (inActive && line.match(/^- \[ \]/)) {
                const idMatch = line.match(/`(WQ-\d{8}-\d{3})`/);
                if (idMatch)
                    activeIds.push(idMatch[1]);
            }
        }
        return activeIds;
    }
    catch {
        return [];
    }
}
/**
 * Write/update a WORKQUEUE checkpoint file for an active item.
 * Captures recent work context so clawtext-restore can inject it on long-idle recovery.
 */
function writeWorkqueueCheckpoint(agentWorkspace, wqId, sessionKey, recentContent, lastSender) {
    const activeDir = path.join(agentWorkspace, 'active');
    if (!fs.existsSync(activeDir))
        fs.mkdirSync(activeDir, { recursive: true });
    const checkpointPath = path.join(activeDir, `${wqId}_checkpoint.md`);
    const now = new Date().toISOString();
    // Read existing checkpoint to preserve accumulated data
    let existingDone = '';
    let existingFiles = '';
    if (fs.existsSync(checkpointPath)) {
        try {
            const existing = fs.readFileSync(checkpointPath, 'utf8');
            const doneMatch = existing.match(/## What's Been Done\n([\s\S]*?)(?:\n## |$)/);
            if (doneMatch)
                existingDone = doneMatch[1].trim();
            const filesMatch = existing.match(/## Files Modified\n([\s\S]*?)(?:\n## |$)/);
            if (filesMatch)
                existingFiles = filesMatch[1].trim();
        }
        catch { /* start fresh */ }
    }
    // Build "What's been done" from recent content (last 5 assistant-like snippets)
    const recentWork = recentContent
        .filter(s => s.length > 20)
        .slice(-5)
        .map(s => `- ${s}`)
        .join('\n');
    // Combine existing and new
    const doneSection = existingDone
        ? `${existingDone}\n${recentWork}`
        : recentWork || '(no recent work captured)';
    // Extract file paths from recent content
    const filePathRe = /(?:\/[\w.@-]+){2,}(?:\.\w+)?/g;
    const files = new Set();
    for (const snippet of recentContent) {
        const matches = snippet.match(filePathRe);
        if (matches)
            matches.forEach(p => files.add(p));
    }
    const filesSection = existingFiles
        ? `${existingFiles}\n${Array.from(files).map(f => `- ${f}`).join('\n')}`
        : Array.from(files).map(f => `- ${f}`).join('\n') || '(none captured)';
    // "Next Step" — last user instruction or last content snippet
    const lastInstruction = recentContent.filter(s => s.length > 10).slice(-1)[0] || '(resume from WORKQUEUE.md)';
    const checkpoint = `# Checkpoint: ${wqId}

_Last updated: ${now}_
_Session: ${sessionKey}_

## What's Been Done
${doneSection}

## Files Modified
${filesSection}

## Next Step
${lastInstruction}
`;
    fs.writeFileSync(checkpointPath, checkpoint);
    logDiagnostic({
        type: 'wq-checkpoint-written',
        wqId,
        sessionKey,
        checkpointPath,
        doneLines: doneSection.split('\n').length,
        fileCount: files.size,
    });
}
// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event) => {
    try {
        const ctx = event.context || {};
        const sessionKey = event.sessionKey || '';
        const channel = ctx.channelId || ctx.conversationId || 'unknown';
        const channelName = ctx.channelName || ctx.groupSubject || undefined;
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
            bindSessionToTopic(WORKSPACE, sessionKey, topic, { channelId: channel });
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
                ? (ctx.bodyForAgent || ctx.body || '').trim()
                : (ctx.content || '').trim();
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
            const sender = (ctx.senderUsername || ctx.senderName || ctx.from || (event.action === 'sent' ? 'agent' : 'user'));
            const snippet = extractTopicSignals(content);
            const state = readState();
            state.messageCount += 1;
            state.lastSender = sender;
            if (snippet) {
                state.recentContent.push(snippet);
                // Keep rolling window of last 10 snippets
                if (state.recentContent.length > 10)
                    state.recentContent.shift();
            }
            const topic = inferTopicName({ channelName, channel, sessionKey, recentContent: state.recentContent });
            bindSessionToTopic(WORKSPACE, sessionKey, topic, { channelId: channel });
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
                // WQ-C: Write WORKQUEUE checkpoint files for Active items
                const agentName = extractAgentNameFromSession(sessionKey);
                if (agentName) {
                    const agentWs = resolveAgentWorkspacePath(agentName);
                    if (agentWs) {
                        const wqPath = path.join(agentWs, 'WORKQUEUE.md');
                        const activeIds = parseActiveWorkqueueItems(wqPath);
                        for (const wqId of activeIds) {
                            try {
                                writeWorkqueueCheckpoint(agentWs, wqId, sessionKey, state.recentContent, state.lastSender);
                            }
                            catch (wqErr) {
                                logDiagnostic({
                                    type: 'wq-checkpoint-error',
                                    wqId,
                                    error: wqErr instanceof Error ? wqErr.message : String(wqErr),
                                });
                            }
                        }
                    }
                }
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
    }
    catch (err) {
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
//# sourceMappingURL=handler.js.map