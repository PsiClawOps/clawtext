#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClawTextMemory } from './src/memory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = process.env.HOME ? path.join(process.env.HOME, '.openclaw/workspace') : path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const command = args[0];

const memory = new ClawTextMemory(workspacePath);

async function main() {
  switch (command) {
    case 'add': {
      const content = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
      if (!content) {
        console.error('Usage: npm run memory -- add "memory content here" [--type fact] [--project myproject] [--agent agent-id]');
        process.exit(1);
      }
      
      const options = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--type' && args[i+1]) options.type = args[++i];
        if (args[i] === '--project' && args[i+1]) options.project = args[++i];
        if (args[i] === '--agent' && args[i+1]) options.agentId = args[++i];
        if (args[i] === '--visibility' && args[i+1]) options.visibility = args[++i];
        if (args[i] === '--session' && args[i+1]) options.sessionId = args[++i];
      }
      
      const result = await memory.add(content, options);
      console.log('Memory added:', result.id);
      console.log('  Type:', result.type);
      console.log('  Project:', result.project);
      console.log('  Visibility:', result.visibility);
      break;
    }
    
    case 'search': {
      const query = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
      if (!query) {
        console.error('Usage: npm run memory -- search "query" [--limit 5] [--project myproject] [--agent agent-id]');
        process.exit(1);
      }
      
      const options = { limit: 10 };
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--limit' && args[i+1]) options.limit = parseInt(args[++i], 10);
        if (args[i] === '--project' && args[i+1]) options.project = args[++i];
        if (args[i] === '--type' && args[i+1]) options.type = args[++i];
        if (args[i] === '--agent' && args[i+1]) options.agentId = args[++i];
        if (args[i] === '--session' && args[i+1]) options.sessionId = args[++i];
        if (args[i] === '--shared') options.includeShared = true;
        if (args[i] === '--private') options.includePrivate = true;
        if (args[i] === '--cross-agent') options.includeCrossAgent = true;
        if (args[i] === '--related-sessions') options.includeRelatedSessions = true;
      }
      
      const results = await memory.search(query, options);
      console.log(`Found ${results.length} memories:\n`);
      results.forEach((mem, i) => {
        console.log(`${i+1}. [${mem.type}] ${(mem.summary || mem.body || '').slice(0, 80)}`);
        console.log(`   Project: ${mem.project} | Agent: ${mem.agentId || 'system'} | Visibility: ${mem.visibility || 'shared'}`);
        console.log();
      });
      break;
    }
    
    case 'list': {
      const options = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--project' && args[i+1]) options.project = args[++i];
        if (args[i] === '--type' && args[i+1]) options.type = args[++i];
        if (args[i] === '--agent' && args[i+1]) options.agentId = args[++i];
        if (args[i] === '--limit' && args[i+1]) options.limit = parseInt(args[++i], 10);
      }
      
      const memories = await memory.getAll(options);
      console.log(`Total memories: ${memories.length}\n`);
      memories.slice(0, options.limit || 20).forEach((mem, i) => {
        console.log(`${i+1}. [${mem.type}] ${(mem.summary || mem.body || '').slice(0, 60)}`);
        console.log(`   Created: ${mem.createdAt} | Agent: ${mem.agentId || 'system'}`);
      });
      break;
    }
    
    case 'delete': {
      const id = args[1];
      if (!id) {
        console.error('Usage: npm run memory -- delete <memory-id>');
        process.exit(1);
      }
      const result = await memory.delete(id);
      console.log(result ? 'Memory deleted' : 'Memory not found');
      break;
    }
    
    case 'stats': {
      const stats = memory.getStats();
      console.log(JSON.stringify(stats, null, 2));
      break;
    }
    
    default:
      console.log(`
ClawText Memory CLI
===================

Usage: npm run memory -- <command> [options]

Commands:
  add <content>              Add a memory
  search <query>             Search memories
  list                       List all memories
  delete <id>                Delete a memory by ID
  stats                      Show memory statistics

Options for 'add':
  --type <type>              Memory type: fact, decision, preference, learning, protocol, note
  --project <project>        Project name
  --agent <agent-id>         Agent ID
  --visibility <vis>         Visibility: shared, private, cross-agent
  --session <session-id>     Session ID

Options for 'search':
  --limit <n>                Max results (default: 10)
  --project <project>        Filter by project
  --type <type>              Filter by type
  --agent <agent-id>         Current agent ID (for filtering)
  --shared                   Include shared memories
  --private                  Include private memories
  --cross-agent              Include cross-agent memories
  --session <id>             Current session ID
  --related-sessions         Include related session context

Options for 'list':
  --project <project>        Filter by project
  --type <type>              Filter by type
  --agent <agent-id>         Filter by agent
  --limit <n>                Max results

Examples:
  npm run memory -- add "Decision: use Qwen for coding" --type decision --project rgcs
  npm run memory -- search "RGCS smoothing" --limit 5 --shared
  npm run memory -- list --project clawtext --limit 10
  npm run memory -- stats
`);
      process.exit(command ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});