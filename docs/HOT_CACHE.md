# ClawText Hot Cache — Production Edition

**Version:** v1.4.1  
**Last Updated:** 2026-03-12

## Goal

Provide a tiny, ultra-fast recall layer for the most recent and highest-value memory items.

This cache exists to reduce retrieval latency and improve prompt relevance for active work. It is not the canonical memory store — content remains in clusters (source of truth).

## Design

- **Runtime:** in-process memory structure
- **Persistence:** JSON file on disk at `state/clawtext/prod/cache/hot.json`
- **Source of truth:** semantic clusters at `memory/clusters/`
- **Rebuildable:** yes (safe to delete; content reconstructed from clusters)
- **Operational complexity:** minimal
- **Typical size:** 50–300 items (tunable via config)

## File Layout

```text
state/clawtext/prod/
  cache/
    hot.json      # Active cache items
    stats.json    # Admission/eviction metrics
```

## Configuration Presets (v1.4.1)

Three tuned profiles for different workloads:

### Conservative (Low Noise)
- `maxItems: 150`
- `maxPerProject: 30`
- `maxSnippetChars: 400`
- `maxResultsPerQuery: 3`
- `defaultTtlDays: 7`
- `stickyTtlDays: 30`
- `admissionConfidence: 0.80`
- `admissionScore: 1.8`

**Use when:** Small memory sets, high precision needed, token budget is tight.

### Balanced (Default)
- `maxItems: 300`
- `maxPerProject: 50`
- `maxSnippetChars: 600`
- `maxResultsPerQuery: 5`
- `defaultTtlDays: 14`
- `stickyTtlDays: 60`
- `admissionConfidence: 0.70`
- `admissionScore: 1.5`

**Use when:** Mixed workload, general-purpose agent work. This is the production default.

### Aggressive (High Recall)
- `maxItems: 500`
- `maxPerProject: 100`
- `maxSnippetChars: 900`
- `maxResultsPerQuery: 7`
- `defaultTtlDays: 21`
- `stickyTtlDays: 90`
- `admissionConfidence: 0.60`
- `admissionScore: 1.0`

**Use when:** Large memory sets, high-frequency retrieval, operational learning active.

## Admission Rules

An item is eligible when:
- **confidence** is high enough (see preset thresholds above)
- **retrieval score** is strong enough (semantic + frequency weighted)
- **utility signal** present (promotion, repeated hits, active project context)

Standard admission:
- High-confidence promoted memories from curation lane
- Repeated retrieval winners from archive search
- Active project context summaries

Sticky admission (bypasses TTL decay):
- Very high confidence (confidence ≥0.85+)
- Critical operational knowledge
- Evergreen procedures/preferences
- Important decisions affecting system behavior

## Monitoring Cache Health

**See:** [`MONITORING.md`](./MONITORING.md) for detailed cache metrics, hit rates, eviction signals, and production tuning.

Key metrics to track:
- **Admission rate** — items entering cache per day
- **Hit rate** — % of queries finding cache matches
- **Eviction rate** — items leaving cache per day (normal vs. concerning)
- **Age distribution** — how old are items in cache?
- **Project coverage** — which projects dominate cache?

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
