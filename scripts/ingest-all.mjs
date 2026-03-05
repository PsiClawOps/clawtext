#!/usr/bin/env node
/**
 * ingest-all.mjs — Master ingestion script
 * Runs all Discord channel/thread ingestions in sequence, then rebuilds clusters.
 * Safe to run repeatedly — full deduplication prevents re-ingesting anything.
 *
 * Covers:
 *   - #rgcs-dev forum (1476018965284261908) — 6 RGCS threads
 *   - #ai-projects forum (1475021817168134144) — all threads
 *   - #moltmud-projects forum (1477543809905721365) — all threads
 *   - #general (1474997928056590339) — threads
 *   - #status (1475019186563448852) — direct messages
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISCORD_TOKEN = JSON.parse(readFileSync('/home/lumadmin/.openclaw/credentials/discord.token.json')).token;
const CLUSTERS_DIR = '/home/lumadmin/memory/clusters';
const HASHES_FILE = '/home/lumadmin/memory/.ingest_hashes.json';
const GUILD_ID = '1474997926919929927';
const BUILD_CLUSTERS = join(__dirname, '../hooks/build-clusters.js');
const LOG_FILE = '/home/lumadmin/memory/.ingest-log.jsonl';

const SOURCES = [
  // Forum channels (have threads)
  { id: '1476018965284261908', type: 'forum', name: 'rgcs-dev' },
  { id: '1475021817168134144', type: 'forum', name: 'ai-projects' },
  { id: '1477543809905721365', type: 'forum', name: 'moltmud-projects' },
  { id: '1474997928056590339', type: 'channel', name: 'general' },
  // Regular channels (direct messages)
  { id: '1475019186563448852', type: 'channel', name: 'status' },
];

let hashes = {};
if (existsSync(HASHES_FILE)) {
  try { hashes = JSON.parse(readFileSync(HASHES_FILE, 'utf8')); } catch {}
}
if (!existsSync(CLUSTERS_DIR)) mkdirSync(CLUSTERS_DIR, { recursive: true });

async function apiGet(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
    });
    if (res.status === 429) {
      const data = await res.json();
      const wait = (data.retry_after || 1) * 1000 + 200;
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Max retries exceeded`);
}

async function fetchAllThreads(forumId) {
  const threads = new Map();
  try {
    const active = await apiGet(`/guilds/${GUILD_ID}/threads/active`);
    for (const t of (active.threads || [])) {
      if (t.parent_id === forumId) threads.set(t.id, t);
    }
  } catch (e) { console.warn(`  ⚠ active threads: ${e.message}`); }

  let before = null;
  while (true) {
    try {
      const url = `/channels/${forumId}/threads/archived/public?limit=100${before ? `&before=${before}` : ''}`;
      const data = await apiGet(url);
      for (const t of (data.threads || [])) threads.set(t.id, t);
      if (!data.has_more || !data.threads?.length) break;
      before = data.threads[data.threads.length - 1].thread_metadata?.archive_timestamp;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.warn(`  ⚠ archived: ${e.message}`); break; }
  }
  return [...threads.values()];
}

async function fetchMessages(channelId) {
  const messages = [];
  let before = null;
  while (true) {
    try {
      const batch = await apiGet(`/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
      if (!Array.isArray(batch) || batch.length === 0) break;
      messages.push(...batch);
      before = batch[batch.length - 1].id;
      if (batch.length < 100) break;
      await new Promise(r => setTimeout(r, 250));
    } catch (e) { console.warn(`  ⚠ messages ${channelId}: ${e.message}`); break; }
  }
  return messages;
}

function sha1(str) { return createHash('sha1').update(str).digest('hex'); }

function writeCluster(thread, sourceName, messages) {
  const safeName = (thread.name || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase().substring(0, 50);
  const filename = `${sourceName}-${thread.id}-${safeName}.md`;
  const lines = [
    '---',
    `source: discord`,
    `forum: "${sourceName}"`,
    `thread_id: "${thread.id}"`,
    `thread_name: "${(thread.name || '').replace(/"/g, '\\"')}"`,
    `message_count: ${messages.length}`,
    `ingested_at: "${new Date().toISOString()}"`,
    `tags: [discord, ${sourceName}]`,
    '---', '',
    `# ${thread.name || thread.id}`, '',
  ];
  for (const m of messages) {
    if (m.content?.trim()) {
      const ts = (m.timestamp || '').substring(0, 16);
      const author = m.author?.username || 'unknown';
      lines.push(`**[${ts}] ${author}:** ${m.content.trim()}`, '');
    }
  }
  writeFileSync(join(CLUSTERS_DIR, filename), lines.join('\n'), 'utf8');
  return filename;
}

function ingestMessages(messages, contextId) {
  const deduped = [];
  let dupes = 0;
  const textOnly = messages.filter(m => m.content?.trim() && !m.attachments?.length);
  for (const m of textOnly) {
    const hash = sha1(`${contextId}:${m.id}:${m.content}`);
    if (hashes[hash]) { dupes++; } else { hashes[hash] = true; deduped.push(m); }
  }
  deduped.sort((a, b) => a.id.localeCompare(b.id));
  return { deduped, dupes };
}

// ── Main ──────────────────────────────────────────────────────────────

const startTime = Date.now();
const runStats = { sources: 0, threads: 0, fetched: 0, imported: 0, skipped: 0 };

console.log(`🚀 ingest-all.mjs — ${new Date().toISOString()}`);
console.log(`   Sources: ${SOURCES.length} channels\n`);

for (const source of SOURCES) {
  console.log(`\n${'═'.repeat(58)}`);

  // Get channel info
  let chanName = source.name;
  try {
    const info = await apiGet(`/channels/${source.id}`);
    chanName = info.name || source.name;
    source.name = chanName;
    const typeLabel = info.type === 15 ? 'forum' : info.type === 0 ? 'text' : `type${info.type}`;
    console.log(`📂 #${chanName} [${typeLabel}] (${source.id})`);
  } catch (e) {
    console.log(`📂 ${source.id} (${e.message})`);
  }
  console.log('═'.repeat(58));

  const threads = await fetchAllThreads(source.id);

  if (threads.length > 0) {
    console.log(`   ${threads.length} threads found\n`);
    for (const thread of threads) {
      const label = (thread.name || '').substring(0, 52);
      process.stdout.write(`  📥 "${label}"... `);
      const raw = await fetchMessages(thread.id);
      const { deduped, dupes } = ingestMessages(raw, thread.id);
      runStats.fetched += raw.length;
      runStats.skipped += dupes;
      runStats.threads++;
      if (deduped.length === 0) { console.log(`⏭ (${dupes} dupes)`); continue; }
      writeCluster(thread, chanName, deduped);
      console.log(`✅ ${deduped.length} new  (${dupes} dupes)`);
      runStats.imported += deduped.length;
    }
  } else {
    // Regular channel — ingest directly
    console.log(`   No threads — ingesting channel directly\n`);
    process.stdout.write(`  📥 #${chanName} (direct)... `);
    const raw = await fetchMessages(source.id);
    const { deduped, dupes } = ingestMessages(raw, source.id);
    runStats.fetched += raw.length;
    runStats.skipped += dupes;
    runStats.threads++;
    if (deduped.length > 0) {
      writeCluster({ id: source.id, name: chanName }, chanName, deduped);
      console.log(`✅ ${deduped.length} new  (${dupes} dupes)`);
      runStats.imported += deduped.length;
    } else {
      console.log(`⏭ nothing new`);
    }
  }
  runStats.sources++;
}

// Save hashes
writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2));

// Rebuild clusters
console.log(`\n🔄 Rebuilding RAG cluster index...`);
try {
  const result = execSync(`node ${BUILD_CLUSTERS}`, { encoding: 'utf8' });
  console.log(result.trim());
} catch (e) {
  console.warn(`⚠ Cluster rebuild failed: ${e.message}`);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// Append to ingest log
const logEntry = {
  ts: new Date().toISOString(),
  elapsed_s: parseFloat(elapsed),
  ...runStats,
};
const logLine = JSON.stringify(logEntry) + '\n';
writeFileSync(LOG_FILE, logLine, { flag: 'a' });

console.log(`\n${'═'.repeat(58)}`);
console.log(`✅ ingest-all COMPLETE  (${elapsed}s)`);
console.log('═'.repeat(58));
console.log(`  Sources:   ${runStats.sources}`);
console.log(`  Threads:   ${runStats.threads}`);
console.log(`  Fetched:   ${runStats.fetched}`);
console.log(`  Imported:  ${runStats.imported}`);
console.log(`  Skipped:   ${runStats.skipped} (dupes)`);
console.log('═'.repeat(58));
