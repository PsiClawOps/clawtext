/**
 * ClawText Reflect — LLM-Mediated Recall
 * 
 * Instead of dumping raw memories, have LLM synthesize what it knows first.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logReflectCall, getReflectStats as getTelemetryStats } from './telemetry.js';

/**
 * Resolve OpenRouter API key.
 * Priority: OPENROUTER_API_KEY env > openclaw.json config > OPENROUTER_MANAGEMENT_KEY env
 */
async function resolveApiKey(): Promise<string | undefined> {
  // 1. Direct env var (set after gateway restart)
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // 2. Read from openclaw.json (works before gateway restart)
  try {
    const configFile = join(process.env.HOME || '', '.openclaw', 'openclaw.json');
    if (existsSync(configFile)) {
      const raw = await readFile(configFile, 'utf-8');
      const cfg = JSON.parse(raw);
      const key = cfg?.env?.vars?.OPENROUTER_API_KEY;
      if (key && !key.startsWith('${')) return key;
    }
  } catch {
    // ignore, fall through
  }

  // 3. Management key fallback (will 401 for inference but keeps error path clear)
  return process.env.OPENROUTER_MANAGEMENT_KEY;
}

// Types
export interface ReflectConfig {
  enabled: boolean;
  trigger: 'auto' | 'on-demand';
  minMemories: number;
  maxMemories: number;
  model: string;
  prompt?: string;
  budget: 'low' | 'medium' | 'high';
}

export interface Memory {
  id: string;
  content: string;
  timestamp: string;
  sessionId: string;
  advisorId?: string;
  tags?: string[];
  provenance?: {
    who: string;
    when: string;
    session: string;
  };
}

export interface ReflectResult {
  reflection: string;
  memoriesUsed: number;
  model: string;
  latencyMs: number;
  fromCache?: boolean;
}

export interface ReflectOptions {
  query: string;
  memories: Memory[];
  config?: Partial<ReflectConfig>;
  onMissing?: 'error' | 'warn' | 'ignore';
}

// Default config
const DEFAULT_CONFIG: ReflectConfig = {
  enabled: true,
  trigger: 'auto',
  minMemories: 2,
  maxMemories: 10,
  model: 'gemini-3-flash-preview',
  budget: 'low'
};

// Budget token limits
const BUDGET_TOKENS = {
  low: 100,
  medium: 200,
  high: 400
};

// Default prompt template
const DEFAULT_REFLECT_PROMPT = `You have access to the following memories from our conversation:

{{memories}}

Given these memories, provide a concise synthesis of what you know about: {{query}}

Focus on:
- Key decisions
- Important context
- What unresolved questions remain

Respond in {{sentences}} sentences.`;

// Config path
function getConfigPath(): string {
  const stateRoot = process.env.CLAWTEXT_STATE_ROOT || join(process.env.HOME || '', '.openclaw/workspace/state/clawtext/prod');
  return join(stateRoot, 'reflect', 'config.json');
}

// Memory cache path
function getCachePath(query: string): string {
  const stateRoot = process.env.CLAWTEXT_STATE_ROOT || join(process.env.HOME || '', '.openclaw/workspace/state/clawtext/prod');
  const hash = Buffer.from(query).toString('base64').slice(0, 16);
  return join(stateRoot, 'reflect', 'cache', `${hash}.json`);
}

/**
 * Load reflect configuration
 */
export async function loadConfig(): Promise<ReflectConfig> {
  const configPath = getConfigPath();
  
  try {
    if (existsSync(configPath)) {
      const data = await readFile(configPath, 'utf-8');
      const loaded = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...loaded };
    }
  } catch (error) {
    console.warn('[reflect] Failed to load config, using defaults:', error);
  }
  
  // Create default config if not exists
  const configDir = join(configPath, '..');
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }
  await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  
  return DEFAULT_CONFIG;
}

/**
 * Save reflect configuration
 */
export async function saveConfig(config: Partial<ReflectConfig>): Promise<ReflectConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...config };
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Build reflect prompt from template
 */
