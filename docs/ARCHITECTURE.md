# ClawText Holistic Memory System — Unified Architecture v1

## Purpose

ClawText is the unified memory platform for OpenClaw. It captures useful knowledge from activity, ingests external sources, retrieves relevant context efficiently, curates high-signal memory over time, and publishes a single installable/documented product story.

## Product Pillars

1. **Capture** — collect messages/events into structured intake
2. **Ingest** — turbocharge specific threads, docs, repos, URLs, JSON, and exports
3. **Recall** — retrieve the best context for the current query
4. **Curation** — score, summarize, promote, archive, and maintain memory quality
5. **Publish** — installation, validation, packaging, health, and documentation
6. **Actions** *(optional subsystem)* — route actionable captures to safe handlers

## Core Principle

`MEMORY.md` is not the memory database. It is the smallest, highest-signal curated fast-path artifact.

## Memory Lanes

### L1 — Hot Cache
Ultra-fast, in-memory + JSON-backed working set.

Use for:
- recent high-confidence promoted memories
- frequently hit operational knowledge
- active project context
- sticky preferences/procedures

Properties:
- tiny (default target: ~300 items)
- fast to scan
- safe to delete/rebuild
- not a source of truth

### L2 — Curated Memory
Stable, promoted, structured, high-signal memory.

Use for:
- decisions
- protocols
- preferences
- project state summaries
- important learnings

### L3 — Searchable Archive
Broad historical/searchable memory.

Use for:
- daily notes
- ingested documents/threads
- source material
- cold project history

### L4 — Intake / Staging
Raw or semi-processed input awaiting curation.

Use for:
- extraction buffer
- ingest outputs awaiting scoring
- review queues
- near-misses
- action drafts

## End-to-End Pipeline

```text
Capture / Ingest
  -> intake / staging
  -> dedupe
  -> summarize / score
  -> promote OR archive OR route action
  -> index
  -> hot-cache admission
  -> recall merge
  -> token-budgeted prompt injection
```

## Retrieval Strategy

Recall should merge multiple retrieval lanes rather than relying on one store.

1. **Hot Cache** — very recent/high-value candidates
2. **Curated Recall** — promoted structured memories
3. **Archive Search** — deeper historical material
4. **Merge + Rank** — weighted lexical/semantic/recency/entity scoring
5. **Inject** — fit within token budget

## Hot Cache v1

Implementation strategy:
- in-process memory structure
- JSON persistence at `memory/cache/hot.json`
- no external service
- no sqlite requirement

Recommended default config:

```json
{
  "enabled": true,
  "maxItems": 300,
  "maxPerProject": 50,
  "maxSnippetChars": 600,
  "maxResultsPerQuery": 5,
  "defaultTtlDays": 14,
  "stickyTtlDays": 60,
  "evictionPolicy": "score_then_lru"
}
```

Admission candidates:
- high-confidence promoted memories
- repeated retrieval hits
- active-project summaries
- important recent decisions

Eviction signals:
- stale + low-hit items
- low-confidence entries
- superseded summaries
- project-overflow pressure

## Canonical Direction

Externally, this remains **ClawText**.

Internally, it may contain subsystems analogous to the current pieces:
- current ClawText RAG -> **Recall/Core**
- clawtext-ingest -> **Ingest**
- mindgardener -> **Curation**
- memory-braid-inspired fast lane -> **Hot Cache / retrieval merge**
- action-adapter -> **Actions**

## Implementation Priorities

### Phase 1
- architecture lock
- hot cache v1
- retrieval merge
- cache stats + debug visibility

### Phase 2
- canonical metadata schema
- entity extraction
- lifecycle metrics
- curation subsystem formalization

### Phase 3
- unified packaging/docs/CLI story
- publish-ready README/SKILL/ClawHub metadata
- migration guides from old subprojects

## Guardrails

- Keep the cache small; do not let it become a shadow database
- Never bypass curation rules for long-term memory quality
- Ingest should not write directly into hot memory by default
- All layers must remain inspectable/debuggable with plain files
- The system must continue working if the hot cache is deleted
