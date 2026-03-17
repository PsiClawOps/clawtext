#!/usr/bin/env node
/**
 * configure-restore.mjs
 *
 * View or update the clawtext-restore hook configuration.
 * All knobs control how much journal context gets injected at session bootstrap.
 *
 * Usage:
 *   node scripts/configure-restore.mjs                     # show current config
 *   node scripts/configure-restore.mjs --set key=value     # update a knob
 *   node scripts/configure-restore.mjs --reset             # reset to defaults
 *   node scripts/configure-restore.mjs --preset <name>     # apply a named preset
 *
 * Presets:
 *   minimal      — 10 msgs, 4KB budget  (small/fast models)
 *   default      — 20 msgs, 8KB budget  (standard)
 *   deep         — 50 msgs, 32KB budget (large context, e.g. 100k+)
 *   full         — 200 msgs, 128KB budget (max context, e.g. 200k+ token models)
 *   off          — disable auto-restore entirely
 *
 * Knobs:
 *   injectLimit         Max number of messages to inject (default: 20)
 *   maxContentBytes     Max bytes of content total (default: 8000 ≈ 2000 tokens)
 *   maxContextAgeHours  Max age of last message to bother restoring (default: 8)
 *   minMessages         Min messages required before injecting (default: 3)
 *   lookbackDays        How many journal days to scan (default: 2)
 *   previewCap          Per-message preview cap in bytes (default: 300)
 *   minScore            Minimum scorer threshold 0.0-1.0 (default: 0.25)
 *   enabled             true/false — master switch (default: true)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const CONFIG_FILE = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'restore-config.json');

const DEFAULTS = {
  enabled: true,
  injectLimit: 20,
  maxContextAgeHours: 8,
  minMessages: 3,
  lookbackDays: 2,
  maxContentBytes: 8000,
  previewCap: 300,
  minScore: 0.25,
};

const PRESETS = {
  minimal: { injectLimit: 10, maxContentBytes: 4000, previewCap: 200, minScore: 0.35, enabled: true },
  default: { ...DEFAULTS },
  deep:    { injectLimit: 50, maxContentBytes: 32000, previewCap: 600, minScore: 0.2, lookbackDays: 3, enabled: true },
  full:    { injectLimit: 200, maxContentBytes: 131072, previewCap: 2000, minScore: 0.1, lookbackDays: 7, enabled: true },
  off:     { enabled: false },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // Strip comment fields
      const { _comment, _docs, ...cfg } = raw;
      return { ...DEFAULTS, ...cfg };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveConfig(cfg) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out = {
    _comment: 'ClawText auto-restore configuration. All fields optional — missing fields use defaults.',
    _docs: 'Raise maxContentBytes and injectLimit for large context window models (e.g. 200k token).',
    ...cfg,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2) + '\n');
}

function coerce(key, val) {
  if (key === 'enabled') return val === 'true' || val === '1';
  const n = Number(val);
  if (!Number.isNaN(n)) return n;
  return val;
}

function validateSetting(key, value) {
  if (key === 'enabled') {
    if (typeof value !== 'boolean') throw new Error('enabled must be true or false');
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a numeric value`);
  }

  if (['injectLimit', 'maxContentBytes', 'maxContextAgeHours', 'minMessages', 'lookbackDays', 'previewCap'].includes(key) && value < 0) {
    throw new Error(`${key} must be >= 0`);
  }

  if (key === 'minScore' && (value < 0 || value > 1)) {
    throw new Error('minScore must be between 0 and 1');
  }
}

function printConfig(cfg) {
  const tokenEst = Math.round(cfg.maxContentBytes / 4);
  console.log('\nClawText Auto-Restore Configuration');
  console.log('─'.repeat(50));
  console.log(`  enabled             ${cfg.enabled}`);
  console.log(`  injectLimit         ${cfg.injectLimit} messages`);
  console.log(`  maxContentBytes     ${cfg.maxContentBytes.toLocaleString()} bytes (~${tokenEst.toLocaleString()} tokens)`);
  console.log(`  previewCap          ${cfg.previewCap} bytes per message`);
  console.log(`  maxContextAgeHours  ${cfg.maxContextAgeHours} hours`);
  console.log(`  minMessages         ${cfg.minMessages} minimum`);
  console.log(`  lookbackDays        ${cfg.lookbackDays} days`);
  console.log(`  minScore            ${cfg.minScore}`);
  console.log('─'.repeat(50));
  console.log(`  Config file: ${CONFIG_FILE}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--reset')) {
  saveConfig(DEFAULTS);
  console.log('Reset to defaults.');
  printConfig(DEFAULTS);
  process.exit(0);
}

const presetIdx = argv.indexOf('--preset');
if (presetIdx !== -1) {
  const name = argv[presetIdx + 1];
  if (!PRESETS[name]) {
    console.error(`Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }
  const current = loadConfig();
  const merged = { ...current, ...PRESETS[name] };
  saveConfig(merged);
  console.log(`Applied preset: ${name}`);
  printConfig(merged);
  process.exit(0);
}

const setIdx = argv.indexOf('--set');
if (setIdx !== -1) {
  const pair = argv[setIdx + 1];
  if (!pair || !pair.includes('=')) {
    console.error('Usage: --set key=value');
    process.exit(1);
  }
  const [key, ...rest] = pair.split('=');
  const val = rest.join('=');
  if (!(key in DEFAULTS)) {
    console.error(`Unknown key "${key}". Valid keys: ${Object.keys(DEFAULTS).join(', ')}`);
    process.exit(1);
  }
  const current = loadConfig();
  const coerced = coerce(key, val);
  try {
    validateSetting(key, coerced);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  current[key] = coerced;
  saveConfig(current);
  console.log(`Set ${key} = ${current[key]}`);
  printConfig(current);
  process.exit(0);
}

// Default: just show config
printConfig(loadConfig());
