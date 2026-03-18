#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const STATE_DIR = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'ingest');
const REINDEX_STATE_FILE = path.join(STATE_DIR, 'journal-reindex-state.json');
const BUILD_CLUSTERS = path.join(WORKSPACE, 'repo', 'clawtext', 'scripts', 'build-clusters.js');

function parseArgs(argv) {
  const args = {
    channel: null,
    hours: 24,
    since: null,
    until: null,
    rebuild: true,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--channel': args.channel = argv[++i]; break;
      case '--hours': args.hours = Math.max(1, parseInt(argv[++i], 10) || 24); break;
      case '--since': args.since = argv[++i]; break;
      case '--until': args.until = argv[++i]; break;
      case '--no-rebuild': args.rebuild = false; break;
      case '--dry-run': args.dryRun = true; break;
      case '--verbose': args.verbose = true; break;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const log = (...a) => console.log('[journal-reindex]', ...a);
const debug = (...a) => { if (args.verbose) console.log('[journal-reindex:debug]', ...a); };

if (!args.channel) {
  console.error('Usage: node scripts/journal-reindex.mjs --channel <channelId> [--hours 48|--since ISO] [--no-rebuild] [--dry-run] [--verbose]');
  process.exit(1);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadState() {
  return safeReadJson(REINDEX_STATE_FILE, {
    version: 1,
    updatedAt: null,
    processedKeys: {},
  });
}

function saveState(state) {
  ensureDir(STATE_DIR);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    processedKeys: state.processedKeys || {},
  };
  fs.writeFileSync(REINDEX_STATE_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function parseTs(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function computeWindow() {
  const nowMs = Date.now();
  const sinceMs = args.since ? parseTs(args.since) : nowMs - args.hours * 60 * 60 * 1000;
  const untilMs = args.until ? parseTs(args.until) : nowMs;
  if (!sinceMs || !untilMs || sinceMs > untilMs) {
    throw new Error('Invalid --since/--until window');
  }
  return { sinceMs, untilMs };
}

function listJournalFiles() {
  if (!fs.existsSync(JOURNAL_DIR)) return [];
  return fs.readdirSync(JOURNAL_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort()
    .map((f) => path.join(JOURNAL_DIR, f));
}

function makeRecordKey(rec) {
  if (rec.discordMessageId) return `discord:${rec.channel}:${rec.discordMessageId}`;
  const hash = crypto.createHash('sha1').update(String(rec.content || '')).digest('hex').slice(0, 16);
  return `journal:${rec.channel}:${rec.ts}:${hash}`;
}

function normalizeContent(rec) {
  const sender = rec.sender || rec.from || 'unknown';
  const direction = rec.dir === 'out' ? 'assistant' : 'user';
  const text = String(rec.content || '').replace(/\s+/g, ' ').trim();
  return `(${direction}) ${sender}: ${text}`;
}

function entryToMarkdown(rec, key) {
  const iso = rec.iso || new Date(rec.ts).toISOString();
  const channel = rec.channel || 'unknown';
  const sender = String(rec.sender || rec.from || 'unknown');
  const source = String(rec.source || 'journal-reindex');
  const safeSender = sender.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
  const body = normalizeContent(rec);
  const keywords = ['discord', 'journal-reindex', safeSender].filter(Boolean);

  return [
    '---',
    `date: ${iso}`,
    'type: discord_journal',
    `source: ${source}`,
    `channel: ${channel}`,
    `sender: ${sender}`,
    `source_ref: ${key}`,
    `keywords: [${keywords.join(', ')}]`,
    '---',
    '',
    body,
    '',
  ].join('\n');
}

function collectJournalRecords(channelId, sinceMs, untilMs, processedKeys) {
  const matches = [];
  const files = listJournalFiles();

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }

      const recChannel = rec.channel || rec.conversationId;
      if (String(recChannel) !== String(channelId)) continue;
      if (rec.type === 'checkpoint') continue;
      if (!rec.content || typeof rec.content !== 'string') continue;

      const ts = parseTs(rec.ts || rec.iso);
      if (!ts || ts < sinceMs || ts > untilMs) continue;

      const key = makeRecordKey({ ...rec, ts, channel: recChannel });
      if (processedKeys[key]) continue;

      matches.push({ ...rec, ts, channel: String(recChannel), __key: key });
    }
  }

  matches.sort((a, b) => a.ts - b.ts);
  return matches;
}

function writeMemoryEntries(records, dryRun) {
  const byDate = new Map();
  for (const rec of records) {
    const date = new Date(rec.ts).toISOString().slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(rec);
  }

  if (!dryRun) ensureDir(MEMORY_DIR);

  let written = 0;
  for (const [date, recs] of byDate) {
    const file = path.join(MEMORY_DIR, `${date}.md`);
    const payload = recs.map((rec) => entryToMarkdown(rec, rec.__key)).join('\n');
    if (dryRun) {
      log(`[dry-run] Would append ${recs.length} entries to ${path.basename(file)}`);
    } else {
      fs.appendFileSync(file, payload, 'utf8');
      written += recs.length;
    }
  }
  return written;
}

function rebuildClusters() {
  const result = spawnSync('node', [BUILD_CLUSTERS, '--force'], {
    cwd: path.join(WORKSPACE, 'repo', 'clawtext'),
    stdio: 'pipe',
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

async function main() {
  const { sinceMs, untilMs } = computeWindow();
  const state = loadState();
  const processedKeys = state.processedKeys || {};

  log(`Scanning journal for channel ${args.channel}`);
  log(`Window: ${new Date(sinceMs).toISOString()} → ${new Date(untilMs).toISOString()}`);

  const matches = collectJournalRecords(args.channel, sinceMs, untilMs, processedKeys);
  log(`Found ${matches.length} unprocessed journal records in window`);

  if (args.verbose && matches.length > 0) {
    for (const rec of matches.slice(0, 5)) {
      debug(`[${new Date(rec.ts).toISOString()}] ${String(rec.content).slice(0, 100)}`);
    }
    if (matches.length > 5) debug(`... and ${matches.length - 5} more`);
  }

  if (matches.length === 0) {
    log('Nothing to reindex');
    return;
  }

  const written = writeMemoryEntries(matches, args.dryRun);

  if (!args.dryRun) {
    for (const rec of matches) processedKeys[rec.__key] = true;
    saveState({ processedKeys });
  }

  let rebuild = null;
  if (!args.dryRun && args.rebuild) {
    rebuild = rebuildClusters();
    if (rebuild.status !== 0) {
      console.error('[journal-reindex] cluster rebuild failed');
      if (rebuild.stderr) console.error(rebuild.stderr.trim());
      process.exitCode = 1;
    }
  }

  log('=== Reindex complete ===');
  log(`  Channel:   ${args.channel}`);
  log(`  Entries:   ${matches.length}`);
  log(`  Written:   ${args.dryRun ? '(dry-run)' : written}`);
  log(`  Window:    ${new Date(sinceMs).toISOString()} → ${new Date(untilMs).toISOString()}`);
  if (rebuild) log(`  Rebuild:   ${rebuild.status === 0 ? 'ok' : 'failed'}`);
}

main().catch((err) => {
  console.error('[journal-reindex] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
