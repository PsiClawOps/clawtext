#!/usr/bin/env node
/**
 * build-clusters.js
 * Reads all markdown files in /home/lumadmin/memory/clusters/
 * and rebuilds a unified index for ClawText RAG.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const CLUSTERS_DIR = '/home/lumadmin/memory/clusters';
const INDEX_FILE = join(CLUSTERS_DIR, '_index.json');

if (!existsSync(CLUSTERS_DIR)) {
  mkdirSync(CLUSTERS_DIR, { recursive: true });
}

const files = readdirSync(CLUSTERS_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
const index = [];

let totalChunks = 0;

for (const file of files) {
  const filePath = join(CLUSTERS_DIR, file);
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Parse YAML frontmatter
  let meta = { source: 'unknown', tags: [] };
  if (lines[0] === '---') {
    const endFm = lines.indexOf('---', 1);
    if (endFm > 0) {
      const fm = lines.slice(1, endFm).join('\n');
      const tagMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
      const nameMatch = fm.match(/thread_name:\s*"(.+?)"/);
      const idMatch = fm.match(/thread_id:\s*"(.+?)"/);
      const countMatch = fm.match(/message_count:\s*(\d+)/);
      if (tagMatch) meta.tags = tagMatch[1].split(',').map(t => t.trim());
      if (nameMatch) meta.name = nameMatch[1];
      if (idMatch) meta.thread_id = idMatch[1];
      if (countMatch) meta.message_count = parseInt(countMatch[1]);
    }
  }
  
  // Split into ~500 char chunks for RAG
  const bodyStart = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const body = lines.slice(bodyStart).join('\n').trim();
  
  const chunkSize = 600;
  const words = body.split(/\s+/);
  let chunk = '';
  let chunkIdx = 0;
  
  for (const word of words) {
    chunk += word + ' ';
    if (chunk.length >= chunkSize) {
      index.push({
        id: `${basename(file, '.md')}-${chunkIdx}`,
        file,
        tags: meta.tags,
        name: meta.name || file,
        thread_id: meta.thread_id,
        content: chunk.trim(),
      });
      totalChunks++;
      chunkIdx++;
      chunk = '';
    }
  }
  if (chunk.trim()) {
    index.push({
      id: `${basename(file, '.md')}-${chunkIdx}`,
      file,
      tags: meta.tags,
      name: meta.name || file,
      thread_id: meta.thread_id,
      content: chunk.trim(),
    });
    totalChunks++;
  }
}

writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));

console.log(`✅ Cluster index rebuilt`);
console.log(`   Files indexed: ${files.length}`);
console.log(`   Total chunks:  ${totalChunks}`);
console.log(`   Index written: ${INDEX_FILE}`);
