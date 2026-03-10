#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const workspacePath = process.argv[2] || process.env.HOME + '/.openclaw/workspace';
const reviewDir = path.join(workspacePath, 'memory', 'review');
const archiveDir = path.join(workspacePath, 'memory', 'review-deduped');
const apply = process.argv.includes('--apply');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalize(text) {
  return text
    .replace(/^---[\s\S]*?---\n?/m, '')
    .replace(/ts:\s*.+/g, '')
    .replace(/original:\s*.+/g, '')
    .replace(/source:\s*.+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

if (!fs.existsSync(reviewDir)) {
  console.log(JSON.stringify({ workspacePath, reviewDir, exists: false, duplicates: [] }, null, 2));
  process.exit(0);
}

const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md')).sort();
const groups = new Map();

for (const file of files) {
  const full = path.join(reviewDir, file);
  const text = fs.readFileSync(full, 'utf8');
  const key = hash(normalize(text));
  const arr = groups.get(key) || [];
  arr.push({ file, full });
  groups.set(key, arr);
}

const duplicates = [];
for (const [key, arr] of groups.entries()) {
  if (arr.length > 1) {
    duplicates.push({
      key,
      keep: arr[0].file,
      remove: arr.slice(1).map(x => x.file),
      count: arr.length
    });
  }
}

if (apply && duplicates.length > 0) {
  ensureDir(archiveDir);
  for (const group of duplicates) {
    for (const file of group.remove) {
      const src = path.join(reviewDir, file);
      const dest = path.join(archiveDir, file);
      if (fs.existsSync(src)) fs.renameSync(src, dest);
    }
  }
}

console.log(JSON.stringify({
  workspacePath,
  reviewDir,
  archiveDir,
  apply,
  duplicateGroups: duplicates.length,
  duplicateFiles: duplicates.reduce((n, g) => n + g.remove.length, 0),
  duplicates
}, null, 2));
