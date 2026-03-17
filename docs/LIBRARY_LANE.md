# ClawText Documentation / Library Lane

**Status:** Post-2.0 design draft  
**Priority:** P6 (High)  
**Intent:** Add a structured, queryable project/library knowledge lane to ClawText without collapsing the existing memory layers.

---

## 1. Why this exists

ClawText already does four things well:
- working memory for prompt-time recall
- knowledge ingest for bringing external material into the system
- operational learning for repeated failures and promoted guidance
- continuity artifacts for handoffs and recovery

What it does **not** yet have is a first-class home for **durable project knowledge** such as:
- current repo state
- architecture decisions
- project status summaries
- team documentation snapshots
- curated technical reference material

Today, some of this can be ingested, but it is not clearly separated from:
- conversational memory
- operational failure patterns
- raw source ingest

That creates an avoidable problem: agents can retrieve the right *kind* of information less reliably because project/library knowledge is mixed into other memory categories.

**Library Lane fixes that.**

---

## 2. Product goal

Give agents a dedicated, queryable library of structured project knowledge so they can answer questions like:
- "What is the current shape of this repo?"
- "What did we decide about the architecture?"
- "What phase is this project in?"
- "What docs should I trust first?"
- "What is the current status without re-reading 20 files?"

The goal is **reference-quality project memory**, not raw transcript recall and not operational mistake learning.

---

## 3. What makes Library Lane different

### Library Lane is NOT:
- a replacement for ingest
- a replacement for working memory
- a replacement for operational learning
- a graph engine
- a hidden database

### Library Lane IS:
- curated project knowledge
- long-lived reference material
- queryable by agents across sessions
- file-first and auditable
- useful for both humans and agents

---

## 4. Relationship to the current lanes

### 🧠 Working Memory
Use for:
- fast contextual recall
- what matters *right now* in the prompt
- recent or high-signal context injection

### 📦 Knowledge Ingest
Use for:
- importing repos, docs, threads, exports, URLs
- raw/source acquisition
- getting information into the system

### ⚙️ Operational Learning
Use for:
- repeated failures
- fixes, review, promotion
- reusable guidance from operational history

### 🌉 Continuity Artifacts
Use for:
- handoffs
- recovery
- bootstrap packets
- moving context between sessions/surfaces

### 📚 Library Lane
Use for:
- project status and reference knowledge
- architecture summaries
- repo state snapshots
- canonical documentation summaries
- curated knowledge intended to be re-used across many sessions

**Simple rule:**
- if it is about *what just happened* → working memory / continuity
- if it is about *a repeated failure or fix* → operational learning
- if it is *raw imported source material* → ingest
- if it is *durable project reference knowledge* → library lane

---

## 5. MVP scope

The first version should stay narrow.

### MVP includes
1. **Curated library documents**
   - project summaries
   - architecture summaries
   - repo state summaries
   - decision summaries
   - docs indexes

2. **Library-specific metadata**
   - project
   - topic
   - source doc(s)
   - freshness / last reviewed date
   - confidence / curation status
   - visibility scope

3. **Library retrieval path**
   - searchable separately from operational patterns
   - eligible for prompt-time retrieval when query intent is reference-seeking
   - weighted differently than transient conversation memory

4. **Operator workflows**
   - add a library entry
   - refresh an entry
   - mark stale
   - archive / supersede

### MVP excludes
- automatic graph building
- full autonomous summarization and promotion
- deep relationship inference
- org/governance model expansion
- external UI work beyond file + CLI surfaces

---

## 6. Storage model

Keep it file-first.

### Proposed path
```text
state/clawtext/prod/library/
  collections/
  entries/
  indexes/
  snapshots/
  manifests/
  overlays/
```

### Proposed subdirectories

#### `collections/`
Named documentation corpora ingested from trusted sources.

Examples:
- `proxmox-official-docs/`
- `nemoclaw-docs/`
- `tailscale-admin-docs/`
- `openclaw-core-docs/`

Each collection is the durable imported reference body for a topic or platform.

#### `entries/`
Canonical curated library records.

