# ClawText Ingest Integration

## Overview

ClawText Ingest (`clawtext-ingest`) is the **turbocharger** for the ClawText Holistic Memory System. It populates memory clusters from external sources.

## How They Work Together

```
External Sources          Ingest                  ClawText Memory
────────────────        ────────────              ─────────────────
Discord channels  ──►  clawtext-ingest  ──►  Memory API / clusters
Forum threads     ──►  (transforms)     ──►  Hot cache
Files/URLs        ──►                  ──►  Curation pipeline
JSON exports      ──►                  ──►  Retrieval
```

## Ingest Sources

- **Discord** — Forum posts, channel messages, threads
- **Files** — Markdown, JSON, text files
- **URLs** — Web pages, API responses
- **Repositories** — GitHub/GitLab repos
- **JSON/Chat exports** — Chat logs, conversation dumps

## Installation Together

```bash
# Install both
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
git clone https://github.com/ragesaq/clawtext-ingest.git ~/.openclaw/workspace/skills/clawtext-ingest

cd ~/.openclaw/workspace/skills/clawtext && npm install
cd ~/.openclaw/workspace/skills/clawtext-ingest && npm install
```

## Typical Workflow

### 1. Ingest Sources
```bash
# Ingest a Discord channel
clawtext-ingest discord --channel <channel-id> --project myproject

# Ingest a forum thread
clawtext-ingest discord --thread <thread-id> --project myproject

# Ingest files
clawtext-ingest files --path ./docs --project myproject
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