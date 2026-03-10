# ClawText Curation

## Purpose

Curation is the quality-control subsystem of ClawText.

Its job is to prevent the memory system from collapsing into a raw transcript dump. It decides what becomes durable high-signal memory, what stays searchable but colder, what requires review, and what should be routed as an action instead of a memory.

## Responsibilities

Curation handles:
- staging incoming captures and ingest outputs
- scoring and prioritization
- deduplication / collapse of similar material
- summarization and compression
- promotion into curated memory
- archive placement for lower-priority material
- review queues for uncertain items
- action routing for actionable captures

## Pipeline

```text
capture / ingest
  -> staging
  -> score
  -> dedupe
  -> summarize
  -> promote | archive | review | route-action
  -> index
  -> optional hot-cache admission
```

## Inputs

Typical curation inputs:
- extract buffer events
- ingest outputs from files/Discord/URLs/JSON/repos
- manually staged notes
- deduped archive groups
- high-recurrence log/archive clusters

## Outputs

Typical curation outputs:
- promoted memory entries
- project summaries
- review queue items
- review-actions drafts
- promotion logs
- archive buckets
- digest summaries

## Lane Mapping

- **L1 Hot Cache** — tiny working set for recall speed
- **L2 Curated Memory** — promoted, trusted, structured memory
- **L3 Searchable Archive** — deeper historical material
- **L4 Intake / Staging** — raw/semi-processed incoming material

Curation primarily governs movement between L4 -> L2/L3 and selective admission into L1.

## Decision Outcomes

### Promote
Use when:
- confidence is high
- signal is durable
- likely to help future recall
- not just a transient conversational artifact

### Archive
Use when:
- useful but lower priority
- source material should remain searchable
- not worthy of fast-path injection yet

### Review
Use when:
- signal is unclear
- automation confidence is low
- promotion risk is high
- human inspection is warranted

### Route Action
Use when:
- the item is really a task/instruction/reminder/message/thread request
- memory promotion would be the wrong outcome

## Quality Heuristics

Recommended curation signals:
- confidence / summarizer confidence
- recurrence count
- entity richness
- project affinity
- explicitness of decision/protocol/fact
- source reliability
- actionability vs memorability
- dedupe compression gain

## Current Workspace Alignment

Existing MindGardener components already cover several of these roles:
- `skills/mindgardener/garden.js`
- `skills/mindgardener/promotion-run.js`
- `skills/mindgardener/action-adapter.js`
- `skills/mindgardener/config.json`

The ClawText direction is to absorb these concepts into a single product story while preserving compatibility during migration.

## Near-Term Implementation Priorities

1. Formal canonical schema for promoted memory entries
2. Add curation metrics / stats visibility
3. Normalize staging/review/archive directories and file contracts
4. Add entity extraction + richer metadata
5. Unify docs/install/story so Curation is a first-class ClawText subsystem
