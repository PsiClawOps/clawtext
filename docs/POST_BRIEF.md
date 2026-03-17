# ClawText 2.0 — Publication Brief

**Audience:** GitHub, Discord ai-projects channel, public positioning  
**Source of Truth:** `docs/NORTHSTAR.md`, `docs/PRD.md`, and `docs/MILESTONES.md`  
**Date:** 2026-03-16 | **Status:** publication-hardening

---

## Version and release framing

Use this wording consistently in outward-facing material unless package version changes:
- **Product release framing:** ClawText 2.0
- **Package/install version framing:** `github:PsiClawOps/clawtext` 0.2.0

Do not imply that the published package is already tagged `2.0.0` unless `package.json` is updated to match.

## Current release-truth constraints

Publication should preserve these current truths:
- retrieval source support for reviewed/promoted operational patterns appears strong, but the strongest end-to-end proof artifact is still being hardened
- base multi-agent visibility filtering appears real in source, but release-grade isolation validation is still being hardened
- continuity artifact generation and bounded transport are strong, but the cleanest end-to-end resume proof is still being hardened
- quantified impact ranges are directional unless backed by explicit measurement artifacts

## Opening Hook (One-Liner)

**ClawText gives OpenClaw agents durable memory, automatic context retrieval, and operational learning — so they improve over time instead of repeating mistakes.**

---

## The Problem (60 seconds)

Long-running agent work fails not because models are incapable, but because context gets fragmented.

Decisions end up scattered across:
- prior sessions and threads
- scattered docs and READMEs
- repos and working notes
- operational failures and workarounds
- handoff artifacts across recovery surfaces

When that happens, agents lose:
- prior decisions and the rationale behind them
- lessons from repeated failures
- patterns of successful workflows
- continuity when work moves between sessions or threads

Every context switch feels like day one again.

**The result:** Repetitive re-explanation. Agents that should be learning instead become expensive, forgetful search engines.

---

## The Solution (90 seconds)

ClawText is a **layered memory and continuity system** for OpenClaw agents.

It works in three layers:

**L1 — Hot Context**
Automatically retrieves prior decisions, docs, and lessons at prompt time. Agents continue with context already in place instead of restarting from zero.

**L2 — Durable Memory**
Captures and indexes agent activity, team docs, repos, and operational patterns. Makes it all searchable and retrievable for future work.

**L3 — Continuity Artifacts**
Generates structured handoffs and bootstrap packets so work can move cleanly between sessions, threads, or recovery surfaces without losing context.

**The result:** Agents that have context. Teams that accumulate wisdom. Fewer repeated mistakes.

---

## What You Get (Product Promise)

### Automatic Context Retrieval
Prior decisions, docs, failures, and successful patterns surface without configuration. Your agent continues with context in place instead of asking the same questions again.

**Impact framing:** Expected to reduce repetitive context re-explanation and setup overhead materially; quantified range should be treated as directional until stronger post-launch measurement exists.

### Operational Learning
Repeated failures are captured and surfaced for review. When you confirm a pattern is stable, it becomes organizational wisdom. Future agents retrieve it automatically.

**Impact framing:** Intended to reduce repeated mistakes once recurring failures are captured and promoted; quantified range should be treated as directional until stronger proof is collected.

### Preservable Continuity
Work can move cleanly between sessions, threads, or recovery surfaces. Structured handoffs preserve decisions, context, and next steps. No manual reconstruction needed.

**Impact framing:** Supports structured session transitions and work resumption; exact preservation rate should be treated as directional until stronger end-to-end continuation proof is captured.

### Honest Boundaries
We own memory capture, retrieval, and continuity packaging. We don't overclaim Discord transport, relationship graphs, or full agent identity. What we promise, we deliver.

---

## How It Works (Technical Overview)

### Lane 1: Working Memory (Retrieve & Inject)

```
Agent starts a task
  ↓
ClawText retrieves prior context (decisions, failures, patterns)
  ↓
Top ranked results inject silently into the prompt
  ↓
Agent continues with context already in place
```

