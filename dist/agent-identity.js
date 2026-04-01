/**
 * Agent Identity Module
 *
 * Handles agent identity propagation for multi-agent deployments.
 * Part of Phase 1: Identity Propagation (Gore's Decoherence Hardening Brief)
 *
 * References:
 * - docs/AGENT_TIER_ARCHITECTURE.md
 * - docs/AGENT_TIER_ARCHITECTURE.md (Gore's brief)
 */
import { readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
const DEFAULT_MULTI_AGENT_CONFIG = {
    enabled: false,
    defaultVisibility: 'shared',
};
/**
 * Resolve agent role from IDENTITY.md in the workspace.
 * Reads the **Role:** line and maps it to council/director/worker.
 * Falls back to path-based heuristic if IDENTITY.md is absent.
 */
function resolveRoleFromIdentityFile(workspacePath) {
    const identityPath = join(workspacePath, 'IDENTITY.md');
    if (!existsSync(identityPath))
        return null;
    try {
        const lines = readFileSync(identityPath, 'utf-8').split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*-\s*\*\*Role:\*\*\s*(.+)/i);
            if (match) {
                return mapRoleToTier(match[1]);
            }
        }
    }
    catch { /* fall through */ }
    return null;
}
/**
 * Resolve agent name from IDENTITY.md in the workspace.
 * Reads the **Name:** line and returns the agent name.
 * Returns null if IDENTITY.md is absent or has no Name line.
 */
function resolveNameFromIdentityFile(workspacePath) {
    const identityPath = join(workspacePath, 'IDENTITY.md');
    if (!existsSync(identityPath))
        return null;
    try {
        const lines = readFileSync(identityPath, 'utf-8').split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*-\s*\*\*Name:\*\*\s*(.+)/i);
            if (match) {
                return match[1].trim().toLowerCase();
            }
        }
    }
    catch { /* fall through */ }
    return null;
}
/**
 * Map a role string from IDENTITY.md to the AgentIdentity role type.
 * Handles specialist/research roles by mapping them to 'worker' tier
 * (since the type only supports council/director/worker).
 */
function mapRoleToTier(roleText) {
    const lower = roleText.toLowerCase();
    if (lower.includes('council'))
        return 'council';
    if (lower.includes('director'))
        return 'director';
    // Specialists, researchers, and everything else → worker tier
    return 'worker';
}
/**
 * Resolve agent identity from workspace path or config.
 *
 * Priority:
 * 1. Explicit config (clawtext.multiAgent.agentIdentity)
 * 2. IDENTITY.md in workspace (reads Name + Role — authoritative source)
 * 3. Workspace path derivation (workspace-council/{agent} → council role)
 * 4. Fallback to 'default'
 */
export function resolveAgentIdentity(workspacePath, config) {
    // Priority 1: Explicit config
    if (config?.agentIdentity) {
        return config.agentIdentity;
    }
    // Priority 2: IDENTITY.md — the authoritative identity source
    // This handles ALL workspace patterns (council, director, research, custom)
    // without needing to enumerate path patterns.
    const identityName = resolveNameFromIdentityFile(workspacePath);
    const identityRole = resolveRoleFromIdentityFile(workspacePath);
    if (identityName && identityRole !== null) {
        return {
            agentId: identityName,
            agentRole: identityRole,
            agentName: identityName,
            workspacePath,
        };
    }
    // Priority 3: Derive from workspace path structure
    // Fallback for agents that don't have IDENTITY.md yet.
    const pathParts = workspacePath.split('/');
    // Known workspace patterns: workspace-council, workspace-director, workspace-research
    const workspacePatterns = [
        { pattern: 'workspace-council', defaultRole: 'council' },
        { pattern: 'workspace-director', defaultRole: 'director' },
        { pattern: 'workspace-research', defaultRole: 'worker' },
    ];
    for (const { pattern, defaultRole } of workspacePatterns) {
        const index = pathParts.indexOf(pattern);
        if (index !== -1 && index < pathParts.length - 1) {
            const agentDir = pathParts[index + 1];
            // If we got a partial read from IDENTITY.md (name or role but not both),
            // use what we got and fill in the rest from the path.
            const role = identityRole ?? defaultRole;
            const name = identityName ?? agentDir;
            return {
                agentId: name,
                agentRole: role,
                agentName: name,
                workspacePath,
            };
        }
    }
    // Priority 4: Fallback — use directory name as agent ID
    // Even without a known workspace pattern, try the directory basename
    const dirName = basename(workspacePath);
    if (identityName || identityRole !== null) {
        // Partial IDENTITY.md read — use what we have
        return {
            agentId: identityName ?? dirName,
            agentRole: identityRole ?? 'worker',
            agentName: identityName ?? dirName,
            workspacePath,
        };
    }
    return {
        agentId: 'default',
        agentRole: 'worker',
        agentName: 'default',
        workspacePath,
    };
}
/**
 * Load multi-agent config from openclaw.json or environment variables
 *
 * Uses a walk-up approach to find the config file, starting from the workspace directory.
 * Falls back to ~/.openclaw/openclaw.json as the canonical location.
 * Also checks environment variables for activation.
 */
