import type { DatabaseSync } from 'node:sqlite';

export type PressureSignals = {
  fillRatio: number;
  velocityRatio: number;
  noiseRatio: number;
};

export type PressureBand = 'low' | 'moderate' | 'elevated' | 'critical' | 'emergency';

export type PressureAction =
  | 'none'
  | 'monitor'
  | 'proactive_pass'
  | 'compact'
  | 'emergency_compact';

export type PressureReading = {
  signals: PressureSignals;
  band: PressureBand;
  score: number;
  recommendedAction: PressureAction;
};

export const PRESSURE_THRESHOLDS = {
  fill: {
    moderate: 0.50,
    elevated: 0.65,
    critical: 0.75,
    emergency: 0.85,
  },
  velocity: {
    moderate: 0.30,
    elevated: 0.55,
    critical: 0.75,
  },
  noise: {
    moderate: 0.20,
    elevated: 0.35,
    critical: 0.50,
  },
} as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function computePressureScore(signals: PressureSignals): number {
  const score =
    (signals.fillRatio * 0.5)
    + (signals.velocityRatio * 0.3)
    + (signals.noiseRatio * 0.2);

  return clamp01(score);
}

export function classifyPressureBand(signals: PressureSignals): PressureBand {
  if (signals.fillRatio >= PRESSURE_THRESHOLDS.fill.emergency) {
    return 'emergency';
  }

  const score = computePressureScore(signals);

  if (score >= 0.70) return 'critical';
  if (score >= 0.50) return 'elevated';
  if (score >= 0.30) return 'moderate';
  return 'low';
}

export function bandToAction(band: PressureBand): PressureAction {
  switch (band) {
    case 'emergency':
      return 'emergency_compact';
    case 'critical':
      return 'compact';
    case 'elevated':
      return 'proactive_pass';
    case 'moderate':
      return 'monitor';
    case 'low':
      return 'none';
    default:
      return 'none';
  }
}

export function buildPressureReading(signals: PressureSignals): PressureReading {
  const band = classifyPressureBand(signals);

  return {
    signals,
    band,
    score: computePressureScore(signals),
    recommendedAction: bandToAction(band),
  };
}

export function computePressureSignals(
  db: DatabaseSync,
  conversationId: number,
  tokenBudget: number,
  velocityWindowTurns: number = 10,
): PressureSignals {
  const safeTokenBudget = Number.isFinite(tokenBudget) && tokenBudget > 0 ? tokenBudget : 1;
  const safeVelocityWindowTurns =
    Number.isFinite(velocityWindowTurns) && velocityWindowTurns > 0
      ? Math.floor(velocityWindowTurns)
      : 10;

  const fillRow = db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(token_count, length(content) / 4)), 0) AS total_tokens
         FROM messages
        WHERE conversation_id = ?`,
    )
    .get(conversationId) as { total_tokens: number | null };

  const totalTokens = typeof fillRow.total_tokens === 'number' ? fillRow.total_tokens : 0;
  const fillRatio = clamp01(totalTokens / safeTokenBudget);

  const velocityWindowMessages = Math.max(1, safeVelocityWindowTurns * 4);
  const velocityRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM (
           SELECT id
             FROM messages
            WHERE conversation_id = ?
            ORDER BY message_index DESC
            LIMIT ?
         )`,
    )
    .get(conversationId, velocityWindowMessages) as { count: number | null };

  const velocityCount = typeof velocityRow.count === 'number' ? velocityRow.count : 0;
  const velocityRatio = clamp01(velocityCount / velocityWindowMessages);

  const noiseRow = db
    .prepare(
      `SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN content_type IN ('noise', 'resolved') THEN 1 ELSE 0 END) AS noise_or_resolved_count
         FROM messages
        WHERE conversation_id = ?`,
    )
    .get(conversationId) as { total_count: number | null; noise_or_resolved_count: number | null };

  const totalCount = typeof noiseRow.total_count === 'number' ? noiseRow.total_count : 0;
  const noiseCount = typeof noiseRow.noise_or_resolved_count === 'number' ? noiseRow.noise_or_resolved_count : 0;
  const noiseRatio = totalCount > 0 ? clamp01(noiseCount / totalCount) : 0;

  return {
    fillRatio,
    velocityRatio,
    noiseRatio,
  };
}
