#!/usr/bin/env node
/**
 * knowledge-repos.mjs — Track knowledge repository staleness
 * 
 * Scans cluster files to build knowledge repo inventory with timestamps.
 * Used by health-report to detect stale repos.
 * 
 * Usage:
 *   node scripts/knowledge-repos.mjs status  — Show all repos
 *   (Import getRepoStats for programmatic access)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.HOME ? path.join(process.env.HOME, '.openclaw/workspace') : path.resolve(__dirname, '../..');
const CLUSTERS_DIR = path.join(WORKSPACE, 'memory/clusters');
const TRACKING_FILE = path.join(WORKSPACE, 'memory/.knowledge-repos.json');

// Config: thresholds in days
const THRESHOLDS = {
  WARN: 30,   // Yellow: recommend review
  STALE: 90,  // Red: recommend re-ingest
};

export function getClusters() {
  if (!fs.existsSync(CLUSTERS_DIR)) return [];
  return fs.readdirSync(CLUSTERS_DIR)
    .filter(f => f.startsWith('cluster-') && f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CLUSTERS_DIR, f), 'utf8'));
        return { file: f, ...data };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

export function getLatestMemoryTimestamp(memories) {
  if (!Array.isArray(memories) || memories.length === 0) return null;
  let latest = null;
  for (const mem of memories) {
    const ts = mem.updatedAt || mem.createdAt;
    if (ts) {
      const date = new Date(ts);
      if (!latest || date > latest) latest = date;
    }
  }
  return latest;
}

export function getRepoStats() {
  const clusters = getClusters();
  const repos = [];
  
  for (const cluster of clusters) {
    const projectId = cluster.projectId || cluster.project || 'default';
    const latestTs = getLatestMemoryTimestamp(cluster.memories);
    const memoryCount = Array.isArray(cluster.memories) ? cluster.memories.length : 0;
    
    if (latestTs) {
      const now = new Date();
      const ageDays = Math.floor((now - latestTs) / (1000 * 60 * 60 * 24));
      
      repos.push({
        projectId,
        memoryCount,
        latestMemoryAt: latestTs.toISOString(),
        ageDays,
        status: ageDays >= THRESHOLDS.STALE ? 'stale' : ageDays >= THRESHOLDS.WARN ? 'aging' : 'fresh'
      });
    }
  }
  
  return repos.sort((a, b) => b.ageDays - a.ageDays);
}

export function saveTracking(repos) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify({
    lastScannedAt: new Date().toISOString(),
    repos
  }, null, 2));
}

export function printStatus(repos) {
  console.log('📚 Knowledge Repositories Status\n');
  console.log('Project'.padEnd(25), 'Memories'.padEnd(12), 'Last Updated'.padEnd(12), 'Age', 'Status');
  console.log('-'.repeat(75));
  
  for (const repo of repos) {
    const lastUpdated = new Date(repo.latestMemoryAt).toISOString().slice(0, 10);
    const statusEmoji = repo.status === 'stale' ? '🔴' : repo.status === 'aging' ? '🟡' : '🟢';
    console.log(
      repo.projectId.padEnd(25),
      String(repo.memoryCount).padEnd(12),
      lastUpdated.padEnd(12),
      `${repo.ageDays}d`.padEnd(6),
      statusEmoji
    );
  }
  
  const stale = repos.filter(r => r.status === 'stale').length;
  const aging = repos.filter(r => r.status === 'aging').length;
  console.log('\n' + '-'.repeat(75));
  console.log(`Total: ${repos.length} repos | 🔴 Stale: ${stale} | 🟡 Aging: ${aging} | 🟢 Fresh: ${repos.length - stale - aging}`);
  
  if (stale > 0) {
    console.log('\n⚠️  Stale repos detected. Run: npm run ingest -- <source> --project <project> --force');
  }
}

// Only run CLI if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const repos = getRepoStats();
  saveTracking(repos);
  printStatus(repos);
}

export { THRESHOLDS };
