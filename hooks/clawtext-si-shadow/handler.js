import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
const DEFAULT_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
// Absolute path to the clawtext dist/session-intelligence module.
// Computed at load time so it resolves correctly regardless of where this
// hook file is deployed (source tree vs installed ~/.openclaw/hooks/).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Walk up from the hook's actual location to find the clawtext dist.
// Deployed path: ~/.openclaw/hooks/clawtext-si-shadow/handler.js  → need to reach repo
// Source path:   .../clawtext/hooks/clawtext-si-shadow/handler.ts → ../../dist works
// Strategy: try relative first (source tree), fall back to known absolute install path.
function resolveSIDistPath() {
    const candidates = [
        // Source tree: hooks/clawtext-si-shadow/ → ../../dist/
        path.resolve(__dirname, '../../dist/session-intelligence/index.js'),
        // Deployed hook: ~/.openclaw/hooks/clawtext-si-shadow/ → known repo dist
        path.join(os.homedir(), '.openclaw', 'workspace', 'repo', 'clawtext', 'dist', 'session-intelligence', 'index.js'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    // Return the absolute known path even if not found — will fail with a clear error
    return candidates[1];
}
const SI_DIST_PATH = resolveSIDistPath();
// ── Module-level cache ────────────────────────────────────────────────────────
// Per-workspace SI engine instances, keyed by resolved workspace path.
// The hook owns these independently of the registration lifecycle —
// we don't rely on getRegisteredSIEngine() because the factory runs lazily
// (only when the first session uses the context engine), which is too late
// for shadow ingest on the first message.
const _workspaceEngines = new Map();
let _siModuleLoaded = null; // null = not yet attempted
// Workspace path cache: sessionKey → workspacePath
const workspaceCache = new Map();
// Track which session keys we've already logged event shapes for (diagnostic, one-shot per session)
const _loggedEventShapes = new Set();
// ── Workspace resolution ──────────────────────────────────────────────────────
/**
 * Parse agentId from a sessionKey in format `agent:<agentId>:...`
 */
function extractAgentId(sessionKey) {
    if (!sessionKey)
        return null;
    const parts = sessionKey.split(':');
    if (parts[0] === 'agent' && parts[1])
        return parts[1];
    return null;
}
/**
 * Resolve workspace path for an agentId by reading openclaw.json agents config.
 *
 * Mirrors the gateway's `resolveAgentWorkspaceDir` logic without requiring the
 * api object. Falls through to DEFAULT_WORKSPACE on any failure.
 */
function resolveWorkspaceForAgentId(agentId) {
    try {
        if (!fs.existsSync(OPENCLAW_CONFIG_PATH))
            return DEFAULT_WORKSPACE;
        const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
        // Primary format: agents.list array with { id, workspace } entries
        const agentsList = cfg?.agents?.list;
        if (Array.isArray(agentsList)) {
            const entry = agentsList.find((a) => a.id === agentId || a.name === agentId);
            // Field is "workspace" (not "workspaceDir") per observed openclaw.json schema
            const ws = entry?.workspace ?? entry?.workspaceDir;
            if (ws && typeof ws === 'string')
                return ws;
        }
        // Legacy format: agents.entries object keyed by agentId
        const agentsEntries = cfg?.agents?.entries;
        if (agentsEntries && agentsEntries[agentId]) {
            const ws = agentsEntries[agentId].workspace ?? agentsEntries[agentId].workspaceDir;
            if (ws && typeof ws === 'string')
                return ws;
        }
    }
    catch {
        // fall through
    }
    return DEFAULT_WORKSPACE;
}
/**
 * Resolve the workspace path for a session, with caching.
 * Uses sessionKey → agentId → openclaw.json agents config → workspacePath.
 */
function resolveWorkspace(sessionKey) {
    if (workspaceCache.has(sessionKey))
        return workspaceCache.get(sessionKey);
    let workspacePath = DEFAULT_WORKSPACE;
    const agentId = extractAgentId(sessionKey);
    if (agentId) {
        workspacePath = resolveWorkspaceForAgentId(agentId);
    }
    workspaceCache.set(sessionKey, workspacePath);
    return workspacePath;
}
// ── SI engine resolution ──────────────────────────────────────────────────────
/**
 * Get or create a per-workspace SI engine instance directly.
 *
 * We do NOT use getRegisteredSIEngine() here. The registered router is populated
 * by the plugin factory, which only runs lazily when the first session invokes the
 * context engine. On a fresh gateway start the hook fires before any session has
 * bootstrapped, so the registry is empty. Instead, we instantiate engines directly
 * via createSessionIntelligenceEngine — the same constructor the plugin uses.
 */
async function getWorkspaceEngine(workspacePath) {
    const cached = _workspaceEngines.get(workspacePath);
    if (cached)
        return cached;
    // Only attempt to load the module once
    if (_siModuleLoaded === false)
        return null;
    try {
        const mod = await import(SI_DIST_PATH);
        const createFn = mod.createSessionIntelligenceEngine;
        if (typeof createFn !== 'function') {
            console.warn(`[clawtext-si-shadow] createSessionIntelligenceEngine not found in ${SI_DIST_PATH}`);
            _siModuleLoaded = false;
            return null;
        }
        _siModuleLoaded = true;
        // Read SI config from openclaw.json to match the main plugin's settings
        let siConfig = {};
        try {
            const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
            siConfig = cfg?.plugins?.entries?.clawtext?.config?.sessionIntelligence ?? {};
        }
        catch {
            // use defaults
        }
        const libraryEntriesDir = path.join(workspacePath, 'state', 'clawtext', 'prod', 'library', 'entries');
        const engine = createFn({
            ...siConfig,
            workspacePath,
            libraryEntriesDir,
        });
        _workspaceEngines.set(workspacePath, engine);
        console.info(`[clawtext-si-shadow] created SI engine for workspace: ${workspacePath}`);
        return engine;
    }
    catch (err) {
        _siModuleLoaded = false;
        console.warn(`[clawtext-si-shadow] Failed to create SI engine for ${workspacePath}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
// ── Message extraction ────────────────────────────────────────────────────────
/**
 * Extract a normalized AgentMessage from the hook event.
 *
 * Gateway message hook event shape (observed in production):
 *   event.type: string        (e.g. "message:received")
 *   event.action: string
 *   event.sessionKey: string
 *   event.context: {
 *     from: string            ← role equivalent ("user" | "assistant" | "system" | agent name)
 *     content: string | unknown
 *     timestamp: ...
 *     channelId, accountId, conversationId, messageId, metadata
 *   }
 *   event.messages: Array     ← empty on lifecycle events
 *
 * Normalized AgentMessage shape for SI ingest: { role, content }
 */
function extractMessage(event) {
    // Path 1: gateway context envelope — event.context.from + event.context.content
    const ctx = event.context;
    if (ctx && typeof ctx === 'object') {
        const from = ctx.from;
        const content = ctx.content;
        if (content !== undefined && content !== null && content !== '') {
            // Normalize "from" to SI role.
            // Gateway sends empty string for inbound user messages on webchat (observed in production).
            // "assistant" / agent name / anything else → assistant.
            let role;
            if (!from || from === '' || from === 'user') {
                role = 'user';
            }
            else if (from === 'system') {
                role = 'system';
            }
            else {
                // "assistant", agent name, or anything else → treat as assistant
                role = 'assistant';
            }
            return { role, content };
        }
    }
    // Path 2: explicit message object with role field (future-proofing / other event shapes)
    const msg = event.message ?? event.data;
    if (msg && typeof msg === 'object') {
        const candidate = msg;
        const role = candidate.role;
        if (role && (role === 'user' || role === 'assistant' || role === 'system')) {
            return candidate;
        }
    }
    return null;
}
// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event, ctx) => {
    try {
        // Message hooks are typically invoked with a single event object carrying
        // runtime context at event.context. Accept both forms defensively.
        const hookCtx = (ctx ?? event.context ?? {});
        // Skip heartbeat sessions — don't pollute SI DB with heartbeat noise
        if (event.isHeartbeat || hookCtx.isHeartbeat)
            return;
        const sessionKey = hookCtx.sessionKey || hookCtx.sessionId || event.sessionKey || '';
        if (!sessionKey) {
            console.warn('[clawtext-si-shadow] skip: missing sessionKey');
            return;
        }
        console.info(`[clawtext-si-shadow] event received for ${sessionKey}`);
        // Dump event shape + context values once per unique sessionKey to diagnose extractMessage failures.
        if (!_loggedEventShapes.has(sessionKey)) {
            _loggedEventShapes.add(sessionKey);
            const shape = {};
            for (const k of Object.keys(event)) {
                const v = event[k];
                shape[k] = Array.isArray(v) ? `Array(${v.length})` : typeof v;
            }
            console.info(`[clawtext-si-shadow] event shape for ${sessionKey}: ${JSON.stringify(shape)}`);
            if (event.context && typeof event.context === 'object') {
                const ctx = event.context;
                // Log actual values (truncated) to diagnose extractMessage path
                const ctxValues = {};
                for (const k of Object.keys(ctx)) {
                    const v = ctx[k];
                    ctxValues[k] = typeof v === 'string' ? v.slice(0, 120) : (v === null ? 'null' : typeof v);
                }
                console.info(`[clawtext-si-shadow] event.context values for ${sessionKey}: ${JSON.stringify(ctxValues)}`);
            }
            console.info(`[clawtext-si-shadow] event.type=${event.type} event.action=${event.action}`);
        }
        const message = extractMessage(event);
        if (!message) {
            console.warn(`[clawtext-si-shadow] skip: extractMessage returned null for ${sessionKey}`);
            return;
        }
        const workspacePath = hookCtx.workspaceDir || resolveWorkspace(sessionKey);
        const engine = await getWorkspaceEngine(workspacePath);
        if (!engine) {
            console.warn(`[clawtext-si-shadow] skip: SI engine unavailable for ${sessionKey} (workspace: ${workspacePath})`);
            return;
        }
        console.info(`[clawtext-si-shadow] ingest start for ${sessionKey} (workspace: ${workspacePath}, role: ${message.role})`);
        await engine.ingest({
            sessionId: sessionKey,
            message,
        });
        console.info(`[clawtext-si-shadow] ingest success for ${sessionKey} (workspace: ${workspacePath})`);
    }
    catch (err) {
        // Never throw from a shadow hook — legacy must be unaffected
        console.warn(`[clawtext-si-shadow] ingest error: ${err instanceof Error ? err.message : String(err)}`);
    }
};
export default handler;
//# sourceMappingURL=handler.js.map