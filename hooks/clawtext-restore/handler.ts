import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const CONFIG_FILE = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'restore-config.json');

// ── Defaults — all overridable via restore-config.json ───────────────────────
const DEFAULTS = {
  // How many messages to inject into bootstrap context
  injectLimit: 20,
  // Only inject if most recent message is within this many hours
  maxContextAgeHours: 8,
  // Minimum messages before bothering to inject
  minMessages: 3,
  // How many journal days to scan
  lookbackDays: 2,
  // Max bytes of content to inject (token budget guard)
  // ~4 bytes/token; 8000 bytes ≈ 2000 tokens — safe for most models
  // raise to 32000 for large context windows (e.g. 200k token models)
  maxContentBytes: 8000,
  // Per-message content preview cap (bytes)
  previewCap: 300,
  // Minimum scorer threshold for injection
  minScore: 0.25,
  // Whether auto-restore is enabled at all
  enabled: true,
};

type ScorerModule = {
  scoreMessages: (records: Array<Record<string, unknown>>, budget: { maxMessages: number; maxBytes: number; minScore: number; }) => Array<{ record: Record<string, unknown>; score: number }>;
  selectForInjection: (scored: Array<{ record: Record<string, unknown>; score: number }>, budget: { maxMessages: number; maxBytes: number; minScore: number; }) => Array<Record<string, unknown>>;
};

let scorerModulePromise: Promise<ScorerModule> | null = null;

function loadScorerModule(): Promise<ScorerModule> {
  if (!scorerModulePromise) {
    scorerModulePromise = import('../dist/journal-context-scorer.js')
      .catch(() => import('../../dist/journal-context-scorer.js')) as Promise<ScorerModule>;
  }
  return scorerModulePromise;
}

function loadConfig(): typeof DEFAULTS {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const overrides = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULTS, ...overrides };
    }
  } catch { /* fallthrough to defaults */ }
  return { ...DEFAULTS };
}

// ── Read journal records for a channel from recent files ─────────────────────
function readRecentJournalRecords(
  channelId: string,
  limitDays: number,
): Array<Record<string, unknown>> {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const files = fs.readdirSync(JOURNAL_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
    .sort()
    .reverse()
    .slice(0, limitDays);

  const records: Array<Record<string, unknown>> = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(JOURNAL_DIR, file), 'utf8');
      for (const line of raw.trim().split('\n').filter(Boolean)) {
        try {
          const rec = JSON.parse(line) as Record<string, unknown>;
          if (rec.channel === channelId || rec.conversationId === channelId) {
            records.push(rec);
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable file */ }
  }

  return records.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}

// ── Format records as a compact context block, respecting byte budget ─────────
function formatContextBlock(
  records: Array<Record<string, unknown>>,
  channelId: string,
  cfg: typeof DEFAULTS,
  scorer: ScorerModule,
): string {
  const messages = records.filter(r => r.type !== 'checkpoint');
  const checkpoints = records.filter(r => r.type === 'checkpoint');
  const lastCheckpoint = checkpoints[checkpoints.length - 1];

  const budget = {
    maxMessages: cfg.injectLimit,
    maxBytes: cfg.maxContentBytes,
    minScore: cfg.minScore ?? 0.25,
  };

  const scored = scorer.scoreMessages(messages, budget);
  const selected = scorer.selectForInjection(scored, budget);

  if (selected.length < cfg.minMessages) return '';

  const threadName = (selected.find(r => r.threadName) as Record<string, unknown> | undefined)
    ?.threadName as string || channelId;
  const lastTopics = lastCheckpoint
    ? (lastCheckpoint.recentTopics as string[] || []).join(', ')
    : '';

  const first = new Date(Number(selected[0].ts)).toISOString().replace('T', ' ').slice(0, 16);
  const last = new Date(Number(selected[selected.length - 1].ts)).toISOString().replace('T', ' ').slice(0, 16);

  const header = [
    `<!-- CLAWTEXT CONTEXT RESTORE: journal replay for ${threadName} -->`,
    `<!-- ${selected.length} messages | ${first} → ${last} | channel: ${channelId} | budget: ${cfg.maxContentBytes}b | minScore: ${budget.minScore} -->`,
    lastTopics ? `<!-- Recent topics: ${lastTopics} -->` : null,
    '',
    '**[Restored context from journal — recent conversation]**',
    '',
  ].filter(l => l !== null) as string[];

  const body: string[] = [];
  for (const rec of selected) {
    const time = new Date(Number(rec.ts)).toISOString().replace('T', ' ').slice(0, 16);
    const arrow = rec.dir === 'in' ? '→' : '←';
    const who = (rec.sender || rec.from || (rec.dir === 'in' ? 'user' : 'agent')) as string;
    const content = (rec.content as string || '').trim();
    const preview = content.length > cfg.previewCap ? content.slice(0, cfg.previewCap) + '…' : content;
    if (preview) body.push(`[${time}] ${arrow} **${who}:** ${preview}`);
  }

  return [...header, ...body, '', '<!-- END CLAWTEXT CONTEXT RESTORE -->'].join('\n');
}

// ── Hook handler ──────────────────────────────────────────────────────────────
const handler = async (event: {
  type: string;
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  messages: string[];
}) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return;

  try {
    const cfg = loadConfig();
    if (!cfg.enabled) return;

    const ctx = event.context || {};
    const sessionKey = event.sessionKey || '';
    let channelId = (ctx.channelId as string) || '';

    // Derive channel from sessionKey if not in context
    if (!channelId && sessionKey.includes(':channel:')) {
      channelId = sessionKey.split(':channel:').pop() || '';
    }
    if (!channelId && sessionKey.includes(':topic:')) {
      channelId = sessionKey.split(':topic:').pop() || '';
    }
    if (!channelId || channelId === 'unknown') return;

    const records = readRecentJournalRecords(channelId, cfg.lookbackDays);
    if (records.length < cfg.minMessages) return;

    // Check freshness
    const lastMsg = records.filter(r => r.type !== 'checkpoint').slice(-1)[0];
    if (!lastMsg) return;
    const ageMs = Date.now() - Number(lastMsg.ts);
    if (ageMs > cfg.maxContextAgeHours * 60 * 60 * 1000) return;

    const scorer = await loadScorerModule();
    const contextBlock = formatContextBlock(records, channelId, cfg, scorer);
    if (!contextBlock) return;

    event.messages.push(contextBlock);

    if (process.env.DEBUG_CLAWTEXT) {
      const totalBytes = contextBlock.length;
      console.log(`[clawtext-restore] injected context block (${totalBytes} bytes) for channel ${channelId}`);
    }
  } catch (err) {
    if (process.env.DEBUG_CLAWTEXT) {
      console.error('[clawtext-restore] error:', err instanceof Error ? err.message : String(err));
    }
  }
};

export default handler;
