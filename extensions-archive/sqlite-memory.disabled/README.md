# SQLite Memory Extension for OpenClaw

A proper OpenClaw extension providing structured SQLite memory with automatic sync to Markdown.

## Features

- **Structured Storage**: SQLite with typed memories (fact, decision, preference, etc.)
- **Auto-Sync to Markdown**: Immediate daily logs + background structured export
- **TTL Support**: Memories auto-expire after configured time
- **Relationships**: Track memory versions (updates) and related memories
- **Native Tools**: `sqlite_memory_add`, `sqlite_memory_search`, `sqlite_memory_get`, `sqlite_memory_latest`, `sqlite_memory_stats`
- **CLI Commands**: `memory:add`, `memory:search`, `memory:maintenance`, `memory:export`
- **Maintenance**: Automated cleanup of expired memories

## Installation

### Option 1: Copy to Extensions Directory (Recommended)

```bash
# Copy extension to OpenClaw extensions
sudo cp -r /home/lumadmin/.openclaw/workspace/extensions/sqlite-memory \
  /usr/lib/node_modules/openclaw/extensions/

# Or if using local npm
sudo cp -r /home/lumadmin/.openclaw/workspace/extensions/sqlite-memory \
  ~/.npm-global/lib/node_modules/openclaw/extensions/
```

### Option 2: Symlink for Development

```bash
# Create symlink for easy development
sudo ln -s /home/lumadmin/.openclaw/workspace/extensions/sqlite-memory \
  ~/.npm-global/lib/node_modules/openclaw/extensions/sqlite-memory
```

### Option 3: Build and Install

```bash
cd /home/lumadmin/.openclaw/workspace/extensions/sqlite-memory
npm install
npm run build
# Then copy dist/ to extensions directory
```

## Configuration

Add to your `openclaw.config.json5`:

```json5
{
  plugins: {
    sqliteMemory: {
      enabled: true,
      dailyLogDir: "./memory",
      structuredExportDir: "./memory/structured",
      autoSyncIntervalMinutes: 5,
      defaultTtl: {
        preference: 365,
        decision: 180,
        fact: 90,
        error: 365,
        plan: 90,
        task: 30,
        summary: 30,
        project_context: 365,
        code: 365,
      },
    },
  },
}
```

## Cron Setup (Maintenance)

Add to system crontab:

```bash
# Edit crontab
sudo crontab -e

# Add line:
0 2 * * * cd /home/lumadmin/.openclaw && /usr/bin/node extensions/sqlite-memory/maintenance.cjs >> /var/log/openclaw-memory.log 2>&1
```

This runs maintenance daily at 2 AM.

## Tools

### sqlite_memory_add

Add a structured memory:

```typescript
{
  content: "User prefers dark mode",
  type: "preference",
  priority: 0.9,
  projectId: "myproject",  // optional
  ttlDays: 365,            // optional
  updatesId: "mem_old_id", // optional - supersedes another memory
}
```

### sqlite_memory_search

Search memories:

```typescript
{
  query: "dark mode",
  type: "preference",      // optional filter
  projectId: "myproject",  // optional filter
  limit: 10,
}
```

Returns array of matching memories with relevance scores.

### sqlite_memory_get

Get specific memory by ID:

```typescript
{
  id: "mem_abc123",
  projectId: "myproject",  // optional
}
```

### sqlite_memory_latest

Get latest version (follows update chain):

```typescript
{
  id: "mem_original_id",
  projectId: "myproject",  // optional
}
```

Returns the most recent version if the memory has been updated.

### sqlite_memory_stats

Get statistics:

```typescript
{
  projectId: "myproject",  // optional
}
```

Returns: total count, by type, expired count, pinned count, avg priority, etc.

## CLI Commands

```bash
# Add memory
openclaw memory:add "User prefers dark mode" --type preference --priority 0.9

# Search
openclaw memory:search "database" --type decision --limit 5

# Run maintenance
openclaw memory:maintenance --dry-run
openclaw memory:maintenance  # Actually delete expired

# Export to markdown
openclaw memory:export --project myproject
```

## File Structure

After running, creates:

```
workspace/
├── memory/
│   ├── 2026-02-22.md          # Daily log (auto-created)
│   ├── structured/
│   │   ├── _index.md
│   │   ├── preferences.md
│   │   ├── decisions.md
│   │   └── facts.md
│   └── memory.db              # Project SQLite
└── ~/.openclaw/
    └── memory.db              # Global SQLite
```

## Migration from File-Based Memory

The extension coexists with OpenClaw's built-in memory:

- OpenClaw's `memory_search` → searches Markdown files
- `sqlite_memory_search` → searches structured SQLite

Both work together. The extension syncs to Markdown so OpenClaw's search finds everything.

## Troubleshooting

### Extension not loading

Check logs:
```bash
tail -f /var/log/openclaw.log
```

Verify extension is registered:
```bash
openclaw plugins list
```

### Database locked

SQLite can only have one writer. Ensure no other processes are accessing:
- Check for zombie node processes: `ps aux | grep node`
- Verify maintenance script isn't running during active use

### Sync not working

Check permissions:
```bash
ls -la memory/
# Should be writable by openclaw process user
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Runtime                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Extension API   │  │  Native Tools                │ │
│  │  - registerTool  │  │  - sqlite_memory_add         │ │
│  │  - registerCli   │  │  - sqlite_memory_search      │ │
│  └────────┬─────────┘  └──────────────────────────────┘ │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │          SQLite Memory Extension                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐      │ │
│  │  │ Service  │  │   Sync   │  │ Maintenance  │      │ │
│  │  │(SQLite)  │  │(Markdown)│  │ (Cleanup)    │      │ │
│  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘      │ │
│  │       │             │               │               │ │
│  │       └─────────────┴───────────────┘               │ │
│  │                     │                               │ │
│  │                     ▼                               │ │
│  │  memory/*.md  +  memory/structured/*.md             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
cd extensions/sqlite-memory

# Install dependencies
npm install

# Run tests
npm test

# Build (if using TypeScript compilation)
npm run build
```

## License

MIT - Same as OpenClaw