function buildPrompt(options: ReflectOptions, config: ReflectConfig): string {
  const promptTemplate = config.prompt || DEFAULT_REFLECT_PROMPT;
  const budget = BUDGET_TOKENS[config.budget];
  
  // Format memories as numbered list
  const memoriesText = options.memories
    .slice(0, config.maxMemories)
    .map((m, i) => `${i + 1}. "${m.content}"`)
    .join('\n');
  
  // Estimate sentences from budget
  const sentences = Math.max(2, Math.min(4, Math.floor(budget / 50)));
  
  return promptTemplate
    .replace('{{memories}}', memoriesText)
    .replace('{{query}}', options.query)
    .replace('{{sentences}}', String(sentences));
}

/**
 * Check cache for reflection
 */
async function getFromCache(query: string): Promise<ReflectResult | null> {
  const cachePath = getCachePath(query);
  
  try {
    if (existsSync(cachePath)) {
      const data = await readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data) as ReflectResult & { timestamp: string };
      
      // Cache valid for 1 hour
      const age = Date.now() - new Date(cached.timestamp).getTime();
      if (age < 3600000) {
        return { ...cached, fromCache: true };
      }
    }
  } catch {
    // Cache miss, continue
  }
  
  return null;
}

/**
 * Save reflection to cache
 */
