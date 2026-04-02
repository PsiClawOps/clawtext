import fs from 'fs';
import path from 'path';
import os from 'os';
const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const CONFIG_FILE = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'restore-config.json');
const COMPACTION_MARKER_FILE = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'compaction-marker.json');
// How long a compaction marker remains valid (24h)
const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// ── Defaults — all overridable via restore-config.json ───────────────────────
const DEFAULTS = {
    injectLimit: 20,
    maxContextAgeHours: 8,
    minMessages: 3,
    lookbackDays: 2,
    maxContentBytes: 8000,
    previewCap: 300,
    minScore: 0.25,
    enabled: true,
    // WQ-C additions
    crossChannelFallback: true,
    crossChannelMinScore: 0.15,
    workqueueGatedExtendedRestore: true,
};
// ── Agent workspace helpers ──────────────────────────────────────────────────
/**
 * Extract agent name from sessionKey.
 * agent:pylon:webchat:pylon-main → pylon
 */
function extractAgentName(sessionKey) {
    if (!sessionKey.startsWith('agent:'))
        return null;
    const parts = sessionKey.split(':');
    return parts[1] || null;
}
/**
 * Derive agent workspace path. Council agents live under workspace-council/{agent}.
 * Falls back to the global workspace if the agent-specific one doesn't exist.
 */
function resolveAgentWorkspace(agentName) {
    const councilPath = path.join(os.homedir(), '.openclaw', 'workspace-council', agentName);
    if (fs.existsSync(councilPath))
        return councilPath;
    return null;
}
/**
 * Parse WORKQUEUE.md for Active items. Returns WQ IDs of active items.
 * Simple line scanner — no markdown parser needed.
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
            if (line.startsWith('## ') && inActive) {
                break; // Left the Active section
            }
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
 * Read a WQ checkpoint file and extract the "Next Step" section.
 */
function readCheckpointNextStep(checkpointPath) {
    if (!fs.existsSync(checkpointPath))
        return null;
    try {
        const content = fs.readFileSync(checkpointPath, 'utf8');
        // Look for "Next Step" or "## Next Step" section
        const nextStepMatch = content.match(/(?:^|\n)#{1,3}\s*Next\s+Step[^\n]*\n([\s\S]*?)(?:\n#{1,3}\s|\n---|\n$|$)/i);
        if (nextStepMatch) {
            return nextStepMatch[1].trim().slice(0, 500);
        }
        return null;
    }
    catch {
        return null;
    }
}
// ── Compaction marker helpers ──────────────────────────────────────────────────
function readCompactionMarker() {
    if (!fs.existsSync(COMPACTION_MARKER_FILE))
        return null;
    try {
        const marker = JSON.parse(fs.readFileSync(COMPACTION_MARKER_FILE, 'utf8'));
        const age = Date.now() - (marker.ts || 0);
        if (age > MARKER_MAX_AGE_MS)
            return null;
        return marker;
    }
    catch {
        return null;
    }
}
function clearCompactionMarker() {
    try {
        if (fs.existsSync(COMPACTION_MARKER_FILE)) {
            fs.unlinkSync(COMPACTION_MARKER_FILE);
        }
    }
    catch { /* ignore */ }
}
function buildCompactionNotice(marker) {
    const compactedAt = new Date(marker.ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const lines = [
        '<!-- CLAWTEXT COMPACTION NOTICE -->',
        `**⚠️ Context was compacted at ${compactedAt}.** Messages before this point are summarized above.`,
        `You may be missing detail — ask the user to clarify if needed.`,
        `(${marker.compactedCount > 0 ? `${marker.compactedCount} messages compacted` : 'compaction occurred'})`,
        '<!-- END CLAWTEXT COMPACTION NOTICE -->',
    ];
    return lines.join('\n');
}
function buildSummaryBlock(summary) {
    const parts = [
        '',
        '<!-- CLAWTEXT COMPACTION SUMMARY -->',
        '**[Summary of compacted content]**',
    ];
    if (summary.decisions.length > 0) {
        parts.push(`Decisions: ${summary.decisions.join(' | ')}`);
    }
    if (summary.filesTouched.length > 0) {
        parts.push(`Files touched: ${summary.filesTouched.join(' | ')}`);
    }
    if (summary.commandsRun.length > 0) {
        parts.push(`Commands run: ${summary.commandsRun.join(' | ')}`);
    }
    if (summary.workqueueItems.length > 0) {
        parts.push(`Active items: ${summary.workqueueItems.join(' | ')}`);
    }
    if (summary.keyFindings.length > 0) {
        parts.push('Key findings:');
        for (const finding of summary.keyFindings) {
            parts.push(`- ${finding}`);
        }
    }
    parts.push('<!-- END CLAWTEXT COMPACTION SUMMARY -->');
    return parts.join('\n');
}
function buildTailBlock(marker) {
    if (!marker.tail || marker.tail.length === 0)
        return '';
    const lines = [
        '',
        '<!-- CLAWTEXT COMPACTION TAIL: last messages before compaction -->',
        `**[Last ${marker.tail.length} message(s) before compaction — uncompacted window]**`,
        '',
    ];
    for (const msg of marker.tail) {
        const arrow = msg.role === 'user' ? '→' : '←';
        const ts = msg.ts ? new Date(msg.ts).toISOString().replace('T', ' ').slice(0, 16) : '';
        const prefix = ts ? `[${ts}] ` : '';
        lines.push(`${prefix}${arrow} **${msg.role}:** ${msg.preview}`);
    }
    lines.push('');
    lines.push('<!-- END CLAWTEXT COMPACTION TAIL -->');
    return lines.join('\n');
}
let scorerModulePromise = null;
function loadScorerModule() {
    if (!scorerModulePromise) {
        scorerModulePromise = import('../dist/journal-context-scorer.js')
            .catch(() => import('../../dist/journal-context-scorer.js'));
    }
    return scorerModulePromise;
}
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const overrides = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            return { ...DEFAULTS, ...overrides };
        }
    }
    catch { /* fallthrough to defaults */ }
    return { ...DEFAULTS };
}
// ── Read journal records from recent files ───────────────────────────────────
/**
 * Read journal records matching a specific channelId.
 */
