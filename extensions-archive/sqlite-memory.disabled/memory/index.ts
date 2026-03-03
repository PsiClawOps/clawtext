// OpenClaw Memory System
// Phase 2: Enhanced with TTL, Relationships, Continuous Sync

export { MemoryService } from './service.js';
export { ContextPruner } from './prune.js';
export { MemoryExporter } from './export.js';
export { MemorySync } from './sync.js';
export { MemoryMaintenance } from './maintenance.js';
export { initDatabase, runMigrations, getGlobalDbPath, getLocalDbPath } from './db.js';

export type {
  Memory,
  MemoryType,
  MemorySource,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
  ContextWindow,
  CreateContextWindowInput,
  Project,
  CreateProjectInput,
} from './types.js';

export type { PruneResult, PruneOptions } from './prune.js';
export type { ExportOptions, ImportOptions } from './export.js';
export type { SyncOptions } from './sync.js';
export type { MaintenanceOptions } from './maintenance.js';
