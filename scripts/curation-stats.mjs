#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const workspacePath = process.argv[2] || process.env.HOME + '/.openclaw/workspace';
const memoryDir = path.join(workspacePath, 'memory');

const targets = {
  staging: path.join(memoryDir, 'staging'),
  review: path.join(memoryDir, 'review'),
  reviewActions: path.join(memoryDir, 'review-actions'),
  logArchive: path.join(memoryDir, 'log-archive'),
  summarizerQueue: path.join(memoryDir, 'summarizer-queue'),
  cache: path.join(memoryDir, 'cache'),
};

function countFiles(dir, exts = null) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(name => {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) return false;
    if (!exts) return true;
    return exts.some(ext => name.endsWith(ext));
  }).length;
}

function tailLines(file, limit = 10) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const promotionsLog = path.join(memoryDir, 'promotions.log');
const actionsLog = path.join(memoryDir, 'actions.log');
const cacheStats = path.join(targets.cache, 'stats.json');

const report = {
  workspacePath,
  generatedAt: new Date().toISOString(),
  counts: {
    staging: countFiles(targets.staging, ['.md', '.json']),
    review: countFiles(targets.review, ['.md', '.json']),
    reviewActions: countFiles(targets.reviewActions, ['.json']),
    logArchive: countFiles(targets.logArchive, ['.md']),
    summarizerQueue: countFiles(targets.summarizerQueue, ['.json'])
  },
  logs: {
    promotionsTail: tailLines(promotionsLog, 12),
    actionsTail: tailLines(actionsLog, 12)
  },
  cache: readJson(cacheStats, { missing: true })
};

console.log(JSON.stringify(report, null, 2));
