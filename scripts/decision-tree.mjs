#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DecisionTreeManager } from '../dist/decision-tree.js';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const STORE_PATH = path.join(WORKSPACE, 'state', 'clawtext', 'prod', 'decision-trees.json');
const JOURNAL_DIR = path.join(WORKSPACE, 'journal');

function parseArgs(argv) {
  const command = argv[0];
  const options = {};

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    if (key === 'steps') {
      const steps = [];
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        steps.push(argv[i + 1]);
        i += 1;
      }
      options.steps = steps;
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { command, options };
}

function usage() {
  console.log(`
Decision Tree CLI

Usage:
  node scripts/decision-tree.mjs list
  node scripts/decision-tree.mjs add --trigger "..." --steps "step 1" "step 2" --category "deployment"
  node scripts/decision-tree.mjs remove --id <id>
  node scripts/decision-tree.mjs extract --days 7
  node scripts/decision-tree.mjs match --content "deploying changes"
`);
}

function readRecentJournalRecords(days) {
  if (!fs.existsSync(JOURNAL_DIR)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const files = fs
    .readdirSync(JOURNAL_DIR)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
    .filter((file) => file.slice(0, 10) >= cutoffDate)
    .sort();

  const records = [];
  for (const file of files) {
    const fullPath = path.join(JOURNAL_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
  }

  return records;
}

function listEntries(manager) {
  const store = manager.load();
  if (store.entries.length === 0) {
    console.log('No decision tree entries found.');
    return;
  }

  for (const entry of store.entries) {
    console.log(`- ${entry.id}`);
    console.log(`  Category: ${entry.category}`);
    console.log(`  Trigger: ${entry.trigger}`);
    console.log(`  Confidence: ${entry.confidence.toFixed(2)}`);
    console.log(`  Steps: ${entry.steps.length}`);
    console.log(`  Last used: ${entry.lastUsed}`);
  }
}

function addEntry(manager, options) {
  const trigger = typeof options.trigger === 'string' ? options.trigger.trim() : '';
  const steps = Array.isArray(options.steps) ? options.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  const category = typeof options.category === 'string' ? options.category : 'operations';

  if (!trigger || steps.length === 0) {
    console.error('add requires --trigger and at least one --steps value');
    process.exit(1);
  }

  const now = new Date().toISOString();
  const entry = manager.addEntry({
    trigger,
    triggerKeywords: [],
    steps,
    learnedFrom: [{ date: now, note: 'manually added via decision-tree CLI' }],
    confidence: 0.7,
    lastUsed: now,
    category,
  });

  console.log(`Added decision tree entry: ${entry.id}`);
}

function removeEntry(manager, options) {
  const id = typeof options.id === 'string' ? options.id : '';
  if (!id) {
    console.error('remove requires --id');
    process.exit(1);
  }

  manager.removeEntry(id);
  console.log(`Removed (if present): ${id}`);
}

function extractEntries(manager, options) {
  const days = Number.parseInt(String(options.days ?? '7'), 10);
  const journalRecords = readRecentJournalRecords(Number.isFinite(days) ? days : 7);
  const extracted = manager.extractFromJournal(journalRecords);

  if (extracted.length === 0) {
    console.log('No repeated step patterns found (requires 3+ occurrences).');
    return;
  }

  const existing = manager.load();
  const existingKeys = new Set(
    existing.entries.map((entry) => entry.steps.map((step) => step.toLowerCase()).join('||')),
  );

  let added = 0;
  for (const entry of extracted) {
    const key = entry.steps.map((step) => step.toLowerCase()).join('||');
    if (existingKeys.has(key)) continue;

    manager.addEntry({
      trigger: entry.trigger,
      triggerKeywords: entry.triggerKeywords,
      steps: entry.steps,
      learnedFrom: entry.learnedFrom,
      confidence: entry.confidence,
      lastUsed: entry.lastUsed,
      category: entry.category,
    });

    existingKeys.add(key);
    added += 1;
  }

  console.log(`Extracted ${extracted.length} candidate patterns, added ${added} new entries.`);
}

function matchEntries(manager, options) {
  const content = typeof options.content === 'string' ? options.content : '';
  if (!content.trim()) {
    console.error('match requires --content');
    process.exit(1);
  }

  const matches = manager.match(content, 5);
  if (matches.length === 0) {
    console.log('No matches found.');
    return;
  }

  for (const match of matches) {
    console.log(`- ${match.id} [${match.category}]`);
    console.log(`  Trigger: ${match.trigger}`);
    console.log(`  Confidence: ${match.confidence.toFixed(2)}`);
    for (const [index, step] of match.steps.entries()) {
      console.log(`    ${index + 1}. ${step}`);
    }
  }
}

const { command, options } = parseArgs(process.argv.slice(2));
const manager = new DecisionTreeManager(STORE_PATH);

switch (command) {
  case 'list':
    listEntries(manager);
    break;
  case 'add':
    addEntry(manager, options);
    break;
  case 'remove':
    removeEntry(manager, options);
    break;
  case 'extract':
    extractEntries(manager, options);
    break;
  case 'match':
    matchEntries(manager, options);
    break;
  default:
    usage();
    process.exit(command ? 1 : 0);
}
