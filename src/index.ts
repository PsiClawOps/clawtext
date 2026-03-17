import fs from 'fs';
import os from 'os';
import path from 'path';
import { ClawTextInjectionPlugin } from './plugin';
import { ClawTextRAG } from './rag';
import { Clawptimizer, DEFAULT_CLAWPTIMIZATION_CONFIG } from './clawptimization';
import type { ClawptimizationConfig, ContextSlotSource } from './clawptimization';
import { PromptCompositor } from './prompt-compositor';
import type { SlotProvider, ContextSlot } from './slot-provider';
import { TopicAnchorProvider } from './providers/topic-anchor-provider';
import { stripInjectedContext } from './injected-context';

export { ClawTextInjectionPlugin, ClawTextRAG };
export { cleanQueryForSearch } from './rag';
export * from './library';
export * from './library-index';
export * from './library-ingest';
export * from './runtime-paths';
export * from './session-topic-map';
export * from './injected-context';
export * from './clawptimization';
export * from './slot-provider';
export * from './budget-manager';
export * from './context-pressure';
export * from './active-pruning';
export * from './prompt-compositor';
export * from './decision-tree';
export * from './providers/decision-tree-provider';
export * from './content-type-classifier';
export * from './contradiction-detector';
export * from './providers/index';
export * from './providers/cross-session-provider';
export * from './providers/situational-awareness-provider';
export * from './providers/clawbridge-provider';
export * from './providers/topic-anchor-provider';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const OPT_CONFIG_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'optimize-config.json');
const OPT_LOG_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'optimization-log.jsonl');

function logPluginDiagnostic(entry: Record<string, unknown>): void {
  try {
    const dir = path.dirname(OPT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFile(OPT_LOG_PATH, JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), source: 'plugin-register', ...entry }) + '\n', () => {});
  } catch {
    // fire-and-forget
  }
}

