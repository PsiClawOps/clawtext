export type ContentType =
  | 'decision'
  | 'spec'
  | 'preference'
  | 'skill'
  | 'attribute'
  | 'discussion'
  | 'ack'
  | 'noise';

export interface ContentTypeResult {
  type: ContentType;
  confidence: number;
  halfLifeDays: number;
}

const DECISION_PATTERNS = [
  /\bdecided\b/i,
  /\bthe approach is\b/i,
  /\bwe(?:'|’)ll go with\b/i,
  /\bthe plan is\b/i,
];

const SPEC_PATTERNS = [
  /```[\s\S]*?```/m,
  /\binterface\s+[A-Za-z0-9_]+/,
  /\btype\s+[A-Za-z0-9_]+\s*=/,
  /\barchitecture\b/i,
  /\bapi\b/i,
  /\bcontract\b/i,
];

const PREFERENCE_PATTERNS = [
  /\b(?:i|we)\s+(?:prefer|like|love|favor)\b/i,
  /\bmy\s+preferred\b/i,
  /\bpreference\b/i,
  /\bi(?:\'|’)d\s+rather\b/i,
  /\bdefault\s+to\b/i,
  /\b(?:always|usually)\s+use\b/i,
];

const SKILL_PATTERNS = [
  /\b(?:i|we)\s+(?:know|understand|can|able to)\b/i,
  /\b(?:experienced|proficient|expert)\s+with\b/i,
  /\b(?:skill|strength|competenc(?:y|ies))\b/i,
  /\b(?:familiar|comfortable)\s+with\b/i,
];

const ATTRIBUTE_PATTERNS = [
  /\b(?:i|we)\s+(?:am|are)\b/i,
  /\bmy\s+(?:role|timezone|location|name|pronouns|schedule|availability)\b/i,
  /\b(?:timezone|pronouns|role|availability|schedule)\s*:/i,
  /\b(?:working\s+hours|hard\s+stop|deadline)\b/i,
];

const NOISE_PATTERNS = [
  /\bheartbeat\b/i,
  /\braw log\b/i,
  /^\[[A-Z_]+\]/m,
  /\b(system|daemon|telemetry)\s+message\b/i,
  /\btraceback\b/i,
  /\bstdout\b/i,
  /\bstderr\b/i,
];

const ACK_PHRASES = new Set([
  'ok',
  'okay',
  'yes',
  'sounds good',
  'lets do it',
  "let's do it",
  'perfect',
  'nice',
  'got it',
]);

const HALF_LIFE: Record<ContentType, number> = {
  decision: Number.POSITIVE_INFINITY,
  spec: 180,
  preference: 180,
  skill: 120,
  attribute: 30,
  discussion: 60,
  ack: 0,
  noise: 0,
};

function normalized(content: string): string {
  return content.trim().toLowerCase().replace(/[.!?]+$/g, '');
}

export function classifyContentType(content: string): ContentTypeResult {
  const raw = String(content ?? '');
  const body = raw.trim();
  const lc = normalized(body);

  if (!body) {
    return { type: 'noise', confidence: 0.95, halfLifeDays: HALF_LIFE.noise };
  }

  if (NOISE_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'noise', confidence: 0.85, halfLifeDays: HALF_LIFE.noise };
  }

  if (body.length < 30 && ACK_PHRASES.has(lc)) {
    return { type: 'ack', confidence: 0.95, halfLifeDays: HALF_LIFE.ack };
  }

  if (DECISION_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'decision', confidence: 0.9, halfLifeDays: HALF_LIFE.decision };
  }

  if (SPEC_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'spec', confidence: 0.82, halfLifeDays: HALF_LIFE.spec };
  }

  if (PREFERENCE_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'preference', confidence: 0.8, halfLifeDays: HALF_LIFE.preference };
  }

  if (SKILL_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'skill', confidence: 0.78, halfLifeDays: HALF_LIFE.skill };
  }

  if (ATTRIBUTE_PATTERNS.some((rx) => rx.test(body))) {
    return { type: 'attribute', confidence: 0.72, halfLifeDays: HALF_LIFE.attribute };
  }

  if (/\?$/.test(body) || /\b(why|how|maybe|could|should|explore|question)\b/i.test(body)) {
    return { type: 'discussion', confidence: 0.75, halfLifeDays: HALF_LIFE.discussion };
  }

  return { type: 'discussion', confidence: 0.6, halfLifeDays: HALF_LIFE.discussion };
}
