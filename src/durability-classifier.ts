import type { OperationalMemory } from './operational.js';

export type DurabilityLabel = 'durable' | 'borderline' | 'transient';

export interface DurabilityAssessment {
  score: number;
  label: DurabilityLabel;
  reasons: string[];
  adjustment: number;
}

const TRANSIENT_HINTS = [
  'today',
  'for now',
  'temporary',
  'transient',
  'session',
  'right now',
  'this run',
  'one-off',
  'retry once',
  'ephemeral',
];

export function classifyDurability(entry: OperationalMemory): DurabilityAssessment {
  let score = 0.5;
  const reasons: string[] = [];

  if (entry.recurrenceCount >= 3) {
    score += 0.12;
    reasons.push('High recurrence suggests durable guidance value.');
  } else if (entry.recurrenceCount === 2) {
    score += 0.05;
    reasons.push('Repeated pattern observed more than once.');
  }

  if (entry.confidence >= 0.75) {
    score += 0.08;
    reasons.push('High confidence pattern extraction.');
  } else if (entry.confidence < 0.55) {
    score -= 0.08;
    reasons.push('Lower confidence suggests caution for promotion.');
  }

  if (entry.rootCause && entry.rootCause !== 'TBD') {
    score += 0.06;
    reasons.push('Root cause identified.');
  }

  if (entry.fix && entry.fix !== 'TBD') {
    score += 0.08;
    reasons.push('Actionable fix captured.');
  }

  const body = `${entry.summary} ${entry.symptom} ${entry.trigger} ${entry.rootCause} ${entry.fix}`.toLowerCase();
  const transientHits = TRANSIENT_HINTS.filter((h) => body.includes(h));
  if (transientHits.length > 0) {
    const penalty = Math.min(0.16, transientHits.length * 0.04);
    score -= penalty;
    reasons.push(`Transient wording detected (${transientHits.slice(0, 3).join(', ')}).`);
  }

  if (entry.scope === 'agent' || entry.scope === 'gateway' || entry.scope === 'project') {
    score += 0.04;
    reasons.push('Scope likely impacts repeatable system behavior.');
  }

  score = Math.max(0, Math.min(1, score));

  let label: DurabilityLabel = 'borderline';
  let adjustment = 0;
  if (score >= 0.66) {
    label = 'durable';
    adjustment = 0.05;
  } else if (score < 0.45) {
    label = 'transient';
    adjustment = -0.08;
  }

  return { score, label, reasons, adjustment };
}
