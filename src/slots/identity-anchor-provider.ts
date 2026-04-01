/**
 * Identity Anchor Slot Provider
 *
 * Injects a compact identity block at the start of every prompt.
 * Phase 3: Identity Anchor Slot (Gore's Decoherence Hardening Brief)
 *
 * Fights persona drift when context window fills with mixed-agent memories.
 * Reads from agent's SOUL.md at session start — never cached.
 * Pattern follows operator-recall-anchor (always-include, prunable: false).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveAgentIdentity, loadMultiAgentConfig, type AgentIdentity } from '../agent-identity.js';

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function extractSoulAnchors(soulPath: string): string {
  if (!existsSync(soulPath)) return '';

  try {
    const lines = readFileSync(soulPath, 'utf-8').split('\n');
    const anchorLines: string[] = [];
    let inSection = false;

    for (const line of lines) {
      if (line.match(/^#{1,3}\s*(The Anchor|Core Truths|Who You Are|Boundaries|Vibe)/i)) {
        inSection = true;
        continue;
      }
      if (inSection && line.match(/^#{1,3}\s/)) break;
      if (inSection && line.trim()) anchorLines.push(line.trim());
    }

    // Fallback: first 8 non-blank lines
    const src = anchorLines.length > 0
      ? anchorLines
      : lines.slice(0, 20).map(l => l.trim()).filter(Boolean);

    return src.slice(0, 8).join('\n');
  } catch {
    return '';
  }
}

function extractRoleGuidance(identity: AgentIdentity, workspacePath: string): string {
  const id = identity.agentId.toLowerCase();

  // Special cases for known adversarial/security-specific agents
  if (id.includes('gore') || id.includes('antagonist'))
    return 'Adversarial review. Challenge assumptions. Name risks explicitly. Never agree without substance.';
  if (id.includes('sentinel') || id.includes('security'))
    return 'Security review. Identify vulnerabilities. Surface threat models. Never assume systems are safe.';

  // Try to extract directive from SOUL.md "The Anchor" section
  const soulPath = join(workspacePath, 'SOUL.md');
  if (existsSync(soulPath)) {
    try {
      const lines = readFileSync(soulPath, 'utf-8').split('\n');
      let inAnchor = false;
      for (const line of lines) {
        if (line.match(/^#{1,3}\s*The Anchor/i)) { inAnchor = true; continue; }
        if (inAnchor && line.match(/^#{1,3}\s/)) break;
        if (inAnchor && line.trim()) {
          // First non-blank line after "The Anchor" heading — use as directive
          const stripped = line.replace(/^>\s*/, '').replace(/\*\*/g, '').trim();
          if (stripped.length > 10) return stripped.slice(0, 120);
        }
      }
    } catch { /* fall through */ }
  }

  // Final fallback by role
  const byRole: Record<string, string> = {
    council: 'Strategic oversight. Maintain independent perspective. Challenge assumptions before conclusions.',
    director: 'Domain ownership. Operational excellence. Coordinate with other directors for integration.',
    worker: 'Task execution. Focus on the immediate goal.',
  };
  return byRole[identity.agentRole] ?? byRole.worker;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Build the identity anchor content to inject into the prompt.
 * Returns null in single-agent mode (multi-agent not enabled).
 * Reads SOUL.md fresh on every call — not cached.
 */
export function extractIdentityAnchorContent(workspacePath: string): string | null {
  const config = loadMultiAgentConfig(workspacePath);
  if (!config.enabled) return null;

  const identity = resolveAgentIdentity(workspacePath, config);

  // TUNE-007: a "default/worker" identity anchor is worse than no anchor —
  // it actively misleads models with wrong identity. Return null to suppress.
  if (identity.agentId === 'default') return null;

  const soulAnchors = extractSoulAnchors(join(workspacePath, 'SOUL.md'));
  const roleGuidance = extractRoleGuidance(identity, workspacePath);

  const parts = [
    `## Identity Anchor`,
    `**Agent:** ${identity.agentName} (${identity.agentId})`,
    `**Tier:** ${identity.agentRole}`,
    `**Directive:** ${roleGuidance}`,
  ];

  if (soulAnchors) {
    parts.push(``, `**Core:**`, soulAnchors);
  }

  return parts.join('\n');
}