Uses hybrid retrieval (BM25 keyword matching + semantic similarity + entity relationships) so you get both exact matches and conceptual matches.

### Lane 2: Knowledge Ingest (Import & Normalize)

```
You configure sources (repos, docs, threads, JSON exports)
  ↓
ClawText imports and deduplicates
  ↓
Indexes and clusters
  ↓
Makes it available for working memory retrieval
```

Agents don't have to know your decision log exists. ClawText surfaces it when relevant.

### Lane 3: Operational Learning (Failures → Wisdom)

```
Agent encounters repeated failure (3+ times)
  ↓
ClawText captures with full context
  ↓
Surfaces for team review
  ↓
Team promotes stable workaround
  ↓
Future agents retrieve pattern automatically
```

Repeated mistakes become "known issues with workarounds" that future agents inherit.

---

## Architecture & Reliability

### File-First State
All memory lives in files under `state/clawtext/prod/`. No black-box databases. Everything is:
- ✅ Auditable (you can see exactly what was captured)
- ✅ Portable (backup/move/inspect with standard tools)
- ✅ Version-control friendly (commit important patterns)
- ✅ Recoverable (restore from backups using standard tools)

### Hybrid Retrieval
Doesn't rely on any single ranking method:
- **BM25** — finds exact terms ("User-Agent header")
- **Semantic** — finds conceptual matches ("authentication")
- **Entity** — finds connected context ("this is related to that")

Result: Fast, robust retrieval. Rarely misses relevant context.

### Scheduled Maintenance
Clusters rebuild weekly (tunable). Memory groupings stay fresh. No gradual degradation as context accumulates.

---

## The Philosophy

ClawText is intentionally opinionated:

- **Simple first** — Keep the mental model small: layers, files, and clear contracts
- **Automatic where possible** — Reduce friction; agents get context without configuration
- **Reviewable when it matters** — Humans keep control over risky decisions (like promotion)
- **CLI/control-first** — If it matters, it's inspectable and configurable

---

## Installation & Setup

### Install
```bash
openclaw plugins install github:PsiClawOps/clawtext
```

### Verify
```bash
openclaw plugins list
openclaw hooks list
openclaw cron list
```

ClawText works automatically from here. Your first agent run will:
1. Capture context as it works
2. Build daily memory
3. Queue patterns for operational learning

No configuration needed to get started.

### Optional: Load Existing Documentation
```bash
clawtext ingest --source=github:https://github.com/yourorg/docs --type=repo
```

Now agents can reference your docs automatically.

---

## Use Cases

### Case 1: Reduce Repetitive Questions
Agent spends an hour on Monday debugging an issue, finds the fix, documents it. Tuesday, a different session or thread tries the same task. Without ClawText: repeats the debugging. With ClawText: the fix is already there.

### Case 2: Preserve Continuity Across Sessions
Work starts in one session, moves to another (or to a different surface). Without ClawText: context is scattered. With ClawText: handoff packet preserves continuity; new session resumes where prior work left off.

### Case 3: Accumulate Organizational Wisdom
Your team runs agents for weeks. Repeated failures surface ("never use approach X because Y"). After promotion, future agents know this automatically. The agent collective gets smarter.

---

## What ClawText Is And Isn't

### ✅ ClawText IS
- A practical file-based memory system for multi-agent coordination
- Automatically capturing and retrieving context at prompt time
- Auditable, explicit, and file-visible by design
- Operationally safe by default (token gates, visibility, explicit failures)

### ❌ ClawText IS NOT
- A full hidden long-context replacement
- A comprehensive vector database
- A full identity or secrets platform
- Autonomous self-healing (humans keep control via review)

---

## Positioning Against Alternatives

