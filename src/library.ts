import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  getClawTextLibraryCollectionsDir,
  getClawTextLibraryDir,
  getClawTextLibraryEntriesDir,
  getClawTextLibraryIndexesDir,
  getClawTextLibraryManifestsDir,
  getClawTextLibraryOverlaysDir,
  getClawTextLibrarySnapshotsDir,
} from './runtime-paths';

export type LibraryTrustLevel = 'official' | 'internal' | 'reviewed-community' | 'community';
export type LibraryCollectionStatus = 'planned' | 'active' | 'stale' | 'archived';
export type LibraryEntryStatus = 'active' | 'stale' | 'superseded' | 'archived';
export type LibraryOverlayStatus = 'draft' | 'active' | 'stale' | 'archived';
export type LibraryVisibility = 'shared' | 'private' | 'cross-agent';
export type LibraryRefreshPolicy = 'manual' | 'weekly' | 'monthly' | 'on-version-change';

export interface LibraryVersionProbe {
  type: 'github-release' | 'npm-version' | 'url-hash';
  repo?: string;
  package?: string;
  url?: string;
}

export interface LibraryRuntimePaths {
  root: string;
  collections: string;
  entries: string;
  overlays: string;
  indexes: string;
  snapshots: string;
  manifests: string;
}

export interface LibraryCollectionSource {
  url: string;
  role?: string;
}

export interface LibraryCollectionManifest {
  kind: 'library-collection';
  slug: string;
  title: string;
  project?: string;
  source_type: string;
  trust_level: LibraryTrustLevel;
  status: LibraryCollectionStatus;
  visibility?: LibraryVisibility;
  version?: string;
  last_ingested?: string;
  last_reviewed?: string;
  refresh_policy?: LibraryRefreshPolicy;
  version_probe?: LibraryVersionProbe;
  retrieval_priority?: string;
  sources: LibraryCollectionSource[];
  topics?: string[];
  intent?: string[];
  notes?: string[];
}

export interface LibraryEntryMetadata {
  kind: 'library-entry';
  project: string;
  topic: string;
  status: LibraryEntryStatus;
  curation: string;
  visibility: LibraryVisibility;
  last_reviewed: string;
  source_docs: string[];
  summary_confidence?: number;
  linked_collection?: string;
}

export interface LibraryOverlayMetadata {
  kind: 'library-overlay';
  slug: string;
  collection: string;
  project: string;
  scope: string;
  status: LibraryOverlayStatus;
  visibility: LibraryVisibility;
  last_reviewed: string;
}

export interface LibraryValidationResult<T> {
  valid: boolean;
  errors: string[];
  value?: T;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseVersionProbe(value: unknown, errors: string[]): LibraryVersionProbe | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) {
    errors.push('version_probe must be an object');
    return undefined;
  }

  const type = record.type;
  if (type !== 'github-release' && type !== 'npm-version' && type !== 'url-hash') {
    errors.push('version_probe.type must be github-release, npm-version, or url-hash');
    return undefined;
  }

  if (type === 'github-release' && (typeof record.repo !== 'string' || !record.repo.trim())) {
    errors.push('version_probe.repo is required for github-release');
  }

  if (type === 'npm-version' && (typeof record.package !== 'string' || !record.package.trim())) {
    errors.push('version_probe.package is required for npm-version');
  }

  if (type === 'url-hash' && (typeof record.url !== 'string' || !record.url.trim())) {
    errors.push('version_probe.url is required for url-hash');
  }

  return {
    type,
    repo: typeof record.repo === 'string' ? record.repo : undefined,
    package: typeof record.package === 'string' ? record.package : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
  };
}

function parseMarkdownFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error('Missing YAML frontmatter block');
  }
  const parsed = yaml.load(match[1]);
  const record = asRecord(parsed);
  if (!record) {
    throw new Error('Frontmatter must parse to an object');
  }
  return record;
}

