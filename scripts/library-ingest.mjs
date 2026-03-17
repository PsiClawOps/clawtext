#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { ClawTextLibraryIngest } from '../dist/library-ingest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const [, , manifestPath, ...rest] = process.argv;
  if (!manifestPath) {
    console.error('Usage: node scripts/library-ingest.mjs <manifest-path> [--force]');
    process.exit(1);
  }

  const force = rest.includes('--force');
  const resolvedManifest = path.resolve(process.cwd(), manifestPath);
  const ingest = new ClawTextLibraryIngest();
  const result = await ingest.ingestCollectionFromManifestPath(resolvedManifest, { force });

  console.log(`Library collection ingested: ${result.collection}`);
  console.log(`Title: ${result.title}`);
  console.log(`Imported: ${result.imported}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Documents: ${result.documents.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
