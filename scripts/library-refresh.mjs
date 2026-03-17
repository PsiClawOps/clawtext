#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { ClawTextLibraryIngest } from '../dist/library-ingest.js';
import { loadLibraryCollectionManifest } from '../dist/library.js';
import { getClawTextLibraryManifestsDir } from '../dist/runtime-paths.js';

const WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const LEGACY_MANIFEST_DIR = path.join(WORKSPACE, 'library', 'manifests');
const FALLBACK_MANIFEST_DIR = getClawTextLibraryManifestsDir(WORKSPACE);

const DAY_MS = 24 * 60 * 60 * 1000;

function manifestDir() {
  if (fs.existsSync(LEGACY_MANIFEST_DIR)) return LEGACY_MANIFEST_DIR;
  return FALLBACK_MANIFEST_DIR;
}

function listManifestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map((file) => path.join(dir, file));
}

function parseIsoDate(value) {
  if (!value || typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

async function probeVersion(manifest) {
  const probe = manifest.version_probe;
  if (!probe) return null;

  if (probe.type === 'github-release') {
    if (!probe.repo) return null;
    const url = `https://api.github.com/repos/${probe.repo}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'clawtext-library-refresh',
      },
    });
    if (!response.ok) throw new Error(`GitHub probe failed (${probe.repo}): HTTP ${response.status}`);
    const payload = await response.json();
    return typeof payload.tag_name === 'string' ? payload.tag_name : null;
  }

  if (probe.type === 'npm-version') {
    if (!probe.package) return null;
    const url = `https://registry.npmjs.org/${encodeURIComponent(probe.package)}/latest`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`npm probe failed (${probe.package}): HTTP ${response.status}`);
    const payload = await response.json();
    return typeof payload.version === 'string' ? payload.version : null;
  }

  if (probe.type === 'url-hash') {
    if (!probe.url) return null;
    const response = await fetch(probe.url);
    if (!response.ok) throw new Error(`URL hash probe failed (${probe.url}): HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return crypto.createHash('sha1').update(bytes).digest('hex');
  }

  return null;
}

async function evaluateRefresh(manifest) {
  const policy = manifest.refresh_policy || 'manual';

  if (policy === 'manual') {
    return { needed: false, reason: 'manual policy', probedVersion: null };
  }

  if (policy === 'weekly' || policy === 'monthly') {
    const intervalMs = policy === 'weekly' ? 7 * DAY_MS : 30 * DAY_MS;
    const lastIngestedTs = parseIsoDate(manifest.last_ingested);
    if (!lastIngestedTs) {
      return { needed: true, reason: `${policy} policy with no last_ingested`, probedVersion: null };
    }
    const stale = Date.now() - lastIngestedTs >= intervalMs;
    return {
      needed: stale,
      reason: stale ? `${policy} interval elapsed` : `${policy} interval not elapsed`,
      probedVersion: null,
    };
  }

  if (policy === 'on-version-change') {
    const probedVersion = await probeVersion(manifest);
    if (!probedVersion) {
      return { needed: false, reason: 'version probe unavailable', probedVersion: null };
    }

    const changed = !manifest.version || manifest.version !== probedVersion;
    return {
      needed: changed,
      reason: changed ? `version changed (${manifest.version || 'none'} -> ${probedVersion})` : 'version unchanged',
      probedVersion,
    };
  }

  return { needed: false, reason: `unknown policy: ${policy}`, probedVersion: null };
}

function writeManifest(filePath, manifest) {
  const content = yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
  });
  fs.writeFileSync(filePath, content, 'utf8');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const dir = manifestDir();
  const files = listManifestFiles(dir);

  if (files.length === 0) {
    console.log(`No library manifests found in ${dir}`);
    return;
  }

  const ingest = new ClawTextLibraryIngest(WORKSPACE);

  for (const filePath of files) {
    const validation = loadLibraryCollectionManifest(filePath);
    if (!validation.valid || !validation.value) {
      console.warn(`Skipping invalid manifest ${path.basename(filePath)}: ${validation.errors.join('; ')}`);
      continue;
    }

    const manifest = validation.value;
    const decision = await evaluateRefresh(manifest);
    if (!decision.needed) {
      console.log(`skip ${manifest.slug}: ${decision.reason}`);
      continue;
    }

    const now = new Date().toISOString();
    const nextVersion = decision.probedVersion || manifest.version;

    if (dryRun) {
      console.log(`[dry-run] refresh ${manifest.slug}: ${decision.reason}`);
      continue;
    }

    const refreshedManifest = {
      ...manifest,
      version: nextVersion,
    };

    const result = await ingest.ingestCollection(refreshedManifest);

    const toWrite = {
      ...refreshedManifest,
      last_ingested: now,
      version: decision.probedVersion || refreshedManifest.version,
    };

    writeManifest(filePath, toWrite);
    console.log(`refreshed ${result.collection}: imported=${result.imported} skipped=${result.skipped}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
