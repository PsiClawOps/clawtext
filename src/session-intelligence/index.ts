/**
 * Session Intelligence module entrypoint.
 *
 * Exports the context-engine factory and registration helper used by
 * ClawText's main plugin registration path.
 */

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
  api.registerContextEngine(ENGINE_ID, () => createSessionIntelligenceEngine(config));
}

export { createSessionIntelligenceEngine };
export { loadAcaFiles, buildKernelContent, buildOverlayContent } from './aca';
export { upsertStateSlot, getStateSlot, getAllStateSlots, kernelSlotsPresent } from './state-slots';
export type { SessionIntelligenceConfig };