function loadOptimizeConfig(): ClawptimizationConfig {
  try {
    if (!fs.existsSync(OPT_CONFIG_PATH)) return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
    const parsed = JSON.parse(fs.readFileSync(OPT_CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULT_CLAWPTIMIZATION_CONFIG,
      ...parsed,
      budget: { ...DEFAULT_CLAWPTIMIZATION_CONFIG.budget, ...(parsed.budget ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CLAWPTIMIZATION_CONFIG };
  }
}

function inferSource(title: string, content: string): ContextSlotSource {
  const haystack = `${title}\n${content}`.toLowerCase();
  if (haystack.includes('journal') || haystack.includes('restored context')) return 'journal';
  if (haystack.includes('memory') || haystack.includes('memories')) return 'memory';
  if (haystack.includes('clawbridge') || haystack.includes('handoff')) return 'clawbridge';
  if (haystack.includes('topic anchor') || haystack.includes('topic_anchor')) return 'topic-anchor';
  if (haystack.includes('library') || haystack.includes('reference')) return 'library';
  if (haystack.includes('decision')) return 'decision-tree';
  if (haystack.includes('deep history')) return 'deep-history';
  if (haystack.includes('mid history')) return 'mid-history';
  if (haystack.includes('history')) return 'recent-history';
  return 'system';
}

function parsePromptSections(prompt: string): Array<{ title: string; content: string; source: ContextSlotSource }> {
  const lines = prompt.split(/\r?\n/);
  const sections: Array<{ title: string; content: string; source: ContextSlotSource }> = [];
  let currentTitle = 'Prelude';
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (!content) return;
    sections.push({ title: currentTitle, content, source: inferSource(currentTitle, content) });
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

function priorityForSource(source: ContextSlotSource): number {
  const ordering: Record<string, number> = {
    system: 10, memory: 20, 'topic-anchor': 25, library: 30, clawbridge: 40,
    'recent-history': 50, 'mid-history': 60, 'deep-history': 70,
    'decision-tree': 80, journal: 90, 'cross-session': 100,
    'situational-awareness': 110, custom: 120,
  };
  return ordering[source] ?? 999;
}

function runClawptimization(
  prompt: string,
  messages: unknown[],
  channelId: string,
  sessionKey: string,
): { prependContext?: string } | undefined {
  const config = loadOptimizeConfig();

  if (!config.enabled || config.strategy === 'passthrough') {
    logPluginDiagnostic({ type: 'skip', reason: !config.enabled ? 'disabled' : 'passthrough', channel: channelId });
    return undefined;
  }

  if (!prompt.trim()) {
    logPluginDiagnostic({ type: 'skip', reason: 'empty-prompt', channel: channelId });
    return undefined;
  }

  // Strip prior injected context before scoring to avoid recursive re-ingestion.
  const promptForComposition = stripInjectedContext(prompt);

  const parsed = parsePromptSections(promptForComposition);
  if (parsed.length === 0) {
    logPluginDiagnostic({ type: 'skip', reason: 'no-sections', channel: channelId, promptLength: prompt.length });
    return undefined;
  }

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

  compositor.register(new TopicAnchorProvider({ workspacePath: WORKSPACE }));

  const bySource = new Map<ContextSlotSource, Array<{ title: string; content: string; source: ContextSlotSource }>>();
  for (const section of parsed) {
    const list = bySource.get(section.source) ?? [];
    list.push(section);
    bySource.set(section.source, list);
  }

  for (const [source, sections] of bySource.entries()) {
    const provider: SlotProvider = {
      id: `parsed:${source}`,
      source,
      priority: priorityForSource(source),
      available: () => sections.length > 0,
      fill: () => sections.map((section, index) => {
        const bytes = Buffer.byteLength(section.content, 'utf8');
        const ageMs = index * 60 * 1000;
        const score = optimizer.scoreContent(section.content, {
          source, ageMs,
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
        } as ContextSlot;
      }),
      prunable: source !== 'system' && source !== 'recent-history',
    };
    compositor.register(provider);
  }

  const result = compositor.compose({
    channelId,
    sessionKey,
    modelContextWindowTokens: config.budget?.contextWindowTokens ?? 160_000,
    currentTurnCount: Array.isArray(messages) ? messages.length : 0,
  });

  const included = result.slots.filter((slot: ContextSlot) => slot.included);
  if (included.length === 0) {
    logPluginDiagnostic({
      type: 'empty-result', channel: channelId,
      sectionCount: parsed.length, slotCount: result.slots.length,
      droppedCount: result.droppedCount, totalBytes: result.totalBytes,
    });
    return undefined;
  }

  const blocks = included.map((slot: ContextSlot) => `## ${slot.id}\n${slot.content}`);
  const prependContext = ['<!-- CLAWPTIMIZATION: optimized context -->', ...blocks, '<!-- END CLAWPTIMIZATION -->'].join('\n\n');

  if (config.logDecisions) {
    optimizer.logDecision(result, sessionKey);
  }

  logPluginDiagnostic({
    type: 'composed', channel: channelId, strategy: result.strategy,
    includedCount: result.includedCount, droppedCount: result.droppedCount,
    totalBytes: result.totalBytes, budgetBytes: result.budgetBytes,
    prependBytes: Buffer.byteLength(prependContext, 'utf8'),
  });

  return { prependContext };
}

function extractUserText(messages: unknown[] = []): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const contentFromMessage = (msg: unknown): string => {
    if (!msg || typeof msg !== "object") {
      return String(msg ?? "");
    }

    const record = msg as {
      content?: unknown;
      contentPreview?: unknown;
      text?: unknown;
      prompt?: unknown;
      message?: unknown;
    };

    return (
      (typeof record.content === "string" ? record.content : "") ||
      (typeof record.contentPreview === "string" ? record.contentPreview : "") ||
      (typeof record.text === "string" ? record.text : "") ||
      (typeof record.prompt === "string" ? record.prompt : "") ||
      (typeof record.message === "string" ? record.message : "") ||
      ""
    );
  };

  const lastMessage = messages[messages.length - 1];
  return contentFromMessage(lastMessage);
}

function hasDelimitedToken(value: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[\\s:_./-])${escaped}(?:$|[\\s:_./-])`, 'i');
  return pattern.test(value);
}

function getAutomationSkipReason(ctx: any, userMessage: string): string | null {
  const trigger = typeof ctx?.trigger === 'string' ? ctx.trigger.trim().toLowerCase() : '';
  if (trigger) {
    if (trigger.includes('heartbeat')) return 'trigger-heartbeat';
    if (hasDelimitedToken(trigger, 'cron')) return 'trigger-cron';
    if (/memory[\s:_-]*internal/i.test(trigger)) return 'trigger-memory-internal';
  }

  const identityFields = [ctx?.sessionKey, ctx?.sessionId, ctx?.agentId, ctx?.messageChannel]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const field of identityFields) {
    const normalized = field.trim().toLowerCase();
    if (normalized.includes('heartbeat')) return 'session-heartbeat';
    if (hasDelimitedToken(normalized, 'cron')) return 'session-cron';
    if (/memory[\s:_-]*internal/i.test(normalized)) return 'session-memory-internal';
  }

  const normalizedMessage = userMessage.trim().toLowerCase();
  if (normalizedMessage.startsWith('read heartbeat.md if it exists')) return 'message-heartbeat-poll';

  return null;
}

export default {
  id: "clawtext",
  name: "ClawText",
  description:
    "Automatic working-memory retrieval, prompt injection, and operational learning hooks for OpenClaw.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  register(api: any) {
    const plugin = new ClawTextInjectionPlugin();

    api.on(
      "before_prompt_build",
      async (event: { prompt?: unknown; messages?: unknown[] }, ctx?: any) => {
        const systemPrompt = typeof event.prompt === "string" ? event.prompt : "";
        const messages = Array.isArray(event.messages) ? event.messages : [];
        const userMessage = extractUserText(messages);

        const skipReason = getAutomationSkipReason(ctx, userMessage);
        if (skipReason) {
          logPluginDiagnostic({
            type: 'skip-automation-session',
            reason: skipReason,
            trigger: ctx?.trigger,
            channel: ctx?.messageChannel || 'unknown',
          });
          return undefined;
        }

        // Step 1: RAG-based memory injection (existing behavior)
        const ragResult = await plugin.onBeforePromptBuild({
          systemPrompt,
          userMessage,
        });

        const promptAfterRag = ragResult?.systemPrompt || systemPrompt;

        // Step 2: Clawptimization compositor (scores, budgets, prunes)
        try {
          const channelId = ctx?.messageChannel || 'unknown';
          const sessionKey = ctx?.sessionKey || ctx?.sessionId || `session-${Date.now()}`;

          const optimizeResult = runClawptimization(promptAfterRag, messages, channelId, sessionKey);

          if (optimizeResult?.prependContext) {
            return {
              systemPrompt: ragResult?.systemPrompt !== systemPrompt ? ragResult.systemPrompt : undefined,
              prependContext: optimizeResult.prependContext,
            };
          }
        } catch (err) {
          logPluginDiagnostic({ type: 'plugin-error', error: err instanceof Error ? err.message : String(err), channel: ctx?.messageChannel });
          // Fall through to RAG-only result
        }

        // If Clawptimization didn't produce anything, return RAG result only
        return ragResult?.systemPrompt ? { systemPrompt: ragResult.systemPrompt } : undefined;
      },
      { priority: 40 },
    );
  },
};