Examples:
- `project-status-clawtext.md`
- `architecture-overview.md`
- `repo-map.md`
- `decision-summary-memory-lanes.md`
- `proxmox-quickstart-summary.md`

Entries are summary/start-here artifacts, not the full underlying corpus.

#### `indexes/`
Generated indexes to speed lookup.

Examples:
- `library-index.json`
- `topics.json`
- `projects.json`
- `collections.json`

#### `snapshots/`
Point-in-time material used to build or refresh entries.

Examples:
- repo tree snapshots
- docs snapshots
- generated source manifests
- ingest refresh deltas

#### `manifests/`
Metadata about refresh jobs and lineage.

Examples:
- which docs fed a library entry
- when a collection was last refreshed
- trust/source metadata for a collection
- what entry superseded another

#### `overlays/`
Local/operator-authored notes layered on top of imported collections.

Examples:
- `proxmox-our-environment.md`
- `tailscale-local-policy.md`
- `nemoclaw-adoption-notes.md`

---

## 7. Entry format

Each library entry should be readable Markdown with machine-usable frontmatter.

### Example
```md
---
kind: library-entry
project: clawtext
topic: architecture
status: active
curation: reviewed
visibility: shared
last_reviewed: 2026-03-17
source_docs:
  - docs/ARCHITECTURE.md
  - docs/NORTHSTAR.md
  - README.md
summary_confidence: 0.88
---

# ClawText Architecture Overview

Short durable summary here.

## Core Structure
...

## Retrieval Notes
...

## When To Refresh
- after major architecture changes
- after release boundary changes
```

---

## 8. Retrieval behavior

Library Lane should not behave exactly like operational memory or working memory.

### Retrieval intent signals
Library results should get a boost when a query looks like:
- current status
- architecture
- what is this project
- how is this repo structured
- what did we decide
- where should I read first
- summarize the current state
- how does this platform work
- what do the docs say
- what is the official guidance

### Retrieval precedence model
For reference-style questions, retrieval should prefer:
1. **reviewed library entries** — concise, curated summaries / start-here records
2. **trusted library collections** — official/vendor/internal curated doc corpora
3. **library overlays** — local environment notes and operator guidance
4. **general ingest/archive material** — broader raw source material
5. **operational memory** — only when the query is really about failures, fixes, or learned behavior

### Ranking behavior
Library results should rank higher when:
- the query is reference-seeking
- the entry is reviewed and fresh
- the entry is canonical for the project/topic
- the underlying source docs are authoritative
- the result comes from a trusted collection
- an overlay clearly matches the current environment or operator question

Library results should rank lower when:
- they are stale
- they are superseded
- the query is clearly operational/debugging focused
- the query is about very recent conversational context
- the source is low-trust or community-only while official docs exist

### Injection behavior
Library results should be:
- concise when possible
- favored for reference questions
- token-budgeted like everything else
- clearly labeled in retrieval provenance
- source-attributed (`official`, `internal`, `community`, `overlay`)

---

## 9. Collections, overlays, and curation workflow

This lane should be curated, not fully automatic.

### Core model
Library Lane uses **both**:
- **collections** — the actual imported documentation corpus
- **entries** — curated summaries / start-here records

Optional third layer:
- **overlays** — local notes that adapt a trusted collection to the operator's real environment

### Collection ingest path
1. Operator chooses one or more trusted sources
2. ClawText ingest pulls the source corpus into a named library collection
3. Source metadata is written to a collection manifest
4. Content is indexed as library material, not generic raw ingest
5. Retrieval can use the collection directly even before summaries exist

### Initial summary path
1. A collection exists
2. Operator or agent creates a candidate library entry
3. Candidate is reviewed
4. Approved version becomes a canonical library entry
5. Index refresh updates retrieval

### Overlay path
1. A trusted collection exists (for example, official Proxmox docs)
2. Operator adds local environment notes
3. Overlay is linked to the collection and topic
4. Retrieval can return both official guidance and local operating reality together

### Refresh path
1. Source docs change materially
2. Collection manifest is marked refresh-needed or stale
3. Collection refresh runs
4. Existing summaries/overlays are checked against the refreshed source base
5. New summaries supersede old ones when needed

