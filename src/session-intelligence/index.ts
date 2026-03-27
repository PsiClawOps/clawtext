/**
 * Session Intelligence module entrypoint.
 *
 * Exports the context-engine factory and registration helper used by
 * ClawText's main plugin registration path.
 */

import path from 'node:path';
import { createSessionIntelligenceEngine } from './engine';
import type { SessionIntelligenceConfig } from './types';

const ENGINE_ID = 'clawtext-session-intelligence';

type ContextEngineRegistrationApi = {
  registerContextEngine: (id: string, factory: () => unknown) => void;
};

export function registerSessionIntelligenceEngine(
  api: ContextEngineRegistrationApi,
  config: SessionIntelligenceConfig,
): void {
  const libraryEntriesDir = config.workspacePath
    ? path.join(config.workspacePath, 'state', 'clawtext', 'prod', 'library', 'entries')
    : undefined;

  api.registerContextEngine(
    ENGINE_ID,
    () => createSessionIntelligenceEngine({ ...config, libraryEntriesDir }),
  );
}

export { createSessionIntelligenceEngine };
export { loadAcaFiles, buildKernelContent, buildOverlayContent } from './aca';
export { upsertStateSlot, getStateSlot, getAllStateSlots, kernelSlotsPresent } from './state-slots';
export {
  classifyMessage,
  extractDecisionText,
  extractProblemText,
  CONTENT_TYPE_PRIORITY,
  CONTENT_TYPE_COMPACTION_ORDER,
} from './content-type';
export { extractStateFromMessage } from './state-extraction';
export { evaluateTrigger, recordCompactionEvent, resolveTriggerConfig, shouldRunProactivePass } from './trigger';
export { computePressureSignals, buildPressureReading, classifyPressureBand, PRESSURE_THRESHOLDS } from './pressure';
export { runNoiseSweep, runToolDecay } from './proactive-pass';
export { search, describe, expand } from './recall';
export { shouldExternalize, externalizePayload, recoverPayload } from './large-file';
export { insertPayloadRef, getPayloadRef, listPayloadRefs, markPayloadRefExpired } from './payload-store';
export type { SessionIntelligenceConfig };
