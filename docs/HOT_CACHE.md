# ClawText Hot Cache v1

## Goal

Provide a tiny, ultra-fast recall layer for the most recent and highest-value memory items.

This cache exists to reduce retrieval latency and improve prompt relevance for active work. It is not the canonical memory store.

## Design

- **Runtime:** in-process memory structure
- **Persistence:** JSON file on disk
- **Source of truth:** curated/archive memory elsewhere
- **Rebuildable:** yes
- **Operational complexity:** minimal

## File Layout

```text
memory/cache/
  hot.json
  stats.json
```

## Default Limits

- `maxItems: 300`
- `maxPerProject: 50`
- `maxSnippetChars: 600`
- `maxResultsPerQuery: 5`
- `defaultTtlDays: 14`
- `stickyTtlDays: 60`

## Admission Rules

An item is eligible when:
- confidence is high enough
- retrieval score is strong enough
- it is useful for near-term reuse

Initial defaults:
- `admissionConfidence >= 0.78`
- `admissionScore >= 1.5`

Sticky admission:
- very high confidence
- very strong score
- likely evergreen/operational utility

## Query Behavior

1. Search hot cache first
2. Return up to 5 candidates
3. Query deeper stores
4. Merge + dedupe
5. Inject within token budget

## Eviction

Keep items with:
- high confidence
- high hit count
- recent use
- sticky status
- project relevance

Evict items with:
- staleness
- low confidence
- low utility
- project overflow pressure

## Future Extensions

Possible later upgrades if needed:
- smarter admission from curation pipeline
- explicit sticky/manual pinning
- entity-centric summaries
- snapshot/debug tooling
- optional sqlite backend only if JSON-backed approach proves insufficient
