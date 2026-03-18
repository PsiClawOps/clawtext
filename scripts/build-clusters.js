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
import crypto from 'crypto';

const WORKSPACE = path.join(os.homedir(), '.openclaw/workspace');
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const CLUSTERS_DIR = path.join(MEMORY_DIR, 'clusters');
const API_MEMORIES_DIR = path.join(MEMORY_DIR, 'api-memories');

// Project keyword routing — auto-extended by cluster filenames at runtime
const PROJECT_KEYWORDS = {
  openclaw:       ['openclaw', 'gateway', 'plugin', 'session', 'cron', 'heartbeat'],
  clawtext:       ['clawtext', 'cluster', 'rag', 'injection', 'embedding', 'extract', 'ingest'],
  infrastructure: ['infrastructure', 'deployment', 'server', 'ssh', 'config', 'setup', 'tailscale'],
};

// Auto-extend from existing cluster filenames (picks up user-specific projects)
try {
  if (fs.existsSync(CLUSTERS_DIR)) {
    for (const f of fs.readdirSync(CLUSTERS_DIR)) {
      if (f.startsWith('cluster-') && f.endsWith('.json')) {
        const proj = f.replace('cluster-', '').replace('.json', '');
        if (!PROJECT_KEYWORDS[proj]) {
          PROJECT_KEYWORDS[proj] = [proj]; // bare keyword = project name itself
        }
      }
    }
  }
} catch {}

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

/** Generate a deterministic deduplication hash for memory content */
function dedupeHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 16);
}

/** Generate a unique memory ID from source + content hash */
function memoryId(sourceFile, contentHash) {
  const input = sourceFile + ':' + contentHash;
  return 'mem_' + crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

/**
 * Try to extract a date from sourceFile name (YYYY-MM-DD.md pattern)
 * or frontmatter. Returns ISO string or null.
 */
function extractCreatedAt(sourceFile, frontmatter) {
  if (frontmatter && frontmatter.date) {
    const d = new Date(frontmatter.date);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const dateMatch = sourceFile.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return new Date(dateMatch[1] + 'T00:00:00Z').toISOString();
  return null;
}

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

/**
 * Returns true if content is noise that should never enter clusters:
 *   - Raw JSON blobs (Discord API responses, tool call results)
 *   - Stack traces / exception dumps
 *   - Content that is >65% non-prose lines (shell output, diffs, log dumps)
 *   - Enormous unstructured blocks with no headings
 */
/**
 * Returns true if content is noise that should never enter clusters:
 *   - Raw JSON blobs that aren't {"content":"..."} doc envelopes
 *   - Stack traces / exception dumps
 *   - Content that is >65% non-prose lines (shell output, log dumps)
 *   - Enormous unstructured blocks with no headings
 */
function isNoise(body) {
  const trimmed = body.trim();

  // Raw JSON object — but NOT a {"content":"..."} doc envelope (those get unwrapped)
  if (trimmed.startsWith('{') && trimmed.length > 200) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj.content === 'string') return false; // unwrappable — not noise
    } catch {}
    return true; // malformed or non-envelope JSON blob
  }

  // Raw JSON array
  if (trimmed.startsWith('[') && trimmed.length > 200) return true;

  // Stack trace (3+ "at X (file:line)" lines)
  const stackLines = (trimmed.match(/^\s+at\s+\S+\s+\(/gm) || []).length;
  if (stackLines >= 3) return true;

  // Shell/log output: >65% of non-empty lines start with non-word chars
  const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
  if (lines.length >= 8) {
    const noisyLines = lines.filter(l =>
      /^[\s│├─└●·$>|#\d]/.test(l.trim()) ||
      /^={3,}|^-{3,}/.test(l.trim())
    ).length;
    if (noisyLines / lines.length > 0.65) return true;
  }

  // Huge unstructured blob with no YAML or markdown structure
  if (trimmed.length > 6000 && !trimmed.includes('##') && !trimmed.includes('---\n')) return true;

  return false;
}

/**
 * If content is a {"content":"..."} JSON envelope (from Discord ingest),
 * unwrap and return the inner string. Otherwise return as-is.
 */
function unwrapEnvelope(body) {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return body;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.content === 'string' && obj.content.length > 10) return obj.content;
  } catch {}
  return body;
}

