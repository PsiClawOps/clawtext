import path from 'path';

export type ClawTextStateEnv = 'dev' | 'prod';

export function getClawTextStateRoot(workspacePath: string, env?: ClawTextStateEnv): string {
  const explicit = process.env.CLAWTEXT_STATE_ROOT;
  if (explicit && explicit.trim()) return explicit;
  const stateEnv = env || (process.env.CLAWTEXT_STATE_ENV as ClawTextStateEnv) || 'prod';
  return path.join(workspacePath, 'state', 'clawtext', stateEnv);
}

export function getClawTextProdStateRoot(workspacePath: string): string {
  return getClawTextStateRoot(workspacePath, 'prod');
}

export function getClawTextDevStateRoot(workspacePath: string): string {
  return getClawTextStateRoot(workspacePath, 'dev');
}

export function getClawTextCacheDir(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'cache');
}

export function getClawTextOperationalDir(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'operational');
}

export function getClawTextIngestStateDir(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'ingest');
}

export function getClawTextEvalDevDir(workspacePath: string): string {
  return path.join(getClawTextDevStateRoot(workspacePath), 'evals');
}

export function getClawTextLibraryDir(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'library');
}

export function getClawTextLibraryCollectionsDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'collections');
}

export function getClawTextLibraryEntriesDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'entries');
}

export function getClawTextLibraryOverlaysDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'overlays');
}

export function getClawTextLibraryIndexesDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'indexes');
}

export function getClawTextLibrarySnapshotsDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'snapshots');
}

export function getClawTextLibraryManifestsDir(workspacePath: string): string {
  return path.join(getClawTextLibraryDir(workspacePath), 'manifests');
}

export function getClawTextSessionTopicMapPath(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'session-topic-map.json');
}

export function getClawTextTopicAnchorsDir(workspacePath: string): string {
  return path.join(getClawTextProdStateRoot(workspacePath), 'topic-anchors');
}
