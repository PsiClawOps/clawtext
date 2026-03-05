/**
 * Bulk forum ingestion — fetches all threads (active + archived) from
 * two forum channels and ingests all messages via ClawText.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DISCORD_TOKEN = JSON.parse(readFileSync('/home/lumadmin/.openclaw/credentials/discord.token.json')).token;
const CLUSTERS_DIR = '/home/lumadmin/memory/clusters';
const HASHES_FILE = '/home/lumadmin/memory/.ingest_hashes.json';
const GUILD_ID = '1474997926919929927';

const FORUM_CHANNELS = [
  { id: '1475021817168134144', name: 'ai-projects' },
  { id: '1477543809905721365', name: 'moltmud-projects' },
];

// Load existing dedup hashes
let hashes = {};
if (existsSync(HASHES_FILE)) {
  try { hashes = JSON.parse(readFileSync(HASHES_FILE, 'utf8')); } catch {}
}
if (!existsSync(CLUSTERS_DIR)) mkdirSync(CLUSTERS_DIR, { recursive: true });

async function apiGet(path) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

async function fetchAllThreads(forumId) {
  const threads = new Map();

  // 1. Active threads from guild
  try {
    const active = await apiGet(`/guilds/${GUILD_ID}/threads/active`);
    for (const t of (active.threads || [])) {
      if (t.parent_id === forumId) threads.set(t.id, t);
    }
  } catch (e) { console.warn('  ⚠ active threads:', e.message); }

  // 2. Public archived threads (paginate)
  let before = null;
  while (true) {
    try {
      const url = `/channels/${forumId}/threads/archived/public?limit=100${before ? `&before=${before}` : ''}`;
      const data = await apiGet(url);
      for (const t of (data.threads || [])) threads.set(t.id, t);
      if (!data.has_more || !data.threads?.length) break;
      before = data.threads[data.threads.length - 1].thread_metadata?.archive_timestamp;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.warn('  ⚠ archived threads:', e.message); break; }
  }

  return [...threads.values()];
}

async function fetchMessages(channelId) {
  const messages = [];
  let before = null;
  while (true) {
    const url = `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`;
    try {
      const batch = await apiGet(url);
      if (!Array.isArray(batch) || batch.length === 0) break;
      messages.push(...batch);
      before = batch[batch.length - 1].id;
      if (batch.length < 100) break;
      await new Promise(r => setTimeout(r, 250));
    } catch (e) { console.warn(`  ⚠ fetch msgs ${channelId}:`, e.message); break; }
  }
  return messages;
}

function sha1(str) {
  return createHash('sha1').update(str).digest('hex');
}

function buildCluster(thread, forumName, messages) {
  const safeName = (thread.name || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase().substring(0, 50);
  const lines = [
    '---',
    `source: discord-forum`,
    `forum: "${forumName}"`,
    `thread_id: "${thread.id}"`,
    `thread_name: "${(thread.name || '').replace(/"/g, '\\"')}"`,
    `message_count: ${messages.length}`,
    `ingested_at: "${new Date().toISOString()}"`,
    `tags: [discord, ${forumName}]`,
    '---',
    '',
    `# ${thread.name || thread.id}`,
    '',
  ];
  for (const m of messages) {
    const author = m.author?.username || 'unknown';
    const ts = (m.timestamp || '').substring(0, 16);
    if (m.content?.trim()) {
      lines.push(`**[${ts}] ${author}:** ${m.content.trim()}`);
      lines.push('');
    }
  }
  return {
    filename: `${forumName}-${thread.id}-${safeName}.md`,
    content: lines.join('\n'),
  };
}

// ── Main ──────────────────────────────────────────────────────────────

let grandTotal = { threads: 0, fetched: 0, imported: 0, skipped: 0 };

for (const forum of FORUM_CHANNELS) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📂 FORUM: #${forum.name} (${forum.id})`);
  console.log('═'.repeat(55));

  const threads = await fetchAllThreads(forum.id);
  console.log(`   Found ${threads.length} threads\n`);

  for (const thread of threads) {
    const msgCount = thread.message_count || thread.total_message_sent || '?';
    process.stdout.write(`  📥 "${thread.name?.substring(0, 55)}" (~${msgCount} msgs)... `);

    const raw = await fetchMessages(thread.id);
    const textOnly = raw.filter(m => m.content?.trim() && !(m.attachments?.length > 0));

    // Deduplicate
    const deduped = [];
    let dupes = 0;
    for (const m of textOnly) {
      const hash = sha1(`${thread.id}:${m.id}:${m.content}`);
      if (hashes[hash]) { dupes++; }
      else { hashes[hash] = true; deduped.push(m); }
    }

    if (deduped.length === 0) {
      console.log(`⏭ all dupes`);
      grandTotal.skipped += dupes;
      grandTotal.fetched += raw.length;
      grandTotal.threads++;
      continue;
    }

    deduped.sort((a, b) => a.id.localeCompare(b.id));
    const { filename, content } = buildCluster(thread, forum.name, deduped);
    writeFileSync(join(CLUSTERS_DIR, filename), content, 'utf8');

    console.log(`✅ ${deduped.length} new (${dupes} dupes)`);
    grandTotal.imported += deduped.length;
    grandTotal.skipped += dupes;
    grandTotal.fetched += raw.length;
    grandTotal.threads++;
  }
}

// Save hashes
writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2));

console.log(`\n${'═'.repeat(55)}`);
console.log('✅ BULK FORUM INGESTION COMPLETE');
console.log('═'.repeat(55));
console.log(`  Threads processed:    ${grandTotal.threads}`);
console.log(`  Messages fetched:     ${grandTotal.fetched}`);
console.log(`  Messages imported:    ${grandTotal.imported}`);
console.log(`  Duplicates skipped:   ${grandTotal.skipped}`);
console.log(`  Output: ${CLUSTERS_DIR}`);
console.log('═'.repeat(55));
