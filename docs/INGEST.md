# ClawText Ingest Integration

## Overview

**ClawText v1.4.0+:** Ingest is now **bundled directly into ClawText**. No separate package to install.

The ingest system is the **turbocharger** for the ClawText Holistic Memory System. It populates memory clusters from external sources.

## How It Works

```
External Sources          ClawText Ingest         ClawText Memory
────────────────        ──────────────────        ─────────────────
Discord channels  ──►  (built-in, bundled)  ──►  Memory API / clusters
Forum threads     ──►  (transforms)         ──►  Hot cache
Files/URLs        ──►                       ──►  Curation pipeline
JSON exports      ──►                       ──►  Retrieval
```

## Ingest Sources

- **Discord** — Forum posts, channel messages, threads
- **Files** — Markdown, JSON, text files
- **URLs** — Web pages, API responses
- **Repositories** — GitHub/GitLab repos
- **JSON/Chat exports** — Chat logs, conversation dumps

## Installation

```bash
# Install ClawText through the plugin manager (includes ingest)
openclaw plugins install github:PsiClawOps/clawtext

# or for local development
openclaw plugins install --link /path/to/clawtext
```

ClawText v1.4.0+ includes ingest functionality built-in. No separate installation steps required.

## Typical Workflow

### 1. Ingest Sources
```bash
# Ingest a Discord channel
node scripts/ingest-all.mjs --source discord --channel <channel-id> --project myproject

# Ingest files
node scripts/ingest-all.mjs --source files --path ./docs --project myproject

# Ingest URLs
node scripts/ingest-all.mjs --source urls --input https://example.com --project myproject
```

### 2. Memory Gets Processed
- Ingest writes to staging or directly to clusters
- Curation scores and promotes memories
- Hot cache warms with frequently-accessed items
- Retrieval includes ingested content

### 3. Query with ClawText
```bash
# Via CLI
npm run memory -- search "myproject" --shared

# Via API
const results = await memory.search('query', { project: 'myproject' });
```

## Ingest → Memory Pipeline

```
Ingest Output
    │
    ▼
┌─────────────┐
│   Staging   │  (raw imported content)
└─────────────┘
    │
    ▼
┌─────────────┐
│  Dedupe &   │  (remove duplicates)
│  Normalize  │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Score &   │  (confidence, importance)
│   Categorize│
└─────────────┘
    │
    ├──► Promote ──► Curated Memory ──► Hot Cache
    │
    └──► Archive ──► Searchable Archive
```

## Configuration

In `clawtext-ingest/config.json`:

```json
{
  "outputDir": "../clawtext/memory/clusters",
  "stagingDir": "../clawtext/memory/staging",
  "defaultProject": "general",
  "minConfidence": 0.7,
  "autoPromote": true,
  "dedupe": true
}
```

## CLI Reference

```bash
# ClawText Ingest
clawtext-ingest discord --channel <id> --project <name>
clawtext-ingest files --path <path> --project <name>
clawtext-ingest url <url> --project <name>

# ClawText Memory
npm run memory -- add "content" --type fact --project myproject
npm run memory -- search "query" --project myproject --shared
npm run memory -- list --project myproject
npm run memory -- stats
```

## Health Checks

```bash
# Overall system health
npm run health

# Memory-specific stats  
npm run memory -- stats

# Cache health
npm run cache:stats

# Curation pipeline health
npm run curation:stats
```