function readRecentJournalRecords(channelId, limitDays) {
    if (!fs.existsSync(JOURNAL_DIR))
        return [];
    const files = fs.readdirSync(JOURNAL_DIR)
        .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
        .sort()
        .reverse()
        .slice(0, limitDays);
    const records = [];
    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(JOURNAL_DIR, file), 'utf8');
            for (const line of raw.trim().split('\n').filter(Boolean)) {
                try {
                    const rec = JSON.parse(line);
                    if (rec.channel === channelId || rec.conversationId === channelId) {
                        records.push(rec);
                    }
                }
                catch { /* skip malformed */ }
            }
        }
        catch { /* skip unreadable file */ }
    }
    return records.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}
/**
 * WQ-C: Cross-channel fallback — read journal records matching an agent name
 * regardless of channelId. Matches records where agentId === agentName or
 * sessionKey contains the agent name.
 */
function readJournalRecordsByAgent(agentName, limitDays) {
    if (!fs.existsSync(JOURNAL_DIR))
        return [];
    const files = fs.readdirSync(JOURNAL_DIR)
        .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
        .sort()
        .reverse()
        .slice(0, limitDays);
    const records = [];
    const agentPattern = `agent:${agentName}:`;
    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(JOURNAL_DIR, file), 'utf8');
            for (const line of raw.trim().split('\n').filter(Boolean)) {
                try {
                    const rec = JSON.parse(line);
                    const recAgent = rec.agentId || '';
                    const recSession = rec.sessionKey || '';
                    if (recAgent === agentName || recSession.startsWith(agentPattern)) {
                        records.push(rec);
                    }
                }
                catch { /* skip malformed */ }
            }
        }
        catch { /* skip unreadable file */ }
    }
    return records.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}
