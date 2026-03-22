/**
 * Council Memory Bus
 *
 * Phase 6 of Gore's Decoherence Hardening Brief.
 * Lightweight inter-agent memory sharing with explicit attribution.
 *
 * Provides:
 * - broadcastToCouncil() — share a memory with all council members
 * - sendToAgent() — direct a memory to a specific agent
 * - getCouncilMemories() — read shared council lane
 * - getDirectedMemories() — read memories targeted to this agent
 *
 * Storage: state/clawtext/prod/council-bus/
 *   shared.jsonl     — council-wide broadcasts
 *   directed.jsonl   — agent-to-agent directed memories
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type CouncilMessageType = 'decision' | 'escalation' | 'policy' | 'announcement' | 'question' | 'review-request';
export type CouncilSeverity = 'info' | 'warning' | 'critical';

export interface CouncilMessage {
  id: string;
  timestamp: string;
  sourceAgent: string;
  type: CouncilMessageType;
  severity: CouncilSeverity;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface DirectedMessage extends CouncilMessage {
  targetAgent: string;
}

// ──────────────────────────────────────────────
// Path helpers
// ──────────────────────────────────────────────

function getBusRoot(stateRoot?: string): string {
  const base = stateRoot ||
    join(process.env.HOME || '', '.openclaw', 'workspace', 'state', 'clawtext', 'prod');
  const dir = join(base, 'council-bus');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getSharedPath(stateRoot?: string): string {
  return join(getBusRoot(stateRoot), 'shared.jsonl');
}

function getDirectedPath(stateRoot?: string): string {
  return join(getBusRoot(stateRoot), 'directed.jsonl');
}

// ──────────────────────────────────────────────
// Write operations
// ──────────────────────────────────────────────

/**
 * Broadcast a memory to all council members.
 * Creates a council-visibility memory with explicit source attribution.
 */
export function broadcastToCouncil(
  content: string,
  metadata: {
    sourceAgent: string;
    type: CouncilMessageType;
    severity?: CouncilSeverity;
    extra?: Record<string, unknown>;
  },
  stateRoot?: string
): CouncilMessage {
  const message: CouncilMessage = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    sourceAgent: metadata.sourceAgent,
    type: metadata.type,
    severity: metadata.severity || 'info',
    content,
    metadata: metadata.extra,
  };

  appendFileSync(getSharedPath(stateRoot), JSON.stringify(message) + '\n');
  return message;
}

/**
 * Send a directed memory to a specific agent.
 * Only visible to the sender and target.
 */
export function sendToAgent(
  targetAgent: string,
  content: string,
  metadata: {
    sourceAgent: string;
    type: CouncilMessageType;
    severity?: CouncilSeverity;
    extra?: Record<string, unknown>;
  },
  stateRoot?: string
): DirectedMessage {
  const message: DirectedMessage = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    sourceAgent: metadata.sourceAgent,
    targetAgent,
    type: metadata.type,
    severity: metadata.severity || 'info',
    content,
    metadata: metadata.extra,
  };

  appendFileSync(getDirectedPath(stateRoot), JSON.stringify(message) + '\n');
  return message;
}

// ──────────────────────────────────────────────
// Read operations
// ──────────────────────────────────────────────

/**
 * Get council-wide broadcast messages.
 */
export function getCouncilMemories(options?: {
  since?: string;
  limit?: number;
  type?: CouncilMessageType;
  stateRoot?: string;
}): CouncilMessage[] {
  const path = getSharedPath(options?.stateRoot);
  if (!existsSync(path)) return [];

  const sinceMs = options?.since ? new Date(options.since).getTime() : 0;
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  
  let messages: CouncilMessage[] = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as CouncilMessage;
      if (sinceMs && new Date(msg.timestamp).getTime() < sinceMs) continue;
      if (options?.type && msg.type !== options.type) continue;
      messages.push(msg);
    } catch {
      // skip malformed
    }
  }

  if (options?.limit) {
    messages = messages.slice(-options.limit);
  }

  return messages;
}

/**
 * Get directed messages for a specific agent.
 */
export function getDirectedMemories(
  agentId: string,
  options?: {
    since?: string;
    limit?: number;
    stateRoot?: string;
  }
): DirectedMessage[] {
  const path = getDirectedPath(options?.stateRoot);
  if (!existsSync(path)) return [];

  const sinceMs = options?.since ? new Date(options.since).getTime() : 0;
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  
  let messages: DirectedMessage[] = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as DirectedMessage;
      if (msg.targetAgent !== agentId && msg.sourceAgent !== agentId) continue;
      if (sinceMs && new Date(msg.timestamp).getTime() < sinceMs) continue;
      messages.push(msg);
    } catch {
      // skip malformed
    }
  }

  if (options?.limit) {
    messages = messages.slice(-options.limit);
  }

  return messages;
}

/**
 * Get council bus status summary.
 */
export function getCouncilBusStatus(stateRoot?: string): {
  sharedCount: number;
  directedCount: number;
  lastShared: string | null;
  lastDirected: string | null;
} {
  const shared = getCouncilMemories({ stateRoot });
  const directedPath = getDirectedPath(stateRoot);
  
  let directedCount = 0;
  let lastDirected: string | null = null;
  if (existsSync(directedPath)) {
    const lines = readFileSync(directedPath, 'utf-8').split('\n').filter(Boolean);
    directedCount = lines.length;
    if (lines.length > 0) {
      try {
        lastDirected = (JSON.parse(lines[lines.length - 1]) as DirectedMessage).timestamp;
      } catch { /* skip */ }
    }
  }

  return {
    sharedCount: shared.length,
    directedCount,
    lastShared: shared.length > 0 ? shared[shared.length - 1].timestamp : null,
    lastDirected,
  };
}
