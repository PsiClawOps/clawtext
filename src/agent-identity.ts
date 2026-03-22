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
import { join, basename } from 'path';

export interface AgentIdentity {
  agentId: string;
  agentRole: 'council' | 'director' | 'worker';
  agentName: string;
  workspacePath: string;
}

export interface ClawTextMultiAgentConfig {
  enabled: boolean;
  defaultVisibility: 'private' | 'shared' | 'council';
  agentIdentity?: AgentIdentity;
}

const DEFAULT_MULTI_AGENT_CONFIG: ClawTextMultiAgentConfig = {
  enabled: false,
  defaultVisibility: 'shared',
};

/**
 * Resolve agent identity from workspace path or config.
 * 
 * Priority:
 * 1. Explicit config (clawtext.multiAgent.agentIdentity)
 * 2. Workspace path derivation (workspace-council/{agent} → council role)
 * 3. Fallback to 'default'
 */
export function resolveAgentIdentity(workspacePath: string, config?: ClawTextMultiAgentConfig): AgentIdentity {
  // Priority 1: Explicit config
  if (config?.agentIdentity) {
    return config.agentIdentity;
  }

  // Priority 2: Derive from workspace path structure
  // E.g., /home/.../workspace-council/gore-antagonist → council role, agent "gore-antagonist"
  // Works for any council seat: gore-antagonist, sentinel-security, compass-vision, etc.
  
  const pathParts = workspacePath.split('/');
  const councilIndex = pathParts.indexOf('workspace-council');
  
  if (councilIndex !== -1 && councilIndex < pathParts.length - 1) {
    const agentDir = pathParts[councilIndex + 1]; // e.g., "gore-antagonist"
    return {
      agentId: agentDir,
      agentRole: 'council',
      agentName: agentDir,
      workspacePath,
    };
  }

  // Also check for workspace-director pattern (future Directors tier)
  const directorIndex = pathParts.indexOf('workspace-director');
  if (directorIndex !== -1 && directorIndex < pathParts.length - 1) {
    const agentDir = pathParts[directorIndex + 1];
    return {
      agentId: agentDir,
      agentRole: 'director',
      agentName: agentDir,
      workspacePath,
    };
  }

  // Priority 3: Fallback
  return {
    agentId: 'default',
    agentRole: 'worker',
    agentName: 'default',
    workspacePath,
  };
}

/**
 * Load multi-agent config from openclaw.json
 * 
 * Uses a walk-up approach to find the config file, starting from the workspace directory.
 * Falls back to ~/.openclaw/openclaw.json as the canonical location.
 */
export function loadMultiAgentConfig(workspacePath: string): ClawTextMultiAgentConfig {
  // Strategy: Walk up from workspace until we find openclaw.json
  // Fall back to canonical ~/.openclaw/openclaw.json
  
  const { dirname, join } = require('path');
  const { existsSync } = require('fs');
  
  // Start at workspace, walk up to find config
  let searchPath = workspacePath;
  const maxWalk = 10; // prevent infinite loop
  
  for (let i = 0; i < maxWalk; i++) {
    const configPath = join(searchPath, 'openclaw.json');
    if (existsSync(configPath)) {
      try {
        const raw = require('fs').readFileSync(configPath, 'utf-8');
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
      } catch {
        // Corrupted config, fall through
      }
    }
    
    // Move up one directory
    const parent = dirname(searchPath);
    if (parent === searchPath) break; // hit filesystem root
    searchPath = parent;
  }
  
  // Final fallback: canonical location
  const canonicalPath = join(process.env.HOME || '', '.openclaw', 'openclaw.json');
  if (existsSync(canonicalPath)) {
    try {
      const raw = require('fs').readFileSync(canonicalPath, 'utf-8');
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
    } catch {
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
export function getDefaultVisibility(config: ClawTextMultiAgentConfig): 'private' | 'shared' | 'council' {
  if (!config.enabled) {
    return 'shared'; // Single-agent mode
  }
  return config.defaultVisibility;
}

/**
 * Determine if we're running in multi-agent mode
 */
export function isMultiAgentMode(workspacePath: string): boolean {
  const config = loadMultiAgentConfig(workspacePath);
  return config.enabled;
}