// ── Format records as a compact context block ─────────────────────────────────
function formatContextBlock(records, channelId, cfg, scorer, options) {
    const messages = records.filter(r => r.type !== 'checkpoint');
    const checkpoints = records.filter(r => r.type === 'checkpoint');
    const lastCheckpoint = checkpoints[checkpoints.length - 1];
    const minScore = options?.minScoreOverride ?? cfg.minScore ?? 0.25;
    const budget = {
        maxMessages: cfg.injectLimit,
        maxBytes: cfg.maxContentBytes,
        minScore,
    };
    const scored = scorer.scoreMessages(messages, budget);
    const selected = scorer.selectForInjection(scored, budget);
    if (selected.length < cfg.minMessages)
        return '';
    const threadName = selected.find(r => r.threadName)
        ?.threadName || channelId;
    const lastTopics = lastCheckpoint
        ? (lastCheckpoint.recentTopics || []).join(', ')
        : '';
    const first = new Date(Number(selected[0].ts)).toISOString().replace('T', ' ').slice(0, 16);
    const last = new Date(Number(selected[selected.length - 1].ts)).toISOString().replace('T', ' ').slice(0, 16);
    const sourceLabel = options?.crossChannel
        ? '**[Restored context from alternate channel — same agent]**'
        : '**[Restored context from journal — recent conversation]**';
    const header = [
        `<!-- CLAWTEXT CONTEXT RESTORE: journal replay for ${threadName} -->`,
        `<!-- ${selected.length} messages | ${first} → ${last} | channel: ${channelId} | budget: ${cfg.maxContentBytes}b | minScore: ${minScore} ${options?.crossChannel ? '| cross-channel' : ''} -->`,
        lastTopics ? `<!-- Recent topics: ${lastTopics} -->` : null,
        '',
        sourceLabel,
        '',
    ].filter(l => l !== null);
    const body = [];
    for (const rec of selected) {
        const time = new Date(Number(rec.ts)).toISOString().replace('T', ' ').slice(0, 16);
        const arrow = rec.dir === 'in' ? '→' : '←';
        const who = (rec.sender || rec.from || (rec.dir === 'in' ? 'user' : 'agent'));
        const content = (rec.content || '').trim();
        const preview = content.length > cfg.previewCap ? content.slice(0, cfg.previewCap) + '…' : content;
        if (preview)
            body.push(`[${time}] ${arrow} **${who}:** ${preview}`);
    }
    return [...header, ...body, '', '<!-- END CLAWTEXT CONTEXT RESTORE -->'].join('\n');
}
/**
 * WQ-C: Build a WORKQUEUE active-item context block for injection.
 * Includes the active items and any checkpoint "Next Step" data.
 */
