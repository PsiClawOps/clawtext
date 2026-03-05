#!/usr/bin/env node
/**
 * build-clusters.js — ClawText cluster builder
 *
 * Reads all markdown memory files from ~/.openclaw/workspace/memory/
 * and rebuilds JSON cluster files in memory/clusters/.
 *
 * Clusters are grouped by project keyword. Each memory entry is a
 * chunk of the source file with extracted keywords and metadata.
 *
 * Usage:
 *   node scripts/build-clusters.js          # incremental (skip if fresh)
 *   node scripts/build-clusters.js --force  # always rebuild
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const CLUSTERS_DIR = path.join(MEMORY_DIR, 'clusters');

// Project keyword routing — same as plugin.js projectKeywords
const PROJECT_KEYWORDS = {
  moltmud:        ['moltmud', 'zorthak', 'mud', 'bridge'],
  openclaw:       ['openclaw', 'gateway', 'plugin', 'session', 'cron', 'heartbeat'],
  rgcs:           ['rgcs', 'steamvr', 'driver', 'smoothing', 'controller', 'overlay', 'hmd', 'quaternion'],
  clawtext:       ['clawtext', 'cluster', 'rag', 'injection', 'embedding', 'extract', 'ingest'],
  infrastructure: ['infrastructure', 'deployment', 'server', 'ssh', 'config', 'setup', 'tailscale'],
};

// Noise words to exclude from keyword extraction
const NOISE = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'this','that','these','those','it','its','i','we','you','they','he','she',
  'and','or','but','if','in','on','at','to','for','of','with','by','from',
  'as','into','through','during','before','after','above','below','between',
  'out','off','over','under','again','further','then','once','here','there',
  'when','where','why','how','all','both','each','few','more','most','other',
  'some','such','no','not','only','own','same','so','than','too','very',
  'just','because','while','although','however','therefore','thus','also',
  'new','old','good','bad','first','last','next','many','much','any','every',
  'get','got','make','made','use','used','run','said','about','like','need',
  'see','work','call','add','now','back','way','set','put','long','down','day',
  'well','even','true','false','null','undefined','var','let','const','function',
]);

const forceRebuild = process.argv.includes('--force');

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !NOISE.has(w));
}

function topKeywords(text, n = 10) {
  const freq = {};
  tokenize(text).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function detectProject(text, keywords) {
  const lower = (text + ' ' + keywords.join(' ')).toLowerCase();
  let best = 'default';
  let bestScore = 0;
  for (const [proj, kws] of Object.entries(PROJECT_KEYWORDS)) {
    const score = kws.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = proj; }
  }
  return best;
}

function detectType(frontmatter, content) {
  if (frontmatter.type) return frontmatter.type;
  const lower = content.toLowerCase();
  if (lower.includes('error') || lower.includes('fix') || lower.includes('bug')) return 'error-pattern';
  if (lower.includes('decided') || lower.includes('decision') || lower.includes('chose')) return 'decision';
  if (lower.includes('```') || lower.includes('function') || lower.includes('const ')) return 'code-pattern';
  if (lower.includes('learned') || lower.includes('lesson') || lower.includes('note')) return 'learning';
  return 'fact';
}

function parseFrontmatter(block) {
  const fm = {};
  if (!block) return fm;
  block.split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      const val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        fm[m[1]] = val.slice(1,-1).split(',').map(v => v.trim()).filter(Boolean);
      } else {
        fm[m[1]] = val;
      }
    }
  });
  return fm;
}

function splitIntoChunks(content, sourceFile) {
  const chunks = [];
  const fmBlockRe = /^---\n([\s\S]*?)\n---\n([\s\S]*?)(?=^---|\Z)/gm;
  const h2Re = /^## (.+)$/gm;

  // Try YAML-frontmatter style blocks first (our extracted memories format)
  let hasFm = false;
  let match;
  const fmMatches = [];
  const fullFmRe = /---\n([\s\S]*?)\n---\n\n([\s\S]*?)(?=\n---\n|\n## |\n### |$)/g;
  while ((match = fullFmRe.exec(content)) !== null) {
    const fm = parseFrontmatter(match[1]);
    const body = match[2].trim();
    if (body.length > 20) {
      fmMatches.push({ fm, body });
      hasFm = true;
    }
  }

  if (hasFm) {
    fmMatches.forEach(({ fm, body }) => {
      const keywords = fm.keywords || topKeywords(body);
      const project = fm.project || detectProject(body, Array.isArray(keywords) ? keywords : []);
      const type = detectType(fm, body);
      const confidence = 0.8; // explicitly authored memories are high confidence
      chunks.push({ content: body, keywords: Array.isArray(keywords) ? keywords : [keywords], project, type, confidence, sourceFile });
    });
    return chunks;
  }

  // Fall back: split by ## headings
  const sections = content.split(/^## /m).filter(Boolean);
  sections.forEach(section => {
    const lines = section.trim().split('\n');
    const heading = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    if (body.length < 30) return;
    const full = heading + ' ' + body;
    const keywords = topKeywords(full);
    const project = detectProject(full, keywords);
    const type = detectType({}, full);
    chunks.push({ content: heading + '\n\n' + body, keywords, project, type, confidence: 0.65, sourceFile });
  });

  return chunks;
}

function loadMemoryFiles() {
  const mdFiles = [];

  // Root memory dir
  fs.readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .forEach(f => mdFiles.push(path.join(MEMORY_DIR, f)));

  // memory/memory/ subdir if exists
  const subDir = path.join(MEMORY_DIR, 'memory');
  if (fs.existsSync(subDir)) {
    fs.readdirSync(subDir)
      .filter(f => f.endsWith('.md'))
      .forEach(f => mdFiles.push(path.join(subDir, f)));
  }

  // Workspace root MEMORY.md
  const rootMem = path.join(WORKSPACE, 'MEMORY.md');
  if (fs.existsSync(rootMem)) mdFiles.push(rootMem);

  return mdFiles;
}

// --- Main ---

fs.mkdirSync(CLUSTERS_DIR, { recursive: true });

const files = loadMemoryFiles();
console.log(`[build-clusters] Found ${files.length} memory files`);

// Group chunks by project
const byProject = {};

files.forEach(filePath => {
  const rel = path.relative(WORKSPACE, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.warn(`  skip ${rel}: ${e.message}`);
    return;
  }

  const chunks = splitIntoChunks(content, rel);
  chunks.forEach(chunk => {
    const proj = chunk.project || 'default';
    if (!byProject[proj]) byProject[proj] = [];
    byProject[proj].push({
      content:    chunk.content,
      keywords:   chunk.keywords,
      type:       chunk.type,
      project:    proj,
      confidence: chunk.confidence,
      sourceFile: chunk.sourceFile,
      updatedAt:  new Date().toISOString(),
    });
  });
});

// Write cluster files
const builtAt = new Date().toISOString();
let totalMemories = 0;
let writtenClusters = 0;

for (const [project, memories] of Object.entries(byProject)) {
  if (memories.length === 0) continue;

  const clusterFile = path.join(CLUSTERS_DIR, `cluster-${project}.json`);
  const cluster = {
    projectId: project,
    memories,
    builtAt,
    sourceFiles: [...new Set(memories.map(m => m.sourceFile))],
  };

  fs.writeFileSync(clusterFile, JSON.stringify(cluster, null, 2));
  totalMemories += memories.length;
  writtenClusters++;
  console.log(`  [${project}] ${memories.length} memories → cluster-${project}.json`);
}

console.log(`\n[build-clusters] Done. ${writtenClusters} clusters, ${totalMemories} total memories. (${builtAt})`);
