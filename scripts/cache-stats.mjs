#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const workspacePath = process.argv[2] || process.env.HOME + '/.openclaw/workspace';
const cachePath = path.join(workspacePath, 'memory', 'cache', 'hot.json');
const statsPath = path.join(workspacePath, 'memory', 'cache', 'stats.json');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const cache = readJson(cachePath, { items: [] });
const stats = readJson(statsPath, {});
const items = Array.isArray(cache.items) ? cache.items : [];

const byProject = {};
const byType = {};
for (const item of items) {
  byProject[item.project || 'general'] = (byProject[item.project || 'general'] || 0) + 1;
  byType[item.type || 'fact'] = (byType[item.type || 'fact'] || 0) + 1;
}

const topItems = [...items]
  .sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0) || (b.confidence || 0) - (a.confidence || 0))
  .slice(0, 10)
  .map(item => ({
    project: item.project,
    type: item.type,
    hitCount: item.hitCount || 0,
    confidence: item.confidence || 0,
    sticky: !!item.sticky,
    summary: (item.summary || '').slice(0, 100),
  }));

console.log(JSON.stringify({
  cachePath,
  statsPath,
  itemCount: items.length,
  updatedAt: cache.updatedAt || null,
  byProject,
  byType,
  runtimeStats: stats,
  topItems,
}, null, 2));