function buildWorkqueueRestoreBlock(agentWorkspace, activeIds) {
    if (activeIds.length === 0)
        return '';
    const parts = [
        '',
        '<!-- CLAWTEXT WORKQUEUE RESTORE -->',
        `**[Active work items — restored from WORKQUEUE + checkpoints]**`,
        `Active items: ${activeIds.join(', ')}`,
    ];
    for (const id of activeIds) {
        const checkpointPath = path.join(agentWorkspace, 'active', `${id}_checkpoint.md`);
        const nextStep = readCheckpointNextStep(checkpointPath);
        if (nextStep) {
            parts.push(`**${id} — Next Step:** ${nextStep}`);
        }
    }
    parts.push('<!-- END CLAWTEXT WORKQUEUE RESTORE -->');
    return parts.join('\n');
}
// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event) => {
    if (event.type !== 'agent' || event.action !== 'bootstrap')
        return;
    try {
        const cfg = loadConfig();
        if (!cfg.enabled)
            return;
        const ctx = event.context || {};
        const sessionKey = event.sessionKey || '';
        let channelId = ctx.channelId || '';
        if (!channelId && sessionKey.includes(':channel:')) {
            channelId = sessionKey.split(':channel:').pop() || '';
        }
        if (!channelId && sessionKey.includes(':topic:')) {
            channelId = sessionKey.split(':topic:').pop() || '';
        }
        if (!channelId || channelId === 'unknown')
            return;
        const agentName = extractAgentName(sessionKey);
        // ── Check for compaction marker ────────────────────────────────────────
        const marker = readCompactionMarker();
        const markerMatchesChannel = marker && (marker.channelId === channelId ||
            marker.sessionKey === sessionKey);
        if (markerMatchesChannel && marker) {
            const noticeParts = [];
            noticeParts.push(buildCompactionNotice(marker));
            if (marker.summary) {
                const summaryBlock = buildSummaryBlock(marker.summary);
                if (summaryBlock)
                    noticeParts.push(summaryBlock);
            }
            const tailBlock = buildTailBlock(marker);
            if (tailBlock)
                noticeParts.push(tailBlock);
            if (noticeParts.length > 0) {
                event.messages.push(noticeParts.join('\n'));
                if (process.env.DEBUG_CLAWTEXT) {
                    console.log(`[clawtext-restore] injected compaction notice + summary=${!!marker.summary} + tail (${marker.tail?.length ?? 0} msgs) for channel ${channelId}`);
                }
            }
            clearCompactionMarker();
        }
        // ── Standard journal restore ───────────────────────────────────────────
        let records = readRecentJournalRecords(channelId, cfg.lookbackDays);
        let crossChannel = false;
        // WQ-C Improvement 1: Cross-channel fallback
        if (records.length < cfg.minMessages && cfg.crossChannelFallback && agentName) {
            const agentRecords = readJournalRecordsByAgent(agentName, cfg.lookbackDays);
            if (agentRecords.length >= cfg.minMessages) {
                records = agentRecords;
                crossChannel = true;
                if (process.env.DEBUG_CLAWTEXT) {
                    console.log(`[clawtext-restore] cross-channel fallback for agent ${agentName}: found ${agentRecords.length} records`);
                }
            }
        }
        if (records.length < cfg.minMessages) {
            // Even with no journal records, check if we should inject WORKQUEUE context
            if (cfg.workqueueGatedExtendedRestore && agentName) {
                const agentWorkspace = resolveAgentWorkspace(agentName);
                if (agentWorkspace) {
                    const wqPath = path.join(agentWorkspace, 'WORKQUEUE.md');
                    const activeIds = parseActiveWorkqueueItems(wqPath);
                    if (activeIds.length > 0) {
                        const wqBlock = buildWorkqueueRestoreBlock(agentWorkspace, activeIds);
                        if (wqBlock) {
                            event.messages.push(wqBlock);
                            if (process.env.DEBUG_CLAWTEXT) {
                                console.log(`[clawtext-restore] injected WORKQUEUE restore (${activeIds.length} active items) for agent ${agentName} — no journal records`);
                            }
                        }
                    }
                }
            }
            return;
        }
        // Check freshness
        const lastMsg = records.filter(r => r.type !== 'checkpoint').slice(-1)[0];
        if (!lastMsg)
            return;
        const ageMs = Date.now() - Number(lastMsg.ts);
        const maxAgeMs = cfg.maxContextAgeHours * 60 * 60 * 1000;
        // WQ-C Improvement 2: WORKQUEUE-gated extended restore
        let extendedRestore = false;
        let activeIds = [];
        let agentWorkspace = null;
        if (ageMs > maxAgeMs && cfg.workqueueGatedExtendedRestore && agentName) {
            agentWorkspace = resolveAgentWorkspace(agentName);
            if (agentWorkspace) {
                const wqPath = path.join(agentWorkspace, 'WORKQUEUE.md');
                activeIds = parseActiveWorkqueueItems(wqPath);
                if (activeIds.length > 0) {
                    extendedRestore = true;
                    if (process.env.DEBUG_CLAWTEXT) {
                        console.log(`[clawtext-restore] WORKQUEUE-gated extended restore for agent ${agentName}: ${activeIds.length} active items, age=${Math.round(ageMs / 3600000)}h`);
                    }
                }
            }
        }
        if (ageMs > maxAgeMs && !extendedRestore)
            return;
        const scorer = await loadScorerModule();
        const contextBlock = formatContextBlock(records, channelId, cfg, scorer, {
            crossChannel,
            minScoreOverride: crossChannel ? cfg.crossChannelMinScore : undefined,
        });
        if (contextBlock) {
            event.messages.push(contextBlock);
            if (process.env.DEBUG_CLAWTEXT) {
                const totalBytes = contextBlock.length;
                console.log(`[clawtext-restore] injected context block (${totalBytes} bytes) for channel ${channelId}${crossChannel ? ' [cross-channel]' : ''}${extendedRestore ? ' [extended]' : ''}`);
            }
        }
        // Inject WORKQUEUE restore block for extended restore
        if (extendedRestore && agentWorkspace && activeIds.length > 0) {
            const wqBlock = buildWorkqueueRestoreBlock(agentWorkspace, activeIds);
            if (wqBlock) {
                event.messages.push(wqBlock);
                if (process.env.DEBUG_CLAWTEXT) {
                    console.log(`[clawtext-restore] injected WORKQUEUE restore (${activeIds.length} active items) for agent ${agentName}`);
                }
            }
        }
    }
    catch (err) {
        if (process.env.DEBUG_CLAWTEXT) {
            console.error('[clawtext-restore] error:', err instanceof Error ? err.message : String(err));
        }
    }
};
export default handler;
//# sourceMappingURL=handler.js.map