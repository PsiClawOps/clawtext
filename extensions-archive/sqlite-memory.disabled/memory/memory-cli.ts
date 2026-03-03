#!/usr/bin/env node
/**
 * OpenClaw Memory CLI
 * 
 * Usage:
 *   node memory-cli.ts add "Remember this fact" [--project myproject] [--type fact]
 *   node memory-cli.ts search "query" [--limit 10]
 *   node memory-cli.ts get <id>
 *   node memory-cli.ts delete <id>
 *   node memory-cli.ts list [--project myproject]
 *   node memory-cli.ts export <dir> [--project myproject]
 *   node memory-cli.ts import <file> [--project myproject]
 *   node memory-cli.ts compact <sessionId>
 */

import { MemoryService } from './service.js';
import { ContextPruner } from './prune.js';
import { MemoryExporter } from './export.js';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

const workspaceRoot = process.env.OPENCLAW_WORKSPACE || process.cwd();
const useLocalDb = process.env.OPENCLAW_MEMORY_LOCAL !== 'false';

const service = new MemoryService(workspaceRoot, useLocalDb);
const exporter = new MemoryExporter(service);

// Simple summarizer for CLI usage
const summarizer = async (messages: any[]): Promise<string> => {
  // In real usage, this would call an LLM
  const preview = messages.map(m => m.content || m.text || JSON.stringify(m)).join(' ').slice(0, 200);
  return `Summary of ${messages.length} messages: ${preview}...`;
};

const pruner = new ContextPruner(service, summarizer);

function printUsage() {
  console.log(`
OpenClaw Memory CLI

Commands:
  add <content> [--project <id>] [--type <type>] [--priority <n>]
    Add a new memory

  search <query> [--project <id>] [--limit <n>] [--type <type>]
    Search memories

  get <id>
    Get a memory by ID

  delete <id>
    Delete a memory

  list [--project <id>] [--type <type>] [--limit <n>]
    List memories

  export <directory> [--project <id>]
    Export memories to Markdown files

  import <file> [--project <id>] [--dry-run]
    Import memories from Markdown file

  compact <sessionId>
    Compact a context window into a summary

  project create <name> [--description <desc>]
    Create a new project

  project list
    List all projects

Environment:
  OPENCLAW_WORKSPACE    Workspace root directory (default: cwd)
  OPENCLAW_MEMORY_LOCAL Use local project DB (default: true)
`);
}

function parseArgs(): { command: string; args: string[]; flags: Record<string, string> } {
  const args = process.argv.slice(2);
  const command = args[0];
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = value;
    } else {
      positional.push(args[i]);
    }
  }

  return { command, args: positional, flags };
}

async function main() {
  const { command, args, flags } = parseArgs();

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'add': {
        const content = args.join(' ');
        if (!content) {
          console.error('Error: Content required');
          process.exit(1);
        }
        
        const memory = service.createMemory({
          content,
          type: (flags.type as any) || 'fact',
          priority: flags.priority ? parseFloat(flags.priority) : 0.5,
        }, flags.project);
        
        console.log(`Created memory: ${memory.id}`);
        console.log(`Type: ${memory.type}`);
        console.log(`Project: ${memory.projectId || 'global'}`);
        break;
      }

      case 'search': {
        const query = args.join(' ');
        const results = service.searchMemories({
          query,
          projectId: flags.project,
          type: flags.type as any,
          limit: flags.limit ? parseInt(flags.limit) : 10,
          pinnedFirst: true,
          recentFirst: true,
        });

        console.log(`Found ${results.length} memories:\n`);
        for (const mem of results) {
          const pin = mem.isPinned ? '📌 ' : '';
          const preview = mem.content.slice(0, 80).replace(/\n/g, ' ');
          console.log(`${pin}[${mem.id}] (${mem.type}) ${preview}...`);
        }
        break;
      }

      case 'get': {
        const id = args[0];
        if (!id) {
          console.error('Error: ID required');
          process.exit(1);
        }

        const memory = service.getMemoryById(id, flags.project);
        if (!memory) {
          console.error('Memory not found');
          process.exit(1);
        }

        console.log(`ID: ${memory.id}`);
        console.log(`Type: ${memory.type}`);
        console.log(`Project: ${memory.projectId || 'global'}`);
        console.log(`Priority: ${memory.priority}`);
        console.log(`Accessed: ${memory.accessCount} times`);
        console.log(`Created: ${memory.createdAt.toISOString()}`);
        console.log(`\n${memory.content}`);
        break;
      }

      case 'delete': {
        const id = args[0];
        if (!id) {
          console.error('Error: ID required');
          process.exit(1);
        }

        const success = service.deleteMemory(id, flags.project);
        console.log(success ? 'Deleted' : 'Not found');
        break;
      }

      case 'list': {
        const results = service.searchMemories({
          projectId: flags.project,
          type: flags.type as any,
          limit: flags.limit ? parseInt(flags.limit) : 20,
          pinnedFirst: true,
          recentFirst: true,
        });

        console.log(`${results.length} memories:\n`);
        for (const mem of results) {
          const pin = mem.isPinned ? '📌 ' : '';
          const preview = mem.content.slice(0, 60).replace(/\n/g, ' ');
          console.log(`${pin}[${mem.id}] ${preview}...`);
        }
        break;
      }

      case 'export': {
        const dir = args[0] || './memory-export';
        const resolvedDir = resolve(dir);
        
        if (!existsSync(resolvedDir)) {
          mkdirSync(resolvedDir, { recursive: true });
        }

        const result = exporter.exportToMarkdown(resolvedDir, {
          projectId: flags.project,
        });

        console.log(`Exported ${result.exported} memories to ${resolvedDir}`);
        console.log('Files created:');
        for (const file of result.files) {
          console.log(`  - ${file}`);
        }
        break;
      }

      case 'import': {
        const file = args[0];
        if (!file) {
          console.error('Error: File path required');
          process.exit(1);
        }

        const result = exporter.importFromMarkdown(resolve(file), {
          projectId: flags.project,
          dryRun: flags['dry-run'] === 'true',
          skipExisting: true,
        });

        console.log(`Imported: ${result.imported}`);
        console.log(`Skipped: ${result.skipped}`);
        if (result.errors.length > 0) {
          console.log('Errors:');
          for (const err of result.errors) {
            console.log(`  - ${err}`);
          }
        }
        break;
      }

      case 'compact': {
        const sessionId = args[0];
        if (!sessionId) {
          console.error('Error: sessionId required');
          process.exit(1);
        }

        const summary = await pruner.compact(sessionId, flags.project);
        console.log('Context compacted. Summary:');
        console.log(summary);
        break;
      }

      case 'project': {
        const subCommand = args[0];
        
        if (subCommand === 'create') {
          const name = args[1];
          if (!name) {
            console.error('Error: Project name required');
            process.exit(1);
          }

          const project = service.createProject({
            name,
            description: flags.description,
            workspacePath: useLocalDb ? workspaceRoot : undefined,
          });

          console.log(`Created project: ${project.id}`);
          console.log(`Name: ${project.name}`);
          console.log(`Workspace: ${project.workspacePath || 'global'}`);
        } else if (subCommand === 'list') {
          const projects = service.getProjectsByWorkspace(workspaceRoot);
          console.log(`${projects.length} projects:\n`);
          for (const p of projects) {
            console.log(`[${p.id}] ${p.name} (${p.status})`);
            if (p.description) console.log(`  ${p.description}`);
          }
        } else {
          console.error('Unknown project subcommand');
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    service.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
