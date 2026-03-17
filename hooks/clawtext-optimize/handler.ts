import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Clawptimizer,
  DEFAULT_CLAWPTIMIZATION_CONFIG,
  type ClawptimizationConfig,
  type ContextSlot,
} from '../../src/clawptimization.ts';

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
  source: ContextSlot['source'];
};

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const CONFIG_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'optimize-config.json');

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

    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<ClawptimizationConfig>;
    return { ...DEFAULT_CLAWPTIMIZATION_CONFIG, ...parsed };
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

    if (/^<!--\s*END\s+/i.test(line) || /^===+\s*$/.test(line)) {
      currentLines.push(line);
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

function inferSource(title: string, content: string): ContextSlot['source'] {
  const haystack = `${title}\n${content}`.toLowerCase();

  if (haystack.includes('journal') || haystack.includes('restored context')) return 'journal';
  if (haystack.includes('memory') || haystack.includes('memories')) return 'memory';
  if (haystack.includes('discord') || haystack.includes('history')) return 'discord-history';
  if (haystack.includes('library') || haystack.includes('reference')) return 'library';
  return 'system';
}

function composeOptimizedContext(slots: ContextSlot[]): string {
  const included = slots.filter((slot) => slot.included);
  if (included.length === 0) return '';

  const blocks = included.map((slot) => {
    const header = `## ${slot.id}`;
    return `${header}\n${slot.content}`;
  });

  return [
    '<!-- CLAWPTIMIZATION: optimized context -->',
    ...blocks,
    '<!-- END CLAWPTIMIZATION -->',
  ].join('\n\n');
}

const handler = async (
  event: PluginHookBeforePromptBuildEvent,
  ctx: PluginHookAgentContext,
): Promise<PluginHookBeforePromptBuildResult | void> => {
  const config = loadConfig();

  if (!config.enabled || config.strategy === 'passthrough') {
    return;
  }

  const prompt = typeof event.prompt === 'string' ? event.prompt : '';
  if (!prompt.trim()) {
    return;
  }

  const parsed = parsePromptSections(prompt);
  if (parsed.length === 0) {
    return;
  }

  const now = Date.now();
  const optimizer = new Clawptimizer(WORKSPACE, config);

  const slots: ContextSlot[] = parsed.map((section, index) => {
    const bytes = Buffer.byteLength(section.content, 'utf8');
    const ageMs = index * 60 * 1000;
    const score = optimizer.scoreContent(section.content, {
      source: section.source,
      ageMs,
      isRawLog: /```|stack trace|error:|\{.+\}/is.test(section.content),
      precedingGapMs: index > 0 ? 5 * 60 * 1000 : 0,
    });

    const freshness = Math.max(0, Math.min(1, 1 - ageMs / (12 * 60 * 60 * 1000)));
    const substance = Math.min(1, section.content.split(/\s+/).filter(Boolean).length / 80);
    const novelty = index === 0 ? 1 : 0.8;

    return {
      id: section.title || `Section ${index + 1}`,
      source: section.source,
      content: section.content,
      score,
      bytes,
      included: false,
      reason: `freshness:${freshness.toFixed(2)} substance:${substance.toFixed(2)} novelty:${novelty.toFixed(2)}`,
    };
  });

  const result = optimizier.optimize(slots);
  const prependContext = composeOptimizedContext(result.slots);

  if (!prependContext) {
    return;
  }

  if (config.logDecisions) {
    const sessionKey = ctx.sessionKey || ctx.sessionId || `session-${now}`;
    optimizier.logDecision(result, sessionKey);
  }

  return { prependContext };
};

export default handler;