export function loadMultiAgentConfig(workspacePath) {
    // Check env vars first (explicit override)
    const envEnabled = process.env.CLAWTEXT_MULTIAGENT_ENABLED;
    const envVisibility = process.env.CLAWTEXT_DEFAULT_VISIBILITY;
    const envAgentId = process.env.CLAWTEXT_AGENT_ID;
    const envAgentRole = process.env.CLAWTEXT_AGENT_ROLE;
    const envAgentName = process.env.CLAWTEXT_AGENT_NAME;
    if (envEnabled === 'true') {
        const config = {
            enabled: true,
            defaultVisibility: envVisibility || 'private',
        };
        // Only use env var identity when workspace matches the default (env var owner's session).
        // For non-default workspaces (other agents), skip env identity — let workspace path
        // derivation in resolveAgentIdentity() determine the correct agent.
        // This prevents the gateway's env vars from bleeding one agent's identity into all agents.
        const defaultWorkspace = join(process.env.HOME || '', '.openclaw', 'workspace');
        const isDefaultWorkspace = !workspacePath || workspacePath === defaultWorkspace;
        if (envAgentId && isDefaultWorkspace) {
            config.agentIdentity = {
                agentId: envAgentId,
                agentRole: envAgentRole || 'worker',
                agentName: envAgentName || envAgentId,
                workspacePath,
            };
        }
        return config;
    }
    // Strategy: Walk up from workspace until we find openclaw.json
    // Fall back to canonical ~/.openclaw/openclaw.json
    // dirname, join, existsSync, readFileSync all imported at module scope
    // Start at workspace, walk up to find config
    let searchPath = workspacePath;
    const maxWalk = 10; // prevent infinite loop
    for (let i = 0; i < maxWalk; i++) {
        const configPath = join(searchPath, 'openclaw.json');
        if (existsSync(configPath)) {
            try {
                const raw = readFileSync(configPath, 'utf-8');
                const config = JSON.parse(raw);
                const clawtext = config?.clawtext || {};
                const multiAgent = clawtext?.multiAgent;
                if (!multiAgent) {
                    return DEFAULT_MULTI_AGENT_CONFIG;
                }
                return {
                    enabled: multiAgent.enabled ?? DEFAULT_MULTI_AGENT_CONFIG.enabled,
                    defaultVisibility: multiAgent.defaultVisibility ?? DEFAULT_MULTI_AGENT_CONFIG.defaultVisibility,
                    agentIdentity: multiAgent.agentIdentity,
                };
            }
            catch {
                // Corrupted config, fall through
            }
        }
        // Move up one directory
        const parent = dirname(searchPath);
        if (parent === searchPath)
            break; // hit filesystem root
        searchPath = parent;
    }
    // Final fallback: canonical location
    const canonicalPath = join(process.env.HOME || '', '.openclaw', 'openclaw.json');
    if (existsSync(canonicalPath)) {
        try {
            const raw = readFileSync(canonicalPath, 'utf-8');
            const config = JSON.parse(raw);
            const clawtext = config?.clawtext || {};
            const multiAgent = clawtext?.multiAgent;
            if (!multiAgent) {
                return DEFAULT_MULTI_AGENT_CONFIG;
            }
            return {
                enabled: multiAgent.enabled ?? DEFAULT_MULTI_AGENT_CONFIG.enabled,
                defaultVisibility: multiAgent.defaultVisibility ?? DEFAULT_MULTI_AGENT_CONFIG.defaultVisibility,
                agentIdentity: multiAgent.agentIdentity,
            };
        }
        catch {
            return DEFAULT_MULTI_AGENT_CONFIG;
        }
    }
    return DEFAULT_MULTI_AGENT_CONFIG;
}
/**
 * Get the default visibility for memories in multi-agent mode.
 * In council mode, default is 'private' (per Gore's brief).
 * In single-agent mode, default is 'shared'.
 */
export function getDefaultVisibility(config) {
    if (!config.enabled) {
        return 'shared'; // Single-agent mode
    }
    return config.defaultVisibility;
}
/**
 * Determine if we're running in multi-agent mode
 */
export function isMultiAgentMode(workspacePath) {
    const config = loadMultiAgentConfig(workspacePath);
    return config.enabled;
}
//# sourceMappingURL=agent-identity.js.map