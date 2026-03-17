import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_CLAWPTIMIZATION_CONFIG,
  Clawptimizer,
  type ClawptimizationConfig,
  type ContextSlot,
  type ContextSlotSource,
} from '../../src/clawptimization.ts';
import { PromptCompositor } from '../../src/prompt-compositor.ts';
import type { SlotProvider } from '../../src/slot-provider.ts';

type PluginHookBeforePromptBuildEvent = {
  prompt: string;
  messages: unknown[];
};

type PluginHookBeforePromptBuildResult = {
  systemPrompt?: string;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
};

type PluginHookAgentContext = {
  config?: unknown;
  workspaceDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageChannel?: string;
};

type ParsedSection = {
  title: string;
  content: string;
  source: ContextSlotSource;
};

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const CONFIG_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'optimize-config.json');
const OPT_LOG_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'optimization-log.jsonl');

function logDiagnostic(entry: Record<string, unknown>): void {
  try {
    const dir = path.dirname(OPT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFile(OPT_LOG_PATH, JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), ...entry }) + '\n', () => {});
  } catch {
    // fire-and-forget, never crash the hook
  }
}

function loadConfig(): ClawptimizationConfig {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CLAWPTIMIZATION_CONFIG, null, 2), 'utf8');
      return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
    }

    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<ClawptimizationConfig> & {
      budgetRatio?: number;
      budgetBytes?: number;
    };

    const merged: ClawptimizationConfig = {
      ...DEFAULT_CLAWPTIMIZATION_CONFIG,
      ...parsed,
      budget: {
        ...DEFAULT_CLAWPTIMIZATION_CONFIG.budget,
        ...(parsed.budget ?? {}),
      },
    };

    if (typeof parsed.budgetRatio === 'number' && !parsed.budget?.budgetRatio) {
      merged.budget = { ...merged.budget, budgetRatio: parsed.budgetRatio };
    }

    if (typeof parsed.budgetBytes === 'number' && parsed.budgetBytes > 0) {
      merged.budgetBytes = parsed.budgetBytes;
    }

    return merged;
  } catch {
    return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
  }
}

