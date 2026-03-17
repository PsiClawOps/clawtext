export function stripInjectedContext(raw: string): string {
  let cleaned = String(raw ?? '');

  cleaned = cleaned.replace(/<relevant-memories>[\s\S]*?<\/relevant-memories>/gi, '');
  cleaned = cleaned.replace(/<!--\s*CLAWPTIMIZATION:[\s\S]*?<!--\s*END\s+CLAWPTIMIZATION\s*-->/gi, '');
  cleaned = cleaned.replace(/<!--\s*TOPIC_ANCHOR:[\s\S]*?<!--\s*END\s+TOPIC_ANCHOR\s*-->/gi, '');

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}