| Approach | Strength | Trade-off | How ClawText Differs |
|---|---|---|---|
| **OpenClaw default memory** | Simple, fast setup | weak continuity, limited tooling | Adds structured layers, continuity engine, operational learning |
| **Pure vector-store RAG** | Strong semantic search | can over-inject noise, weak safety | Adds ranking merge, prompt gates, human review controls |
| **Single-surface memory tools** | Lightweight, portable | isolated by surface, weak cross-workflow continuity | Focuses on OpenClaw workflows, artifact-based continuity |
| **Graph databases** | Rich relationships | complexity, schema burden | Uses lightweight relationships today; graph-native is post-2.0 |
| **Manual context workflows** | Full control, human-safe | high operator overhead | Balances automation with explicit review points |

---

## Getting Started (Next Steps)

1. **Install** — `openclaw plugins install github:PsiClawOps/clawtext`
2. **Run your first agent** — ClawText starts capturing automatically
3. **Check health** — `openclaw plugins status` confirms hooks are active
4. **Ingest your docs** (optional) — `clawtext ingest --source=...` to make team knowledge queryable
5. **Review patterns** (after 10+ runs) — `clawtext operational:status` shows candidates for promotion
6. **Promote stable patterns** — Team decides which workarounds become organizational wisdom

---

## Documentation

- **README** — Full product overview and architecture
- **docs/ARCHITECTURE.md** — Deep dive into three lanes
- **docs/NORTHSTAR.md** — Strategic product definition (for teams, not just product folks)
- **docs/MILESTONES.md** — Value delivery and proof
- **Installation:** `AGENT_INSTALL.md` and `AGENT_SETUP.md`
- **Configuration:** `MEMORY_POLICY_TRIGGER_CONTRACT.md`
- **Deep dives:** `INGEST.md`, `OPERATIONAL_LEARNING.md`, `HOT_CACHE.md`

---

## Release truth note

Current package metadata still reports `1.5.0`. Public copy should present this honestly as a **2.0 product/release boundary** carried by the current package version until the package version is updated.

## Launch Messaging

### For GitHub / Public Announcement

**Title:** ClawText 2.0: Durable Memory & Operational Learning for OpenClaw Agents

**Body:**
- Problem statement (context fragmentation)
- Three-layer solution (memory → learning → continuity)
- What operators get (automatic recall, wisdom accumulation, session continuity)
- Installation and first steps
- Link to full README and docs

**Tone:** Confident, but evidence-disciplined. Strong where behavior is supported; avoid overclaiming beyond validated truth.

### For Discord ai-projects Channel

**Canonical quick post:**

```text
**ClawText v0.2.0** is out — a big update for durable memory and continuity in OpenClaw.

ClawText combines automatic memory capture, hybrid retrieval, prompt-time injection, multi-source ingest, operational learning, and continuity artifacts so agents can keep context instead of restarting from zero each time.

Now shipping in four lanes:
🧠 working memory for fast contextual recall
📦 knowledge ingest for docs, repos, threads, and exports
⚙️ operational learning for repeated failures, fixes, review, and promoted guidance
🌉 ClawBridge for handoffs, recovery, bootstrap artifacts, and cross-session transfer

File-first, auditable, and built for long-running agent workflows.

More to come.
```

---

## Quality Gate (Before Publication)

✅ README reflects Northstar (no internal checklist language)  
✅ Milestones reflect current supported behavior and remaining proof gaps  
✅ Boundary docs are accurate (no overclaiming)  
✅ Installation instructions work  
✅ Health tooling is accessible  
✅ Team has reviewed messaging  
✅ Tone is confident and evidence-disciplined  

---

## Success Metrics (Post-Launch)

- [ ] GitHub README is star-worthy (clear problem, clear solution, confidence)
- [ ] Installation instructions work without friction
- [ ] First-run agents capture and retrieve context automatically
- [ ] After 10 runs, operational patterns surface for promotion
- [ ] Operators report continuity handoffs preserve sufficient context
- [ ] Public feedback focuses on value, not on limitations

---

**Publication readiness:** conditionally ready once output copy reflects supported claims and current proof gaps honestly.