export function getLibraryRuntimePaths(workspacePath: string): LibraryRuntimePaths {
  return {
    root: getClawTextLibraryDir(workspacePath),
    collections: getClawTextLibraryCollectionsDir(workspacePath),
    entries: getClawTextLibraryEntriesDir(workspacePath),
    overlays: getClawTextLibraryOverlaysDir(workspacePath),
    indexes: getClawTextLibraryIndexesDir(workspacePath),
    snapshots: getClawTextLibrarySnapshotsDir(workspacePath),
    manifests: getClawTextLibraryManifestsDir(workspacePath),
  };
}

export function ensureLibraryRuntimeDirs(workspacePath: string): LibraryRuntimePaths {
  const paths = getLibraryRuntimePaths(workspacePath);
  Object.values(paths).forEach(ensureDir);
  return paths;
}

export function validateLibraryCollectionManifest(value: unknown): LibraryValidationResult<LibraryCollectionManifest> {
  const errors: string[] = [];
  const record = asRecord(value);

  if (!record) {
    return { valid: false, errors: ['Collection manifest must be an object'] };
  }

  if (record.kind !== 'library-collection') errors.push('kind must be library-collection');
  if (typeof record.slug !== 'string' || !record.slug.trim()) errors.push('slug is required');
  if (typeof record.title !== 'string' || !record.title.trim()) errors.push('title is required');
  if (typeof record.source_type !== 'string' || !record.source_type.trim()) errors.push('source_type is required');
  if (typeof record.trust_level !== 'string' || !record.trust_level.trim()) errors.push('trust_level is required');
  if (typeof record.status !== 'string' || !record.status.trim()) errors.push('status is required');

  if (record.refresh_policy !== undefined) {
    const allowedPolicies = new Set(['manual', 'weekly', 'monthly', 'on-version-change']);
    if (typeof record.refresh_policy !== 'string' || !allowedPolicies.has(record.refresh_policy)) {
      errors.push('refresh_policy must be manual, weekly, monthly, or on-version-change');
    }
  }

  const versionProbe = parseVersionProbe(record.version_probe, errors);

  const sources = Array.isArray(record.sources) ? record.sources : [];
  if (sources.length === 0) {
    errors.push('at least one source is required');
  } else {
    sources.forEach((source, index) => {
      const sourceRecord = asRecord(source);
      if (!sourceRecord || typeof sourceRecord.url !== 'string' || !sourceRecord.url.trim()) {
        errors.push(`sources[${index}].url is required`);
      }
    });
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors,
    value: {
      kind: 'library-collection',
      slug: String(record.slug),
      title: String(record.title),
      project: typeof record.project === 'string' ? record.project : undefined,
      source_type: String(record.source_type),
      trust_level: record.trust_level as LibraryTrustLevel,
      status: record.status as LibraryCollectionStatus,
      visibility: typeof record.visibility === 'string' ? (record.visibility as LibraryVisibility) : undefined,
      version: typeof record.version === 'string' ? record.version : undefined,
      last_ingested: typeof record.last_ingested === 'string' ? record.last_ingested : undefined,
      last_reviewed: typeof record.last_reviewed === 'string' ? record.last_reviewed : undefined,
      refresh_policy: typeof record.refresh_policy === 'string' ? (record.refresh_policy as LibraryRefreshPolicy) : undefined,
      version_probe: versionProbe,
      retrieval_priority: typeof record.retrieval_priority === 'string' ? record.retrieval_priority : undefined,
      sources: sources.map((source) => ({
        url: String((source as Record<string, unknown>).url),
        role: typeof (source as Record<string, unknown>).role === 'string'
          ? String((source as Record<string, unknown>).role)
          : undefined,
      })),
      topics: asStringArray(record.topics),
      intent: asStringArray(record.intent),
      notes: asStringArray(record.notes),
    },
  };
}