function splitIntoChunks(content, sourceFile) {
  const chunks = [];

  // Try YAML-frontmatter style blocks first (our extracted memories format)
  let hasFm = false;
  let match;
  const fmMatches = [];
  const fullFmRe = /---\n([\s\S]*?)\n---\n\n([\s\S]*?)(?=\n---\n|\n## |\n### |$)/g;
  while ((match = fullFmRe.exec(content)) !== null) {
    const fm = parseFrontmatter(match[1]);
    const rawBody = match[2].trim();
    const body = unwrapEnvelope(rawBody); // unwrap {"content":"..."} envelopes
    if (body.length > 20 && !isNoise(body)) {
      fmMatches.push({ fm, body });
      hasFm = true;
    }
  }

  if (hasFm) {
    fmMatches.forEach(({ fm, body }) => {
      const keywords = fm.keywords || topKeywords(body);
      const project = fm.project || detectProject(body, Array.isArray(keywords) ? keywords : []);
      const type = detectType(fm, body);
      const confidence = 0.8;
      const hash = dedupeHash(body);
      chunks.push({
        id: memoryId(sourceFile, hash),
        content: body,
        keywords: Array.isArray(keywords) ? keywords : [keywords],
        project,
        type,
        confidence,
        sourceFile,
        sourceType: 'extracted',
        createdAt: extractCreatedAt(sourceFile, fm),
        dedupeHash: hash,
      });
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
    const full = heading + '\n\n' + body;
    if (isNoise(full)) return;
    const keywords = topKeywords(full);
    const project = detectProject(full, keywords);
    const type = detectType({}, full);
    const hash = dedupeHash(full);
    chunks.push({
      id: memoryId(sourceFile, hash),
      content: heading + '\n\n' + body,
      keywords,
      project,
      type,
      confidence: 0.65,
      sourceFile,
      sourceType: 'extracted',
      createdAt: extractCreatedAt(sourceFile, {}),
      dedupeHash: hash,
    });
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

/**
 * Load API memories (JSON files from memory/api-memories/).
 * These are written by the ClawText Memory API and were previously
 * invisible to the cluster builder. Now they get included.
 */
function loadApiMemories() {
  const results = [];
  if (!fs.existsSync(API_MEMORIES_DIR)) return results;

  for (const file of fs.readdirSync(API_MEMORIES_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(API_MEMORIES_DIR, file), 'utf8'));
      const content = data.body || data.summary || '';
      if (content.length < 20) continue;

      results.push({
        id: data.id || memoryId('api-memories/' + file, dedupeHash(content)),
        content,
        keywords: data.keywords || [],
        project: data.project || 'default',
        type: data.type || 'note',
        confidence: data.confidence || 0.85,
        sourceFile: 'memory/api-memories/' + file,
        sourceType: data.sourceType || 'api',
        createdAt: data.createdAt || data.observedAt || null,
        dedupeHash: data.dedupeHash || dedupeHash(content),
        mentionCount: Number.isFinite(data.mentionCount) ? Math.max(1, Number(data.mentionCount)) : 1,
        lastMentionedAt: data.lastMentionedAt || data.updatedAt || data.observedAt || data.createdAt || null,
      });
    } catch (e) {
      console.warn(`  skip api memory ${file}: ${e.message}`);
    }
  }
  return results;
}

// --- Main ---

fs.mkdirSync(CLUSTERS_DIR, { recursive: true });

const files = loadMemoryFiles();
console.log(`[build-clusters] Found ${files.length} memory files`);

// Group chunks by project
const byProject = {};
const dedupeIndex = new Map(); // key -> canonical memory object

function normalizeMentionCount(value) {
  return Number.isFinite(value) ? Math.max(1, Number(value)) : 1;
}

function chooseNewerTimestamp(a, b) {
  const at = a ? new Date(a).getTime() : 0;
  const bt = b ? new Date(b).getTime() : 0;
  return bt > at ? b : a;
}

function addOrMergeMemory(input, mentionIncrement = 1) {
  const nowIso = new Date().toISOString();
  const proj = input.project || 'default';
  const dedupeKey = input.dedupeHash || input.id;

  if (dedupeKey && dedupeIndex.has(dedupeKey)) {
    const existing = dedupeIndex.get(dedupeKey);
    existing.mentionCount = normalizeMentionCount(existing.mentionCount) + normalizeMentionCount(mentionIncrement);
    existing.lastMentionedAt = chooseNewerTimestamp(existing.lastMentionedAt, input.lastMentionedAt || input.createdAt || nowIso) || nowIso;
    existing.updatedAt = nowIso;
    existing.keywords = [...new Set([...(existing.keywords || []), ...(input.keywords || [])])];
    return;
  }

  if (!byProject[proj]) byProject[proj] = [];

  const memory = {
    id: input.id,
    content: input.content,
    keywords: input.keywords || [],
    type: input.type,
    project: proj,
    confidence: input.confidence,
    sourceFile: input.sourceFile,
    sourceType: input.sourceType || 'extracted',
    createdAt: input.createdAt || null,
    dedupeHash: input.dedupeHash || null,
    mentionCount: normalizeMentionCount(mentionIncrement),
    lastMentionedAt: input.lastMentionedAt || input.createdAt || nowIso,
    updatedAt: nowIso,
  };

  byProject[proj].push(memory);
  if (dedupeKey) dedupeIndex.set(dedupeKey, memory);
}

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
  chunks.forEach(chunk => addOrMergeMemory(chunk, 1));
});

// Also load API memories (fixes dual storage gap)
const apiMemories = loadApiMemories();
apiMemories.forEach(mem => addOrMergeMemory(mem, mem.mentionCount || 1));
if (apiMemories.length > 0) {
  console.log(`[build-clusters] Loaded ${apiMemories.length} API memories from ${API_MEMORIES_DIR}`);
}

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
