export type LargePayloadRef = {
  refId: string;
  originalSize: number;
  storedAt: string;
  contentHash: string;
  createdAt: string;
};

/**
 * Check if content should be externalized (>4000 chars).
 */
export function shouldExternalize(content: string): boolean {
  return content.length > 4000;
}

/**
 * Stub: externalize large content to workspace storage.
 * Walk 5 records metadata only — actual file write is a no-op placeholder.
 */
export function externalizePayload(
  _workspacePath: string,
  content: string,
  _hint?: string,
): LargePayloadRef {
  const hash = content.slice(0, 16).replace(/\s/g, '_');
  const refId = `payload-${Date.now()}-${hash}`;
  return {
    refId,
    originalSize: content.length,
    storedAt: `.clawtext/payloads/${refId}.txt`,
    contentHash: hash,
    createdAt: new Date().toISOString(),
  };
}
