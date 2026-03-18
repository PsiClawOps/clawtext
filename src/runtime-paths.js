import path from 'path';

export function getClawTextStateRoot(workspacePath, env) {
  const explicit = process.env.CLAWTEXT_STATE_ROOT;
  if (explicit && String(explicit).trim()) return explicit;
  const stateEnv = env || process.env.CLAWTEXT_STATE_ENV || 'prod';
  return path.join(workspacePath, 'state', 'clawtext', stateEnv);
}

export function getClawTextProdStateRoot(workspacePath) {
  return getClawTextStateRoot(workspacePath, 'prod');
}

export function getClawTextDevStateRoot(workspacePath) {
  return getClawTextStateRoot(workspacePath, 'dev');
}

export function getClawTextCacheDir(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'cache');
}

export function getClawTextOperationalDir(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'operational');
}

export function getClawTextIngestStateDir(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'ingest');
}

export function getClawTextEvalDevDir(workspacePath) {
  return path.join(getClawTextDevStateRoot(workspacePath), 'evals');
}

export function getClawTextLibraryDir(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'library');
}

export function getClawTextLibraryCollectionsDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'collections');
}

export function getClawTextLibraryEntriesDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'entries');
}

export function getClawTextLibraryOverlaysDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'overlays');
}

export function getClawTextLibraryIndexesDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'indexes');
}

export function getClawTextLibrarySnapshotsDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'snapshots');
}

export function getClawTextLibraryManifestsDir(workspacePath) {
  return path.join(getClawTextLibraryDir(workspacePath), 'manifests');
}

export function getClawTextSessionTopicMapPath(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'session-topic-map.json');
}

export function getClawTextTopicAnchorsDir(workspacePath) {
  return path.join(getClawTextProdStateRoot(workspacePath), 'topic-anchors');
}
