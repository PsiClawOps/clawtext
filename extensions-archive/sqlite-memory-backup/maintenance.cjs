#!/usr/bin/env node
/**
 * SQLite Memory Maintenance Script
 * 
 * Run via system cron:
 * 0 2 * * * /usr/bin/node /path/to/maintenance.cjs >> /var/log/openclaw-memory.log 2>&1
 * 
 * Or manually:
 * node maintenance.cjs [--dry-run] [--project <id>]
 */

const { MemoryService } = require('./memory/service.ts');
const { MemorySync } = require('./memory/sync.ts');
const { MemoryMaintenance } = require('./memory/maintenance.ts');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectIndex = args.indexOf('--project');
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

const workspaceRoot = process.env.OPENCLAW_WORKSPACE || process.cwd();

console.log(`[${new Date().toISOString()}] Starting memory maintenance...`);
console.log(`Workspace: ${workspaceRoot}`);
console.log(`Dry run: ${dryRun}`);
console.log(`Project: ${projectId || 'all'}`);

try {
  const service = new MemoryService(workspaceRoot, true);
  const maintenance = new MemoryMaintenance(service);
  const sync = new MemorySync(service);

  // 1. Clean up expired memories
  console.log('\n1. Cleaning expired memories...');
  const cleanup = maintenance.cleanupExpired({ 
    dryRun,
    archiveBeforeDelete: !dryRun 
  });
  console.log(`   Deleted: ${cleanup.deleted}`);
  console.log(`   Archived: ${cleanup.archived}`);
  
  if (cleanup.details.length > 0) {
    console.log('   Details:');
    cleanup.details.forEach(d => console.log(`     - ${d}`));
  }

  // 2. Export to structured markdown
  console.log('\n2. Exporting to structured markdown...');
  const exportResult = sync.exportToStructured(projectId);
  console.log(`   Exported: ${exportResult.exported} memories`);
  console.log(`   Files: ${exportResult.files.length}`);

  // 3. Show statistics
  console.log('\n3. Current statistics:');
  const stats = maintenance.getStats(projectId);
  console.log(`   Total memories: ${stats.total}`);
  console.log(`   By type: ${JSON.stringify(stats.byType)}`);
  console.log(`   Expired: ${stats.expired}`);
  console.log(`   Pinned: ${stats.pinned}`);
  console.log(`   Avg priority: ${stats.avgPriority.toFixed(2)}`);

  // 4. Find duplicates (just report, don't auto-delete)
  console.log('\n4. Checking for duplicates...');
  const duplicates = maintenance.findDuplicates(projectId, 0.8);
  if (duplicates.length > 0) {
    console.log(`   Found ${duplicates.length} potential duplicates:`);
    duplicates.forEach(({ memory, duplicates }) => {
      console.log(`     - ${memory.id}: ${duplicates.length} similar`);
    });
  } else {
    console.log('   No duplicates found');
  }

  console.log('\n✓ Maintenance complete');
  
  service.close();
  process.exit(0);
} catch (error) {
  console.error('\n✗ Maintenance failed:', error);
  process.exit(1);
}