export function validateLibraryEntryMetadata(value: unknown): LibraryValidationResult<LibraryEntryMetadata> {
  const errors: string[] = [];
  const record = asRecord(value);

  if (!record) {
    return { valid: false, errors: ['Library entry metadata must be an object'] };
  }

  if (record.kind !== 'library-entry') errors.push('kind must be library-entry');
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project is required');
  if (typeof record.topic !== 'string' || !record.topic.trim()) errors.push('topic is required');
  if (typeof record.status !== 'string' || !record.status.trim()) errors.push('status is required');
  if (typeof record.curation !== 'string' || !record.curation.trim()) errors.push('curation is required');
  if (typeof record.visibility !== 'string' || !record.visibility.trim()) errors.push('visibility is required');
  if (typeof record.last_reviewed !== 'string' || !record.last_reviewed.trim()) errors.push('last_reviewed is required');
  if (!Array.isArray(record.source_docs) || record.source_docs.length === 0) errors.push('source_docs must contain at least one entry');

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors,
    value: {
      kind: 'library-entry',
      project: String(record.project),
      topic: String(record.topic),
      status: record.status as LibraryEntryStatus,
      curation: String(record.curation),
      visibility: record.visibility as LibraryVisibility,
      last_reviewed: String(record.last_reviewed),
      source_docs: asStringArray(record.source_docs),
      summary_confidence: typeof record.summary_confidence === 'number' ? record.summary_confidence : undefined,
      linked_collection: typeof record.linked_collection === 'string' ? record.linked_collection : undefined,
    },
  };
}

export function validateLibraryOverlayMetadata(value: unknown): LibraryValidationResult<LibraryOverlayMetadata> {
  const errors: string[] = [];
  const record = asRecord(value);

  if (!record) {
    return { valid: false, errors: ['Library overlay metadata must be an object'] };
  }

  if (record.kind !== 'library-overlay') errors.push('kind must be library-overlay');
  if (typeof record.slug !== 'string' || !record.slug.trim()) errors.push('slug is required');
  if (typeof record.collection !== 'string' || !record.collection.trim()) errors.push('collection is required');
  if (typeof record.project !== 'string' || !record.project.trim()) errors.push('project is required');
  if (typeof record.scope !== 'string' || !record.scope.trim()) errors.push('scope is required');
  if (typeof record.status !== 'string' || !record.status.trim()) errors.push('status is required');
  if (typeof record.visibility !== 'string' || !record.visibility.trim()) errors.push('visibility is required');
  if (typeof record.last_reviewed !== 'string' || !record.last_reviewed.trim()) errors.push('last_reviewed is required');

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors,
    value: {
      kind: 'library-overlay',
      slug: String(record.slug),
      collection: String(record.collection),
      project: String(record.project),
      scope: String(record.scope),
      status: record.status as LibraryOverlayStatus,
      visibility: record.visibility as LibraryVisibility,
      last_reviewed: String(record.last_reviewed),
    },
  };
}

export function loadLibraryCollectionManifest(filePath: string): LibraryValidationResult<LibraryCollectionManifest> {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);
  return validateLibraryCollectionManifest(parsed);
}

export function loadLibraryCollectionManifests(dirPath: string): LibraryValidationResult<LibraryCollectionManifest>[] {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map((file) => loadLibraryCollectionManifest(path.join(dirPath, file)));
}

export function loadLibraryEntryMetadata(filePath: string): LibraryValidationResult<LibraryEntryMetadata> {
  const raw = fs.readFileSync(filePath, 'utf8');
  return validateLibraryEntryMetadata(parseMarkdownFrontmatter(raw));
}

export function loadLibraryOverlayMetadata(filePath: string): LibraryValidationResult<LibraryOverlayMetadata> {
  const raw = fs.readFileSync(filePath, 'utf8');
  return validateLibraryOverlayMetadata(parseMarkdownFrontmatter(raw));
}
