#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

const lastN = Number(getArg('--last') || 0) || undefined;
const channelFilter = getArg('--channel');
const verbose = args.includes('--verbose');

const logPath = path.join(
  os.homedir(),
  '.openclaw',
  'workspace',
  'state',
  'clawtext',
  'prod',
  'optimization-log.jsonl',
);

if (!fs.existsSync(logPath)) {
  console.log('No optimization log found:', logPath);
  process.exit(0);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
let records = lines.map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}).filter(Boolean);

if (channelFilter) {
  records = records.filter((r) => r.channel === channelFilter);
}

if (lastN && lastN > 0) {
  records = records.slice(-lastN);
}

if (records.length === 0) {
  console.log('No matching optimization sessions found.');
  process.exit(0);
}

const sessions = new Set(records.map((r) => r.sessionKey || 'unknown'));

let includedSum = 0;
let droppedSum = 0;
let savedTokens = 0;
const dropReasonCounts = new Map();

for (const rec of records) {
  includedSum += Number(rec.includedCount || 0);
  droppedSum += Number(rec.droppedCount || 0);

  const originalBytes = Number(rec.originalBytes || 0);
  const totalBytes = Number(rec.totalBytes || 0);
  savedTokens += Math.max(0, (originalBytes - totalBytes) / 4);

  const reasons = Array.isArray(rec.droppedReasons) ? rec.droppedReasons : [];
  for (const reason of reasons) {
    const key = String(reason || 'unknown').trim() || 'unknown';
    dropReasonCounts.set(key, (dropReasonCounts.get(key) || 0) + 1);
  }
}

const avgIncluded = includedSum / records.length;
const avgDropped = droppedSum / records.length;

const topDropReasons = [...dropReasonCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

console.log('Clawptimization Report');
console.log('=======================');
console.log(`Sessions analyzed: ${sessions.size}`);
console.log(`Records analyzed: ${records.length}`);
console.log(`Avg included per session: ${avgIncluded.toFixed(2)}`);
console.log(`Avg dropped per session: ${avgDropped.toFixed(2)}`);
console.log(`Token savings vs passthrough (est): ${Math.round(savedTokens)}`);
console.log('Most common drop reasons:');

if (topDropReasons.length === 0) {
  console.log('- none');
} else {
  for (const [reason, count] of topDropReasons) {
    console.log(`- ${reason} (${count})`);
  }
}

if (verbose) {
  console.log('\nRecent entries:');
  for (const rec of records.slice(-10)) {
    console.log(
      `- ${rec.iso || new Date(rec.ts).toISOString()} | session=${rec.sessionKey} | strategy=${rec.strategy} | included=${rec.includedCount}/${(rec.includedCount || 0) + (rec.droppedCount || 0)}`,
    );
  }
}
