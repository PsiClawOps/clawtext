#!/usr/bin/env node
/**
 * deploy-hooks.mjs
 *
 * Compiles ClawText hook handlers and deploys them to the OpenClaw hooks
 * install directory. Also updates hooks.internal.installs in openclaw.json.
 *
 * Usage:
 *   node scripts/deploy-hooks.mjs [--hooks hook1,hook2] [--dry-run]
 *
 * Options:
 *   --hooks    Comma-separated list of hooks to deploy (default: all)
 *   --dry-run  Show what would be done without making changes
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const HOOKS_SRC_DIR = path.join(REPO_ROOT, 'hooks');
const OPENCLAW_HOOKS_DIR = path.join(os.homedir(), '.openclaw', 'hooks');
const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hooksArg = args.find(a => a.startsWith('--hooks='));
const targetHooks = hooksArg ? hooksArg.split('=')[1].split(',') : null;

// All hooks managed by this deploy script
const ALL_HOOKS = [
  'clawtext-checkpoint',
  'clawtext-extract',
  'clawtext-flush',
  'clawtext-restore',
  'clawtext-ingest',
  'clawtext-si-shadow',
];

const hooks = targetHooks ? ALL_HOOKS.filter(h => targetHooks.includes(h)) : ALL_HOOKS;

console.log(`\n🔨 ClawText Hook Deploy${dryRun ? ' (DRY RUN)' : ''}`);
console.log(`Hooks: ${hooks.join(', ')}\n`);

let errors = 0;

for (const hook of hooks) {
  const srcDir = path.join(HOOKS_SRC_DIR, hook);
  const dstDir = path.join(OPENCLAW_HOOKS_DIR, hook);
  const handlerTs = path.join(srcDir, 'handler.ts');
  const handlerJs = path.join(srcDir, 'handler.js');
  const hookMd = path.join(srcDir, 'HOOK.md');

  console.log(`▸ ${hook}`);

  // 1. Compile handler.ts → handler.js (in-place next to the .ts)
  if (fs.existsSync(handlerTs)) {
    console.log(`  Compiling handler.ts...`);
    if (!dryRun) {
      try {
        execSync(
          `npx tsc "${handlerTs}" \
            --target ES2020 \
            --module ES2020 \
            --moduleResolution node \
            --declaration \
            --declarationMap \
            --sourceMap \
            --esModuleInterop \
            --skipLibCheck \
            --allowJs 2>&1 || true`,
          { cwd: REPO_ROOT, stdio: 'pipe' }
        );
      } catch (e) {
        // tsc exits non-zero on warnings; check if handler.js was produced
      }
    }
  }

  if (!fs.existsSync(handlerJs) && !dryRun) {
    console.error(`  ❌ handler.js not found after compile — skipping`);
    errors++;
    continue;
  }

  // 2. Create install dir
  if (!dryRun) fs.mkdirSync(dstDir, { recursive: true });
  console.log(`  Installing to ${dstDir}`);

  // 3. Copy handler.js + HOOK.md
  if (!dryRun) {
    fs.copyFileSync(handlerJs, path.join(dstDir, 'handler.js'));
    if (fs.existsSync(hookMd)) {
      fs.copyFileSync(hookMd, path.join(dstDir, 'HOOK.md'));
    }
  }

  // 4. Copy declaration files if present
  for (const ext of ['handler.d.ts', 'handler.d.ts.map', 'handler.js.map']) {
    const src = path.join(srcDir, ext);
    if (fs.existsSync(src) && !dryRun) {
      fs.copyFileSync(src, path.join(dstDir, ext));
    }
  }

  console.log(`  ✅ Done`);
}

// 5. Update hooks.internal.installs in openclaw.json
if (!dryRun && fs.existsSync(OPENCLAW_CONFIG)) {
  console.log(`\nUpdating openclaw.json installs...`);
  const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));
  const installs = config?.hooks?.internal?.installs ?? {};

  for (const hook of hooks) {
    installs[hook] = {
      source: 'path',
      sourcePath: path.join(HOOKS_SRC_DIR, hook),
      installPath: path.join(OPENCLAW_HOOKS_DIR, hook),
      installedAt: new Date().toISOString(),
      hooks: [hook],
    };
  }

  if (!config.hooks) config.hooks = {};
  if (!config.hooks.internal) config.hooks.internal = {};
  config.hooks.internal.installs = installs;

  fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
  console.log(`✅ openclaw.json updated`);
}

console.log(`\n${errors > 0 ? `⚠️  Completed with ${errors} error(s)` : '✅ All hooks deployed'}`);
if (!dryRun) console.log(`\n⚡ Run 'openclaw gateway restart' to apply changes.`);
