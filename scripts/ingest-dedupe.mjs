#!/usr/bin/env node

/**
 * Ingest Auto-Dedupe
 * 
 * Runs before or after ingest to prevent template duplicates from
 * accumulating in the review queue.
 * 
 * Usage:
 *   node scripts/ingest-dedupe.mjs              # dry-run
 *   node scripts/ingest-dedupe.mjs --apply      # actually deduplicate
 *   node scripts/ingest-dedupe.mjs --watch      # watch staging dir
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.HOME ? path.join(process.env.HOME, '.openclaw/workspace') : path.resolve(__dirname, '../..');
const STAGING_DIR = path.join(WORKSPACE, 'memory', 'staging');
const ARCHIVE_DIR = path.join(WORKSPACE, 'memory', 'ingest-deduped');
const APPLY = process.argv.includes('--apply');
const WATCH = process.argv.includes('--watch');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalize(text) {
  // Remove frontmatter, timestamps, and normalize whitespace
  return text
    .replace(/^---[\s\S]*?---\n?/m, '')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '')
    .replace(/ts:\s*.+/g, '')
    .replace(/original:\s*.+/g, '')
    .replace(/source:\s*.+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hashContent(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function isTemplateLike(content, normalized) {
  // Template files often have these patterns
  const templatePatterns = [
    /^# (errors|feature.?requests|learnings|notes|todo)/i,
    /^## (errors|feature.?requests|learnings|notes|todo)/i,
    /^# errors\n\nrecord command failures/i,
    /^# feature requests\n\nuser.?requested/i,
    /^# learnings\n\ncorrections.*insights/i,
  ];
  
  for (const pattern of templatePatterns) {
    if (pattern.test(normalized)) return true;
  }
  
  // Very short content (< 200 chars) that's mostly headers is likely a template
  if (content.length < 200 && content.includes('# ')) return true;
  
  return false;
}

function deduplicateStaging() {
  if (!fs.existsSync(STAGING_DIR)) {
    console.log('Staging dir does not exist:', STAGING_DIR);
    return { scanned: 0, duplicates: 0, archived: 0 };
  }

  ensureDir(ARCHIVE_DIR);
  
  const files = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.md'));
  const groups = new Map();
  
  // Group by content hash
  for (const file of files) {
    const full = path.join(STAGING_DIR, file);
    const text = fs.readFileSync(full, 'utf8');
    const norm = normalize(text);
    const key = hashContent(norm);
    
    const arr = groups.get(key) || [];
    arr.push({ file, full, text, norm });
    groups.set(key, arr);
  }
  
  let duplicates = 0;
  let archived = 0;
  
  for (const [key, arr] of groups.entries()) {
    if (arr.length > 1) {
      duplicates += arr.length - 1;
      
      if (APPLY) {
        // Keep the first, archive the rest
        for (let i = 1; i < arr.length; i++) {
          const { file, full } = arr[i];
          const dest = path.join(ARCHIVE_DIR, file);
          try {
            fs.renameSync(full, dest);
            archived++;
          } catch (e) {
            console.error('Failed to archive:', file, e.message);
          }
        }
      }
    }
  }
  
  return { scanned: files.length, duplicates, archived };
}

// Watch mode - monitor staging directory continuously
function watchStaging() {
  console.log('Watching staging directory for changes...');
  console.log('Press Ctrl+C to stop\n');
  
  let lastHash = '';
  
  const check = () => {
    if (!fs.existsSync(STAGING_DIR)) return;
    
    const files = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.md'));
    const content = files.map(f => fs.readFileSync(path.join(STAGING_DIR, f), 'utf8')).join('');
    const hash = crypto.createHash('md5').update(content).digest('hex');
    
    if (hash !== lastHash) {
      lastHash = hash;
      const result = deduplicateStaging();
      if (result.duplicates > 0) {
        console.log(`[${new Date().toISOString()}] Found ${result.duplicates} duplicate(s) in staging`);
      }
    }
  };
  
  setInterval(check, 5000); // Check every 5 seconds
}

console.log('ClawText Ingest Auto-Dedupe');
console.log('============================\n');

if (WATCH) {
  watchStaging();
} else {
  const result = deduplicateStaging();
  console.log('Scanned:', result.scanned, 'files');
  console.log('Duplicates found:', result.duplicates);
  
  if (APPLY) {
    console.log('Archived:', result.archived, 'files');
    console.log('\n✅ Deduplication complete');
  } else {
    console.log('\nRun with --apply to archive duplicates');
    console.log('Run with --watch to monitor continuously');
  }
}