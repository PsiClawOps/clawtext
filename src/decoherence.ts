/**
 * Decoherence Detection — Cross-Agent Memory Leak Logger
 *
 * Phase 5 of Gore's Decoherence Hardening Brief.
 * Logs when an agent's retrieval returns memories authored by a different agent.
 * Tracks frequency. Alerts when threshold exceeded.
 *
 * Output: state/clawtext/prod/decoherence/events.jsonl
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface DecoherenceEvent {
  timestamp: string;
  currentAgentId: string;
  leakedAgentId: string;
  memoryId: string;
  visibility: string;
  query: string;
  action: 'filtered' | 'leaked';
}

export interface DecoherenceStats {
  totalEvents: number;
  filteredCount: number;
  leakedCount: number;
  byAgent: Record<string, number>;
  since: string;
}

function getEventsPath(stateRoot?: string): string {
  const base = stateRoot ||
    join(process.env.HOME || '', '.openclaw', 'workspace', 'state', 'clawtext', 'prod');
  const dir = join(base, 'decoherence');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'events.jsonl');
}

/**
 * Log a decoherence event (cross-agent memory access).
 */
export function logDecoherenceEvent(event: DecoherenceEvent, stateRoot?: string): void {
  const path = getEventsPath(stateRoot);
  appendFileSync(path, JSON.stringify(event) + '\n');
}

/**
 * Get decoherence statistics from the event log.
 */
export function getDecoherenceStats(options?: {
  since?: string;
  stateRoot?: string;
}): DecoherenceStats {
  const eventsPath = getEventsPath(options?.stateRoot);
  if (!existsSync(eventsPath)) {
    return { totalEvents: 0, filteredCount: 0, leakedCount: 0, byAgent: {}, since: '' };
  }

  const lines = readFileSync(eventsPath, 'utf-8').split('\n').filter(Boolean);
  const sinceDate = options?.since ? new Date(options.since).getTime() : 0;
  
  let filtered = 0;
  let leaked = 0;
  const byAgent: Record<string, number> = {};

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as DecoherenceEvent;
      if (sinceDate && new Date(event.timestamp).getTime() < sinceDate) continue;
      
      if (event.action === 'filtered') filtered++;
      if (event.action === 'leaked') leaked++;
      byAgent[event.leakedAgentId] = (byAgent[event.leakedAgentId] || 0) + 1;
    } catch {
      // skip malformed lines
    }
  }

  return {
    totalEvents: filtered + leaked,
    filteredCount: filtered,
    leakedCount: leaked,
    byAgent,
    since: options?.since || '',
  };
}