### Archive path
When a project is obsolete or a summary is replaced:
- mark as superseded or archived
- keep lineage in manifest
- remove from normal top-rank retrieval

---

## 10. Operator value

Library Lane should make these workflows easier:

### A. Project bootstrap
"Get me up to speed on this repo"
- return the project status summary
- return architecture overview
- return where to read next

### B. Cross-agent continuity
A different agent can ask:
- what is current state
- what decisions matter
- what docs are canonical

without re-reading an entire repo from scratch.

### C. Long-running product work
As projects evolve, the library becomes:
- a current-state knowledge hub
- a project-reference layer
- a human/agent shared understanding surface

---

## 11. Boundaries and guardrails

### Do not let Library Lane become:
- a dumping ground for every ingested document
- a second operational-learning lane
- a replacement for source docs
- a graph-native knowledge engine
- a magical always-correct summary generator

### Required guardrails
- source lineage must be visible
- stale entries must be detectable
- reviewed entries outrank unreviewed ones
- entries remain plain files
- operators can delete and rebuild safely

---

## 12. Suggested implementation slices

### Slice 1 — Shape the lane
- add `state/clawtext/prod/library/` paths
- define collection manifests
- define entry metadata
- define overlay metadata
- define index metadata
- create 2-3 manual example entries

### Slice 2 — Retrieval integration
- add library index loading
- add query-intent boost for reference-style prompts
- include provenance label: `library`
- distinguish `entry`, `collection`, and `overlay` in provenance
- add retrieval debug visibility

### Slice 3 — Refresh workflow
- add stale / superseded states
- add collection refresh metadata
- add source lineage manifests
- add refresh command / script

### Slice 4 — Agent workflow
- add library summary generation helper
- add review flow for candidate entries
- add collection creation flow for trusted docs
- add overlay authoring flow for local operator notes
- add docs on when to use library vs ingest vs operational memory

---

## 13. First candidate entries for ClawText itself

Use ClawText as the dogfood target.

1. **ClawText current project status**
2. **ClawText architecture overview**
3. **ClawText repo map**
4. **ClawText release / roadmap summary**
5. **ClawText operator reading order**

This gives us a real test set for:
- retrieval quality
- freshness handling
- curation flow
- usefulness across sessions

---

## 14. Success criteria

Library Lane is succeeding when:
- agents can answer project-status questions without repo re-digestion
- architecture questions pull reviewed summaries first
- source lineage is visible and trusted
- operators can refresh summaries without hidden state
- library retrieval improves cross-session and cross-agent project continuity

---

## 15. Recommended next step

Build the MVP around **manual curated entries + separate retrieval weighting** first.

Do **not** start with automation-heavy summarization.

The fastest path to value is:
1. establish the lane
2. create a few excellent entries
3. wire retrieval intent to use them
4. then automate refresh later

## 16. Collection manifest shape (draft)

A collection should have a manifest that records where the documentation came from and why it is trusted.

### Example
```yaml
kind: library-collection
slug: proxmox-official-docs
title: Proxmox VE Official Documentation
project: external-reference
source_type: official-docs
trust_level: official
status: active
last_ingested: 2026-03-17
refresh_policy: manual
sources:
  - https://pve.proxmox.com/pve-docs/
topics:
  - proxmox
  - virtualization
  - zfs
  - clustering
```

This is what lets the agent know that a Proxmox answer came from a stable, known corpus rather than random web recall.

## 17. Overlay shape (draft)

An overlay should capture how *we* use or interpret a trusted collection in our environment.

### Example
```yaml
kind: library-overlay
slug: proxmox-our-environment
collection: proxmox-official-docs
project: infrastructure
scope: local-ops
status: active
last_reviewed: 2026-03-17
visibility: shared
```

Overlay body contents would include local decisions, constraints, and warnings.

## 18. Dogfood seed entries

The first seed entries now live in:
- `docs/library/entries/project-status-clawtext.md`
- `docs/library/entries/architecture-overview-clawtext.md`
- `docs/library/entries/repo-map-clawtext.md`

These are example curated library records for ClawText itself. They are repo-stored dogfood examples, not the final runtime store.
