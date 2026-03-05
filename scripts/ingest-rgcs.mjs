/**
 * RGCS Forum Thread Ingestion
 * Fetches all messages from 6 RGCS Discord threads via direct API,
 * filters text-only (no attachments/embeds), deduplicates, ingests to ClawText.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DISCORD_TOKEN = JSON.parse(readFileSync('/home/lumadmin/.openclaw/credentials/discord.token.json')).token;
const CLUSTERS_DIR = '/home/lumadmin/memory/clusters';
const HASHES_FILE = '/home/lumadmin/memory/.ingest_hashes.json';

const THREADS = [
  { id: '1479000926403563590', name: 'RGCS Smoothing Development Part 3 - 1.2.361+' },
  { id: '1478240533557022730', name: 'RGCS Smoothing Development v1.2.324' },
  { id: '1477228911493386250', name: 'RGCS Smoothing Development v1.2.291 Summary' },
  { id: '1476882003847806996', name: 'RGCS Smoothing Development - Comprehensive History' },
  { id: '1476031084998295725', name: 'RGCS Development: Continuous Build & Feature Tracking' },
  { id: '1476031086894252133', name: 'RGCS Steam Store: Release & Approval Process' },
];

// Load existing dedup hashes
let hashes = {};
if (existsSync(HASHES_FILE)) {
  try { hashes = JSON.parse(readFileSync(HASHES_FILE, 'utf8')); } catch {}
}

if (!existsSync(CLUSTERS_DIR)) mkdirSync(CLUSTERS_DIR, { recursive: true });

async function fetchMessages(channelId) {
  const messages = [];
  let before = null;
  
  while (true) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${DISCORD_TOKEN}` }
    });
    
    if (!res.ok) {
      console.error(`  ⚠ API error ${res.status} for channel ${channelId}`);
      break;
    }
    
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    
    messages.push(...batch);
    before = batch[batch.length - 1].id;
    
    if (batch.length < 100) break;
    
    // Rate limit safety
    await new Promise(r => setTimeout(r, 300));
  }
  
  return messages;
}

function sha1(str) {
  return createHash('sha1').update(str).digest('hex');
}

function buildClusterYaml(thread, messages) {
  const lines = [
    '---',
    `source: discord-thread`,
    `thread_id: "${thread.id}"`,
    `thread_name: "${thread.name.replace(/"/g, '\\"')}"`,
    `message_count: ${messages.length}`,
    `ingested_at: "${new Date().toISOString()}"`,
    `tags: [rgcs, discord, development]`,
    '---',
    '',
    `# ${thread.name}`,
    '',
  ];
  
  for (const m of messages) {
    const author = m.author?.username || 'unknown';
    const ts = m.timestamp?.substring(0, 16) || '';
    const content = m.content.trim();
    if (content) {
      lines.push(`**[${ts}] ${author}:** ${content}`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

// Main ingestion
let totalImported = 0;
let totalSkipped = 0;
let totalMessages = 0;

console.log('🚀 Starting RGCS Forum Thread Ingestion\n');
console.log(`📋 Threads to ingest: ${THREADS.length}`);
console.log(`📁 Output: ${CLUSTERS_DIR}\n`);

for (const thread of THREADS) {
  console.log(`\n📥 Fetching: "${thread.name}" (${thread.id})`);
  
  const raw = await fetchMessages(thread.id);
  console.log(`   Raw messages: ${raw.length}`);
  
  // Filter: text only, no empty, no bot-only embeds
  const textOnly = raw.filter(m => {
    if (!m.content?.trim()) return false;
    if (m.attachments?.length > 0) return false; // skip attachments
    return true;
    // Note: embeds are skipped by only using m.content
  });
  
  console.log(`   After text filter: ${textOnly.length}`);
  
  // Deduplicate
  const deduped = [];
  let skipped = 0;
  for (const m of textOnly) {
    const hash = sha1(`${thread.id}:${m.id}:${m.content}`);
    if (hashes[hash]) {
      skipped++;
    } else {
      hashes[hash] = true;
      deduped.push(m);
    }
  }
  
  console.log(`   New (post-dedupe): ${deduped.length} | Skipped (dupes): ${skipped}`);
  
  if (deduped.length === 0) {
    console.log(`   ⏭ Nothing new to store.`);
    totalSkipped += skipped;
    totalMessages += raw.length;
    continue;
  }
  
  // Sort chronologically
  deduped.sort((a, b) => a.id.localeCompare(b.id));
  
  // Write cluster file
  const safeName = thread.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().substring(0, 50);
  const clusterPath = join(CLUSTERS_DIR, `rgcs-${thread.id}-${safeName}.md`);
  const yaml = buildClusterYaml(thread, deduped);
  writeFileSync(clusterPath, yaml, 'utf8');
  
  console.log(`   ✅ Written: rgcs-${thread.id}-${safeName}.md`);
  
  totalImported += deduped.length;
  totalSkipped += skipped;
  totalMessages += raw.length;
}

// Save updated hashes
writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2));

console.log('\n' + '═'.repeat(50));
console.log('✅ RGCS INGESTION COMPLETE');
console.log('═'.repeat(50));
console.log(`  Total raw messages fetched:  ${totalMessages}`);
console.log(`  Imported (new):              ${totalImported}`);
console.log(`  Skipped (duplicates):        ${totalSkipped}`);
console.log(`  Clusters written:            ${CLUSTERS_DIR}`);
console.log(`  Dedup hashes saved:          ${HASHES_FILE}`);
console.log('═'.repeat(50));
