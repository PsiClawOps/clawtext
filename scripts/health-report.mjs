#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.argv[2] || (process.env.HOME ? path.join(process.env.HOME, '.openclaw/workspace') : path.resolve(__dirname, '../..'));
const memoryDir = path.join(WORKSPACE, 'memory');

function countFiles(dir, exts = null) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(name => {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) return false;
    if (!exts) return true;
    return exts.some(ext => name.endsWith(ext));
  }).length;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function tailLines(file, limit = 5) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-limit);
}

const reviewDir = path.join(memoryDir, 'review');
const cacheDir = path.join(memoryDir, 'cache');
const clustersDir = path.join(memoryDir, 'clusters');
const stagingDir = path.join(memoryDir, 'staging');
const logArchiveDir = path.join(memoryDir, 'log-archive');

const recommendations = [];
const issues = [];

// Cache health
const cacheHot = readJson(path.join(cacheDir, 'hot.json'), { items: [] });
const cacheStats = readJson(path.join(cacheDir, 'stats.json'), {});
const cacheItemCount = Array.isArray(cacheHot.items) ? cacheHot.items.length : 0;
if (cacheItemCount === 0) {
  issues.push('Hot cache is empty — no cached memories');
  recommendations.push({ action: 'query', reason: 'Cache warming depends on recall usage', command: 'Run a few queries through ClawText to populate cache' });
} else if (cacheItemCount > 350) {
  issues.push(`Hot cache item count (${cacheItemCount}) exceeds recommended max of 300`);
  recommendations.push({ action: 'adjust', reason: 'Cache may be growing too large', command: 'Reduce hotCache.maxItems in rag config' });
}

// Review backlog
const reviewCount = countFiles(reviewDir, ['.md', '.json']);
if (reviewCount > 15) {
  issues.push(`Review backlog has ${reviewCount} items — high accumulation`);
  // Simple dedupe check
  const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md'));
  if (files.length > 3) {
    recommendations.push({ action: 'dedupe', reason: 'Many review items may be duplicates', command: 'npm run review:dedupe -- --apply' });
  }
  recommendations.push({ action: 'review', reason: 'Review backlog needs attention', command: 'npm run review:digest' });
}

// Cluster health
const clusterFiles = countFiles(clustersDir, ['.json']);
let totalMemories = 0;
if (fs.existsSync(clustersDir)) {
  for (const f of fs.readdirSync(clustersDir).filter(x => x.startsWith('cluster-') && x.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(clustersDir, f), 'utf8'));
      totalMemories += Array.isArray(data.memories) ? data.memories.length : 0;
    } catch (e) { /* ignore bad files */ }
  }
}
if (clusterFiles === 0) {
  issues.push('No memory clusters found');
  recommendations.push({ action: 'ingest', reason: 'System has no indexed memories', command: 'Run clawtext-ingest to populate clusters' });
} else if (totalMemories < 10) {
  issues.push(`Very low memory count (${totalMemories}) in ${clusterFiles} clusters`);
  recommendations.push({ action: 'ingest', reason: 'May need more source ingestion', command: 'Ingest more sources or threads' });
}

// Knowledge repo staleness check
try {
  const { getRepoStats, THRESHOLDS } = await import('./knowledge-repos.mjs');
  const repos = getRepoStats();
  
  const stale = repos.filter(r => r.status === 'stale');
  const aging = repos.filter(r => r.status === 'aging');
  
  if (stale.length > 0) {
    issues.push(`${stale.length} knowledge repos are stale (>${THRESHOLDS.STALE} days)`);
    for (const r of stale.slice(0, 3)) {
      recommendations.push({ 
        action: 'reingest', 
        reason: `Knowledge repo '${r.projectId}' is ${r.ageDays} days stale`, 
        command: `npm run ingest -- <source> --project ${r.projectId} --force` 
      });
    }
  }
  
  if (aging.length > 0) {
    recommendations.push({ 
      action: 'review', 
      reason: `${aging.length} knowledge repos are aging (>${THRESHOLDS.WARN} days)`, 
      command: 'npm run knowledge:status' 
    });
  }
  
  report.metrics.knowledgeRepos = repos.length;
  report.metrics.staleRepos = stale.length;
  report.metrics.agingRepos = aging.length;
} catch (e) {
  // Knowledge repo check is optional
}

// Staging pileup
const stagingCount = countFiles(stagingDir, ['.md', '.json']);
if (stagingCount > 10) {
  issues.push(`Staging directory has ${stagingCount} items`);
  recommendations.push({ action: 'process', reason: 'Staging pileup may indicate curation lag', command: 'Run mindgardener garden.js to process staging' });
}

// Cache hits vs misses
const hits = cacheStats.hits || 0;
const misses = cacheStats.misses || 0;
const hitRate = (hits + misses) > 0 ? (hits / (hits + misses)) * 100 : 0;
if (hitRate < 20 && cacheItemCount > 10) {
  issues.push(`Low cache hit rate: ${hitRate.toFixed(1)}%`);
  recommendations.push({ action: 'tune', reason: 'Cache may not be matching user queries well', command: 'Review hotCache.admissionConfidence and scoring weights' });
}

const report = {
  generatedAt: new Date().toISOString(),
  status: issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'needs-attention' : 'degraded',
  issues,
  recommendations,
  metrics: {
    cacheItems: cacheItemCount,
    cacheHitRate: hitRate.toFixed(1) + '%',
    reviewBacklog: reviewCount,
    clusterFiles,
    totalMemories,
    stagingItems: stagingCount,
  }
};

console.log(JSON.stringify(report, null, 2));