import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getPayloadRef } from './payload-store';

export type PayloadRef = {
  refId: string;
  originalSize: number;
  storedAt: string;
  storagePath?: string;
  contentHash: string;
  createdAt: string;
};

// Backward-compatible alias.
export type LargePayloadRef = PayloadRef;

/**
 * Check if content should be externalized (>4000 chars).
 */
export function shouldExternalize(content: string): boolean {
  return content.length > 4000;
}

function toSha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isWithinRoot(resolvedPath: string, resolvedRoot: string): boolean {
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(rootWithSep);
}

function assertWithinRoot(targetPath: string, rootPath: string): void {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);

  if (!isWithinRoot(resolvedTarget, resolvedRoot)) {
    throw new Error(`Refusing payload path outside storage root: ${resolvedTarget}`);
  }
}

function assertNoSymlinkInPath(targetPath: string, rootPath: string): void {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);

  assertWithinRoot(resolvedTarget, resolvedRoot);

  if (fs.existsSync(resolvedRoot)) {
    const rootStat = fs.lstatSync(resolvedRoot);
    if (rootStat.isSymbolicLink()) {
      throw new Error(`Storage root is a symlink: ${resolvedRoot}`);
    }
  }

  const relative = path.relative(resolvedRoot, resolvedTarget);
  const segments = relative.split(path.sep).filter((segment) => segment.length > 0);

  let cursor = resolvedRoot;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) continue;

    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink path component rejected: ${cursor}`);
    }
  }
}

/**
 * Externalize large content to workspace storage.
 */
export function externalizePayload(
  workspacePath: string,
  sessionId: string,
  content: string,
  _hint?: string,
): PayloadRef {
  const createdAt = new Date().toISOString();
  const refId = `payload-${randomUUID()}`;
  const contentHash = toSha256Hex(content);
  const filename = `${randomUUID()}.txt`;

  const relativeStoragePath = path.join('large-file-payloads', sessionId, filename);
  const metadataOnlyRef: PayloadRef = {
    refId,
    originalSize: content.length,
    storedAt: relativeStoragePath,
    contentHash,
    createdAt,
  };

  let tempPath: string | null = null;

  try {
    const resolvedWorkspace = path.resolve(workspacePath);
    const storageRoot = path.resolve(resolvedWorkspace, 'large-file-payloads', sessionId);

    assertWithinRoot(storageRoot, resolvedWorkspace);

    fs.mkdirSync(storageRoot, { recursive: true });
    assertNoSymlinkInPath(storageRoot, resolvedWorkspace);

    const finalPath = path.resolve(storageRoot, filename);
    const tempFilePath = path.resolve(storageRoot, `${filename}.tmp`);

    assertWithinRoot(finalPath, storageRoot);
    assertWithinRoot(tempFilePath, storageRoot);
    assertNoSymlinkInPath(finalPath, storageRoot);
    assertNoSymlinkInPath(tempFilePath, storageRoot);

    tempPath = tempFilePath;
    fs.writeFileSync(tempFilePath, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tempFilePath, finalPath);
    tempPath = null;

    return {
      ...metadataOnlyRef,
      storedAt: finalPath,
      storagePath: finalPath,
    };
  } catch (error) {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
    }

    console.warn(
      `[clawtext-session-intelligence] Failed to externalize payload: ${error instanceof Error ? error.message : String(error)}`,
    );

    return metadataOnlyRef;
  }
}

export function recoverPayload(db: DatabaseSync, refId: string, workspacePath: string): string | null {
  try {
    const storedRef = getPayloadRef(db, refId);
    if (!storedRef) {
      console.warn(`[clawtext-session-intelligence] Missing payload ref: ${refId}`);
      return null;
    }

    if (storedRef.status === 'expired') {
      console.warn(`[clawtext-session-intelligence] Payload ref is expired: ${refId}`);
      return null;
    }

    if (!storedRef.storagePath || storedRef.storagePath.trim().length === 0) {
      console.warn(`[clawtext-session-intelligence] Payload ref has no storage path: ${refId}`);
      return null;
    }

    const resolvedWorkspace = path.resolve(workspacePath);
    const resolvedStoragePath = path.isAbsolute(storedRef.storagePath)
      ? path.resolve(storedRef.storagePath)
      : path.resolve(resolvedWorkspace, storedRef.storagePath);

    if (!isWithinRoot(resolvedStoragePath, resolvedWorkspace)) {
      console.warn(`[clawtext-session-intelligence] Payload path outside workspace for ref ${refId}`);
      return null;
    }

    if (!fs.existsSync(resolvedStoragePath)) {
      console.warn(`[clawtext-session-intelligence] Missing payload file for ref ${refId}: ${resolvedStoragePath}`);
      return null;
    }

    const content = fs.readFileSync(resolvedStoragePath, 'utf8');
    const actualHash = toSha256Hex(content);

    if (actualHash !== storedRef.contentHash) {
      console.warn(`[clawtext-session-intelligence] Corrupt payload hash mismatch for ref ${refId}`);
      return null;
    }

    return content;
  } catch (error) {
    console.warn(
      `[clawtext-session-intelligence] Payload recovery failed for ref ${refId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
