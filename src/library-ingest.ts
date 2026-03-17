import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ensureLibraryRuntimeDirs,
  loadLibraryCollectionManifest,
  type LibraryCollectionManifest,
} from './library';
import {
  getClawTextLibraryCollectionsDir,
  getClawTextLibraryIndexesDir,
  getClawTextLibraryManifestsDir,
} from './runtime-paths';

export interface LibraryIngestOptions {
  force?: boolean;
  fetchImpl?: typeof fetch;
}

export interface LibraryIngestedDocument {
  id: string;
  url: string;
  role?: string;
  fetchedAt: string;
  contentType: string | null;
  bytes: number;
  sha1: string;
  file: string;
}

export interface LibraryIngestResult {
  collection: string;
  title: string;
  imported: number;
  skipped: number;
  documents: LibraryIngestedDocument[];
}

function sha1(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class ClawTextLibraryIngest {
  private workspacePath: string;

  constructor(workspacePath: string = process.env.HOME + '/.openclaw/workspace') {
    this.workspacePath = workspacePath;
    ensureLibraryRuntimeDirs(workspacePath);
  }

  ingestCollectionFromManifestPath(manifestPath: string, options: LibraryIngestOptions = {}): Promise<LibraryIngestResult> {
    const validation = loadLibraryCollectionManifest(manifestPath);
    if (!validation.valid || !validation.value) {
      throw new Error(`Invalid collection manifest: ${validation.errors.join('; ')}`);
    }

    return this.ingestCollection(validation.value, options);
  }

  async ingestCollection(manifest: LibraryCollectionManifest, options: LibraryIngestOptions = {}): Promise<LibraryIngestResult> {
    const fetchImpl = options.fetchImpl || fetch;
    const collectionsDir = getClawTextLibraryCollectionsDir(this.workspacePath);
    const manifestsDir = getClawTextLibraryManifestsDir(this.workspacePath);
    const indexesDir = getClawTextLibraryIndexesDir(this.workspacePath);

    const collectionDir = path.join(collectionsDir, manifest.slug);
    ensureDir(collectionDir);
    ensureDir(manifestsDir);
    ensureDir(indexesDir);

    const importedDocs: LibraryIngestedDocument[] = [];
    let skipped = 0;

    for (const source of manifest.sources) {
      const response = await fetchImpl(source.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${source.url}: HTTP ${response.status}`);
      }

      const text = await response.text();
      const digest = sha1(text);
      const fileBase = `${sanitizeFilePart(source.role || 'source')}-${digest}`;
      const fileName = `${fileBase}.json`;
      const targetFile = path.join(collectionDir, fileName);

      if (fs.existsSync(targetFile) && !options.force) {
        skipped += 1;
        const existing = JSON.parse(fs.readFileSync(targetFile, 'utf8')) as LibraryIngestedDocument & { content?: string };
        importedDocs.push({
          id: existing.id,
          url: existing.url,
          role: existing.role,
          fetchedAt: existing.fetchedAt,
          contentType: existing.contentType,
          bytes: existing.bytes,
          sha1: existing.sha1,
          file: existing.file,
        });
        continue;
      }

      const fetchedAt = new Date().toISOString();
      const record = {
        id: `${manifest.slug}:${digest.slice(0, 12)}`,
        kind: 'library-collection-document',
        collection: manifest.slug,
        title: manifest.title,
        version: manifest.version || null,
        trust_level: manifest.trust_level,
        source_type: manifest.source_type,
        url: source.url,
        role: source.role || null,
        fetchedAt,
        contentType: response.headers.get('content-type'),
        bytes: Buffer.byteLength(text, 'utf8'),
        sha1: digest,
        file: fileName,
        topics: manifest.topics || [],
        content: text,
      };

      fs.writeFileSync(targetFile, JSON.stringify(record, null, 2));
      importedDocs.push({
        id: record.id,
        url: record.url,
        role: record.role || undefined,
        fetchedAt: record.fetchedAt,
        contentType: record.contentType,
        bytes: record.bytes,
        sha1: record.sha1,
        file: record.file,
      });
    }

    const now = new Date().toISOString();
    const runtimeManifest = {
      ...manifest,
      kind: 'library-collection-runtime',
      status: 'active',
      last_ingested: now,
      imported_count: importedDocs.length - skipped,
      skipped_count: skipped,
      documents: importedDocs,
      source_manifest: manifestPathOrPlaceholder(manifest.slug),
    };

    fs.writeFileSync(
      path.join(manifestsDir, `${manifest.slug}.runtime.json`),
      JSON.stringify(runtimeManifest, null, 2),
    );

    const collectionIndex = {
      collection: manifest.slug,
      title: manifest.title,
      trust_level: manifest.trust_level,
      source_type: manifest.source_type,
      status: 'active',
      last_ingested: now,
      document_count: importedDocs.length,
      topics: manifest.topics || [],
      entries: importedDocs.map((doc) => ({
        id: doc.id,
        kind: 'collection-doc',
        collection: manifest.slug,
        url: doc.url,
        role: doc.role || null,
        fetchedAt: doc.fetchedAt,
        sha1: doc.sha1,
        file: doc.file,
      })),
    };

    fs.writeFileSync(
      path.join(indexesDir, `${manifest.slug}.index.json`),
      JSON.stringify(collectionIndex, null, 2),
    );

    return {
      collection: manifest.slug,
      title: manifest.title,
      imported: importedDocs.length - skipped,
      skipped,
      documents: importedDocs,
    };
  }
}

function manifestPathOrPlaceholder(slug: string): string {
  return `manifest:${slug}`;
}
