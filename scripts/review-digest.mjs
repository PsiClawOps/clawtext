#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const workspacePath = process.argv[2] || process.env.HOME + '/.openclaw/workspace';
const reviewDir = path.join(workspacePath, 'memory', 'review');

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function tryFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([^:]+):\s*(.*)$/);
    if (mm) out[mm[1].trim()] = mm[2].trim();
  }
  return out;
}

function guessCategory(name, text, fm) {
  return fm.category || fm.type || fm.project || (name.includes('error') ? 'error' : name.includes('learning') ? 'learning' : name.includes('feature') ? 'feature-request' : 'unknown');
}

function guessPriority(text, fm) {
  return fm.priority || (text.match(/priority\s*[:\-]\s*(low|medium|high|critical)/i)?.[1]?.toLowerCase()) || 'unknown';
}

function extractPatterns(text) {
  const patterns = [];
  const regexes = [
    /pattern-key\s*[:\-]\s*([a-z0-9_.\-]+)/ig,
    /setdeviceoffset/ig,
    /deviceCountChanged/ig,
    /gamedetector/ig,
    /smoothing/ig,
    /DriverOffsets/ig
  ];
  for (const re of regexes) {
    let match;
    while ((match = re.exec(text)) !== null) {
      patterns.push((match[1] || match[0]).toLowerCase());
    }
  }
  return [...new Set(patterns)].slice(0, 10);
}

if (!fs.existsSync(reviewDir)) {
  console.log(JSON.stringify({ workspacePath, reviewDir, exists: false, itemCount: 0 }, null, 2));
  process.exit(0);
}

const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md') || f.endsWith('.json')).sort();
const byCategory = {};
const byPriority = {};
const byPattern = {};
const samples = [];

for (const file of files) {
  const full = path.join(reviewDir, file);
  const text = readText(full);
  const fm = tryFrontmatter(text);
  const category = guessCategory(file, text, fm);
  const priority = guessPriority(text, fm);
  const patterns = extractPatterns(text);

  byCategory[category] = (byCategory[category] || 0) + 1;
  byPriority[priority] = (byPriority[priority] || 0) + 1;
  for (const p of patterns) byPattern[p] = (byPattern[p] || 0) + 1;

  if (samples.length < 12) {
    samples.push({
      file,
      category,
      priority,
      patterns,
      preview: text.replace(/\s+/g, ' ').slice(0, 160)
    });
  }
}

const topPatterns = Object.entries(byPattern)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([pattern, count]) => ({ pattern, count }));

console.log(JSON.stringify({
  workspacePath,
  reviewDir,
  itemCount: files.length,
  byCategory,
  byPriority,
  topPatterns,
  samples
}, null, 2));