async function saveToCache(query: string, result: ReflectResult): Promise<void> {
  const cachePath = getCachePath(query);
  const cacheDir = join(cachePath, '..');
  
  try {
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }
    
    await writeFile(cachePath, JSON.stringify({
      ...result,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.warn('[reflect] Failed to save cache:', error);
  }
}

/**
 * Model ID mapping — translate config shorthand to OpenRouter model IDs
 */
const MODEL_ID_MAP: Record<string, string> = {
  'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview': 'google/gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'claude-haiku-4.5': 'anthropic/claude-haiku-4.5',
  'claude-sonnet-4.6': 'anthropic/claude-sonnet-4.6',
  'gpt-5.4-nano': 'openai/gpt-5.4-nano',
  'gpt-5.4-mini': 'openai/gpt-5.4-mini',
  'deepseek-v3': 'deepseek/deepseek-chat',
  'deepseek-v3.2': 'deepseek/deepseek-v3.2',
};

function resolveModelId(model: string): string {
  return MODEL_ID_MAP[model] || model;
}

/**
 * Call LLM for reflection via OpenRouter API
 */
async function callReflectLLM(prompt: string, model: string): Promise<string> {
  const apiKey = await resolveApiKey();
  
  if (!apiKey) {
    console.warn('[reflect] No OpenRouter API key found (OPENROUTER_API_KEY or OPENROUTER_MANAGEMENT_KEY). Falling back to stub.');
    return fallbackStub(prompt);
  }
  
  const modelId = resolveModelId(model);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ragesaq/clawtext',
        'X-Title': 'ClawText Reflect',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a memory synthesis assistant. Given a set of memories and a query, produce a concise, accurate synthesis. Be factual and brief. Do not invent information not present in the memories.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[reflect] OpenRouter API error ${response.status}: ${errorText}`);
      return fallbackStub(prompt);
    }
    
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    
    if (data.error) {
      console.error(`[reflect] OpenRouter error: ${data.error.message}`);
      return fallbackStub(prompt);
    }
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[reflect] Empty response from OpenRouter');
      return fallbackStub(prompt);
    }
    
    return content.trim();
  } catch (error) {
    console.error('[reflect] OpenRouter call failed:', error);
    return fallbackStub(prompt);
  }
}

/**
 * Fallback stub when API is unavailable
 */
function fallbackStub(prompt: string): string {
  const memoryMatch = prompt.match(/memories[^:]*:([\s\S]*?)Given these/i);
  const queryMatch = prompt.match(/about:\s*([^\n]+)/);
  
  if (memoryMatch && queryMatch) {
    const memories = memoryMatch[1].trim().split('\n').filter(Boolean);
    const query = queryMatch[1].trim();
    return `[stub] Regarding "${query}": Found ${memories.length} relevant memories. ` +
      memories.slice(0, 3).map(m => m.replace(/^\d+\.\s*"/, '').replace(/"$/, '')).join('. ') + '.';
  }
  
  return '[stub] Unable to synthesize memories.';
}

/**
 * Main reflect function
 * 
 * @param options.query - The query to reflect on
 * @param options.memories - Array of memories to synthesize
 * @param options.config - Optional config overrides
 * @param options.onMissing - What to do if reflect is disabled
 */
export async function reflect(options: ReflectOptions): Promise<ReflectResult> {
  const start = Date.now();
  const config = await loadConfig();
  
  // Apply config overrides
  const effectiveConfig = { ...config, ...options.config };
  
  // Check if reflect is enabled
  if (!effectiveConfig.enabled) {
    if (options.onMissing === 'error') {
      throw new Error('Reflect is disabled');
    }
    return {
      reflection: options.memories.map(m => m.content).join('\n'),
      memoriesUsed: options.memories.length,
      model: 'none',
      latencyMs: Date.now() - start,
      fromCache: false
    };
  }
  
  // Check memory count threshold
  if (options.memories.length < effectiveConfig.minMemories) {
    return {
      reflection: options.memories.map(m => m.content).join('\n'),
      memoriesUsed: options.memories.length,
      model: 'none',
      latencyMs: Date.now() - start,
      fromCache: false
    };
  }
  
  // Check cache first
  const cached = await getFromCache(options.query);
  if (cached) {
    // Log cache hit telemetry
    await logReflectCall({
      query: options.query,
      model: cached.model,
      memoriesCount: options.memories.length,
      inputText: '',
      outputText: cached.reflection,
      latencyMs: cached.latencyMs,
      fromCache: true,
      budget: effectiveConfig.budget,
      trigger: effectiveConfig.trigger,
    });
    return cached;
  }
  
  // Build prompt
  const prompt = buildPrompt(options, effectiveConfig);
  
  // Call LLM
  const reflection = await callReflectLLM(prompt, effectiveConfig.model);
  
  const result: ReflectResult = {
    reflection,
    memoriesUsed: options.memories.length,
    model: effectiveConfig.model,
    latencyMs: Date.now() - start,
    fromCache: false
  };
  
  // Log telemetry
  await logReflectCall({
    query: options.query,
    model: effectiveConfig.model,
    memoriesCount: options.memories.length,
    inputText: prompt,
    outputText: reflection,
    latencyMs: result.latencyMs,
    fromCache: false,
    budget: effectiveConfig.budget,
    trigger: effectiveConfig.trigger,
  });
  
  // Cache result
  await saveToCache(options.query, result);
  
  return result;
}

/**
 * Check if reflect should trigger for a given query/memories
 */
export async function shouldReflect(memories: Memory[]): Promise<boolean> {
  const config = await loadConfig();
  
  if (!config.enabled) return false;
  if (config.trigger === 'on-demand') return false;
  if (memories.length < config.minMemories) return false;
  
  return true;
}

/**
 * Clear reflect cache
 */
export async function clearCache(): Promise<void> {
  const stateRoot = process.env.CLAWTEXT_STATE_ROOT || join(process.env.HOME || '', '.openclaw/workspace/state/clawtext/prod');
  const cacheDir = join(stateRoot, 'reflect', 'cache');
  
  if (!existsSync(cacheDir)) {
    console.log('[reflect] No cache directory found');
    return;
  }

  const { readdirSync, unlinkSync } = await import('fs');
  const files = readdirSync(cacheDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      unlinkSync(join(cacheDir, file));
    } catch {
      // skip locked files
    }
  }
  console.log(`[reflect] Cleared ${files.length} cached entries`);
}

/**
 * Get reflect statistics from telemetry
 */
export async function getStats(options?: { since?: string; limit?: number }) {
  const config = await loadConfig();
  const telemetry = await getTelemetryStats(options);
  
  return {
    config: {
      enabled: config.enabled,
      trigger: config.trigger,
      model: config.model,
      budget: config.budget,
    },
    ...telemetry,
  };
}

export default {
  reflect,
  shouldReflect,
  loadConfig,
  saveConfig,
  clearCache,
  getStats
};