function parsePromptSections(prompt: string): ParsedSection[] {
  const lines = prompt.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentTitle = 'Prelude';
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;

    sections.push({
      title: currentTitle,
      content,
      source: inferSource(currentTitle, content),
    });
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      currentTitle = line.replace(/^##\s+/, '').trim() || 'Untitled';
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  flush();

  if (sections.length === 0 && prompt.trim()) {
    return [{ title: 'Prompt', content: prompt.trim(), source: inferSource('Prompt', prompt) }];
  }

  return sections;
}

function inferSource(title: string, content: string): ContextSlotSource {
  const haystack = `${title}\n${content}`.toLowerCase();

  if (haystack.includes('journal') || haystack.includes('restored context')) return 'journal';
  if (haystack.includes('memory') || haystack.includes('memories')) return 'memory';
  if (haystack.includes('clawbridge') || haystack.includes('handoff')) return 'clawbridge';
  if (haystack.includes('library') || haystack.includes('reference')) return 'library';
  if (haystack.includes('decision')) return 'decision-tree';
  if (haystack.includes('deep history')) return 'deep-history';
  if (haystack.includes('mid history')) return 'mid-history';
  if (haystack.includes('history')) return 'recent-history';
  return 'system';
}

function composeOptimizedContext(slots: ContextSlot[]): string {
  const included = slots.filter((slot) => slot.included);
  if (included.length === 0) return '';

  const blocks = included.map((slot) => `## ${slot.id}\n${slot.content}`);

  return ['<!-- CLAWPTIMIZATION: optimized context -->', ...blocks, '<!-- END CLAWPTIMIZATION -->'].join(
    '\n\n',
  );
}

function providerFromSections(
  source: ContextSlotSource,
  sections: ParsedSection[],
  optimizer: Clawptimizer,
): SlotProvider {
  return {
    id: `parsed:${source}`,
    source,
    priority: priorityForSource(source),
    available: () => sections.length > 0,
    fill: () => {
      return sections.map((section, index) => {
        const bytes = Buffer.byteLength(section.content, 'utf8');
        const ageMs = index * 60 * 1000;
        const score = optimizer.scoreContent(section.content, {
          source,
          ageMs,
          isRawLog: /```|stack trace|error:|\{.+\}/is.test(section.content),
          precedingGapMs: index > 0 ? 5 * 60 * 1000 : 0,
        });

        const freshness = Math.max(0, Math.min(1, 1 - ageMs / (12 * 60 * 60 * 1000)));
        const substance = Math.min(1, section.content.split(/\s+/).filter(Boolean).length / 80);
        const novelty = index === 0 ? 1 : 0.8;

        return {
          id: section.title || `${source}-${index + 1}`,
          source,
          content: section.content,
          score,
          bytes,
          included: false,
          reason: `freshness:${freshness.toFixed(2)} substance:${substance.toFixed(2)} novelty:${novelty.toFixed(2)}`,
        };
      });
    },
    prunable: source !== 'system' && source !== 'recent-history',
  };
}

function priorityForSource(source: ContextSlotSource): number {
  const ordering: Record<ContextSlotSource, number> = {
    system: 10,
    memory: 20,
    library: 30,
    clawbridge: 40,
    'recent-history': 50,
    'mid-history': 60,
    'deep-history': 70,
    'decision-tree': 80,
    journal: 90,
    'cross-session': 100,
    'situational-awareness': 110,
    custom: 120,
  };

  return ordering[source] ?? 999;
}

const handler = async (
  event: PluginHookBeforePromptBuildEvent,
  ctx: PluginHookAgentContext,
): Promise<PluginHookBeforePromptBuildResult | void> => {
  try {
    const config = loadConfig();

  if (!config.enabled || config.strategy === 'passthrough') {
    logDiagnostic({ type: 'skip', reason: !config.enabled ? 'disabled' : 'passthrough', channel: ctx.messageChannel });
    return;
  }

  const prompt = typeof event.prompt === 'string' ? event.prompt : '';
  if (!prompt.trim()) {
    logDiagnostic({ type: 'skip', reason: 'empty-prompt', channel: ctx.messageChannel });
    return;
  }

  const parsed = parsePromptSections(prompt);
  if (parsed.length === 0) {
    logDiagnostic({ type: 'skip', reason: 'no-sections', channel: ctx.messageChannel, promptLength: prompt.length });
    return;
  }

  const now = Date.now();
  const optimizer = new Clawptimizer(WORKSPACE, config);
  const compositor = new PromptCompositor({
    enabled: config.enabled,
    strategy: config.strategy,
    minScore: config.minScore,
    preserveReasons: config.preserveReasons,
    logDecisions: false,
    workspacePath: WORKSPACE,
    budget: {
      contextWindowTokens: config.budget?.contextWindowTokens ?? 160_000,
      budgetRatio: config.budget?.budgetRatio,
      slots: config.budget?.slots,
      overflowMode: config.budget?.overflowMode,
    },
  });

  const bySource = new Map<ContextSlotSource, ParsedSection[]>();
  for (const section of parsed) {
    const list = bySource.get(section.source) ?? [];
    list.push(section);
    bySource.set(section.source, list);
  }

  for (const [source, sections] of bySource.entries()) {
    compositor.register(providerFromSections(source, sections, optimizer));
  }

  const result = compositor.compose({
    channelId: ctx.messageChannel || 'unknown',
    sessionKey: ctx.sessionKey || ctx.sessionId || `session-${now}`,
    modelContextWindowTokens: config.budget?.contextWindowTokens ?? 160_000,
    currentTurnCount: Array.isArray(event.messages) ? event.messages.length : 0,
  });

  const prependContext = composeOptimizedContext(result.slots);
  if (!prependContext) {
    logDiagnostic({
      type: 'empty-result',
      reason: 'compositor-returned-no-included-slots',
      channel: ctx.messageChannel,
      sectionCount: parsed.length,
      slotCount: result.slots.length,
      droppedCount: result.droppedCount,
      totalBytes: result.totalBytes,
    });
    return;
  }

  if (config.logDecisions) {
    const sessionKey = ctx.sessionKey || ctx.sessionId || `session-${now}`;
    optimizer.logDecision(result, sessionKey);
  }

  logDiagnostic({
    type: 'composed',
    channel: ctx.messageChannel,
    strategy: result.strategy,
    includedCount: result.includedCount,
    droppedCount: result.droppedCount,
    totalBytes: result.totalBytes,
    budgetBytes: result.budgetBytes,
    prependBytes: Buffer.byteLength(prependContext, 'utf8'),
  });

  return { prependContext };
  } catch (err) {
    logDiagnostic({
      type: 'error',
      reason: err instanceof Error ? err.message : String(err),
      channel: ctx?.messageChannel,
    });
    return; // never crash the prompt build
  }
};

export default handler;
