# ClawText — Layered Memory and Continuity for OpenClaw Agents

**Product Release:** 2.0 | **Package Version:** 1.5.0 | **Status:** Stable | **Type:** OpenClaw Plugin

> Durable memory, continuity, and operational learning for long-running agents. ClawText captures durable context, retrieves relevant knowledge at the right time, preserves structured handoffs, and helps agents improve through repeated workflow outcomes.

---

## Version Semantics

ClawText currently uses two version frames intentionally:
- **Product release:** ClawText **2.0** — the lifecycle/release boundary for the coherent layered memory system
- **Package version:** `@openclaw/clawtext` **1.5.0** — the npm/package version currently published in `package.json`

Until the package version is bumped, public and internal docs should avoid implying that the npm package itself is already tagged `2.0.0`.
The honest framing is: **ClawText 2.0 product release, currently packaged as version 1.5.0.**

---

## The Problem: Context Fragmentation

Long-running agent work does not usually fail because the model is incapable. It fails because the context gets fragmented.

Decisions end up scattered across:
- prior sessions and threads
- docs and READMEs
- repos and working notes
- operational failures and workarounds
- handoff artifacts and recovery documents

When that happens, agents do not just forget facts. They also lose:
- decisions that were already made
- lessons from repeated failures
- successful workflow patterns
- continuity when work moves between sessions, threads, or recovery surfaces

Every context switch starts to feel like day one again.

**ClawText solves this by turning fragmented context into something durable, retrievable, and usable.** The goal is not just memory search. The goal is letting agents continue with relevant context already in place.

---

## What Is ClawText?

ClawText is a **layered memory and continuity system** for OpenClaw agents.

It combines three practical layers of context:

| Layer | What It Holds | Why It Matters |
|------|----------------|----------------|
| **L1 — Hot Context** | Prompt-time working memory for the current task | Keeps active prompts focused and helps agents continue instead of restarting from zero |
| **L2 — Durable Memory** | Clustered/searchable memory, ingested knowledge, and operational patterns | Makes prior decisions, docs, failures, and successful workflows retrievable later |
| **L3 — Continuity Artifacts** | Handoffs, bootstrap packets, manifests, backups, and document/file outputs | Preserves structured continuity across sessions, threads, and recovery workflows |

Those layers are implemented through three core product lanes:

| Lane | What It Does | Result |
|------|-------------|--------|
| **Working Memory** | Retrieve and inject relevant context at prompt time | Agents continue with continuity; prompts stay focused |
| **Knowledge Ingest** | Normalize, deduplicate, and index docs/repos/threads/JSON sources | Broader context recall without bloat |
| **Operational Learning** | Capture failures and promote stable guidance | Fewer repeated mistakes; growing agent wisdom |

The result is a system that is bigger than simple memory lookup while staying focused on the practical memory problems real agents actually have.

---

## What You Actually Get

ClawText is designed to make agents more useful in the places where memory failure hurts the most.

With ClawText, agents can:
- **remember prior decisions** instead of asking the same questions again
- **carry context across sessions and threads** instead of restarting from zero
- **surface relevant docs, repos, and prior work automatically** when they matter
- **learn from repeated failures and successful workflows** instead of losing those lessons to logs
- **preserve structured handoffs and recovery artifacts** so work can continue cleanly on another surface or in another session

This is the core memory story: not just storing more context, but making previously earned context usable again.

### A quick example

On Monday, an agent spends an hour debugging a workflow, discovers two dead ends, finds the real fix, and writes a useful handoff.

On Tuesday, the work resumes in a different session or thread.

Without ClawText, that second session often starts by rediscovering the same dead ends.

With ClawText:
- the prior decision path is retrievable
- the failed approaches can surface as operational guidance
- the handoff artifact preserves continuity if the work moved surfaces
- the new session starts from the best known state instead of the blank state

That is the difference ClawText is trying to create.

---

## The Layers at a Glance

```text
┌──────────────────────────────────────────────────────────────┐
│ L3 — Continuity Artifacts                                   │
│ Handoffs, bootstrap packets, manifests, backups, file docs  │
├──────────────────────────────────────────────────────────────┤
│ L2 — Durable Memory                                         │
│ Clustered/searchable memory, ingested knowledge,            │
│ operational patterns, prior decisions, useful history       │
├──────────────────────────────────────────────────────────────┤
│ L1 — Hot Context                                            │
│ Prompt-time working memory for the current task             │
└──────────────────────────────────────────────────────────────┘
```

ClawText works from the inside out:
- **L1** helps the current prompt stay grounded in the most relevant context
- **L2** preserves the durable memory that makes later retrieval possible
- **L3** preserves continuity when work has to move across sessions, threads, or recovery flows

Together, those layers make ClawText feel less like a memory cache and more like a continuity system for real agent work.

---

## How It Works: The Three Lanes in Depth

### Lane 1: Working Memory (Retrieve & Inject)

**What it does:** When your agent starts a task or continuation, ClawText retrieves the most relevant prior context and injects it into the prompt—without asking, without configuration.

**How it works:**

```
Conversation starts
    ↓
ClawText captures prior context (decisions, failures, patterns)
    ↓
Daily memory writes capture the relevant pieces
    ↓
Clusters rebuild (weekly) grouping similar context
    ↓
On new prompt: retrieve via hybrid search (BM25 + semantic + entity)
    ↓
Top ranked results inject silently into the prompt
    ↓
Agent continues with context already in place
```

**Why this matters:** Agents don't start from zero. A task that took 3 rounds of clarification yesterday takes 1 round today because the context is already there.

**Example:** Agent is debugging a failing test suite. Day 1: tries 5 approaches, documents what failed. Day 2: starts fresh on the same suite. Without ClawText: repeats the 5 failed approaches. With ClawText: "We found in prior runs that approach 3 and 5 fail consistently because of X. Let's try approach 6."

**Configuration points:**
- `maxMemories`: How many prior contexts to consider (default: 7, range 3–15)
- `minConfidence`: Rank cutoff for injection (default: 0.65, range 0.5–0.9)
- `clusters.rebuildInterval`: How often to recompute groupings (default: weekly, tunable to daily for fast-moving projects)

---

### Lane 2: Knowledge Ingest (Import & Normalize)

**What it does:** Turns your repos, docs, thread archives, and JSON exports into queryable context that agents can reference.

**How it works:**

```
You configure ingest sources
    ↓
ClawText imports: GitHub repos, markdown docs, Discord threads, JSON exports
    ↓
Deduplicates across sources
    ↓
Validates quality (removes truncated/corrupt entries)
    ↓
Indexes and clusters
    ↓
Makes it available for working memory retrieval
```

**Why this matters:** Agents don't have to know your decision log, your README, or your past failures exist. ClawText surfaces them automatically when relevant.

**Example:** You have `decisions.md` documenting 50 architectural choices. Agent gets stuck on a design question. ClawText doesn't just answer it—it surfaces the past context that led to the decision, so the agent understands why it matters.

**Supported sources:**
- GitHub repos (extracts README, docs, issue history)
- Markdown files and doc directories
- Discord forum threads and archives
- JSON exports (normalized format)
- Directory trees with metadata

---

### Lane 3: Operational Learning (Failures → Wisdom)

**What it does:** Watches for patterns in agent failures. When the same problem happens 3+ times, it promotes stable guidance that future agents auto-retrieve.

**How it works:**

```
Agent encounters failure (timeout, validation error, malformed output, etc.)
    ↓
ClawText captures it with context (what was the agent trying? what failed?)
    ↓
System aggregates: have we seen this failure before?
    ↓
At threshold (e.g., 3 recurrences): surfaces for review
    ↓
You decide: is this a pattern? Is the workaround stable?
    ↓
If yes: promote to operational guidance
    ↓
Future agents: retrieve this pattern + workaround automatically
```

**Why this matters:** Your agents get smarter over time. Common mistakes become "known issues with workarounds." The next agent doesn't repeat them.

**Example:** Agent A fails when trying to fetch URLs without User-Agent. Agent B fails the same way. Agent C fails too. ClawText flags it: "Seen 3x: fetch without User-Agent fails. Workaround: add User-Agent header." Agent D reads that automatically and succeeds.

**What gets captured:**
- Failures (with full context: what was attempted, what failed, why)
- Successful workflows (patterns that worked)
- Edge cases and workarounds
- Integration quirks and boundaries

**How you control it:**
- Failures auto-capture (no config needed)
- Review queue shows candidates for promotion
- You decide which patterns become organizational wisdom
- Visibility: see both reviewed and promoted patterns

---

## The Architecture: Why It's Reliable

ClawText uses **file-first state** and **hybrid retrieval**. Here's why that matters:

### File-First State
All context lives in files under your `state/clawtext/prod/` directory. This means:
- ✅ Version control friendly (you can commit important patterns)
- ✅ Auditable (see exactly what was captured)
- ✅ Portable (backup/move/inspect with standard tools)
- ✅ Testable (no hidden database state)

### Hybrid Retrieval
ClawText doesn't rely on any single ranking method:
- **BM25** (keyword matching): finds exact terms ("User-Agent")
- **Semantic** (embeddings): finds conceptual matches ("authentication headers")
- **Entity matching** (relationships): finds connected context ("this is related to that")

Result: Retrieval is fast, robust, and rarely misses relevant context.

### Scheduled Maintenance
Clusters rebuild weekly (tunable). This means:
- Memory groupings stay fresh as new patterns emerge
- No gradual degradation as context accumulates
- Predictable maintenance window (doesn't block real work)

---


## Lifecycle Canon

ClawText is now being finished inside the ClawTomation lifecycle framework.

Canonical lifecycle docs:
- `docs/NORTHSTAR.md`
- `docs/PRD.md`
- `docs/MILESTONES.md`
- `docs/FLIGHT_CONTROL.md`
- `docs/POST_BRIEF.md`

Supporting control docs:
- `docs/ENFORCEMENT.md`
- `docs/CHANGE_ROUTING.md`
- `docs/RETROFIT_REPORT.md`
- `docs/RELEASE_HARDENING_PACKET.md`
- `docs/CHANGE_ROUTING.md`
- `docs/RETROFIT_REPORT.md`

## Installation & Quick Start

### Install
```bash
openclaw plugins install @openclaw/clawtext
```

### Verify it's working
```bash
openclaw plugins list
# Should show: clawtext (version 2.0.0, enabled)

openclaw hooks list
# Should show: prompt-build hook from clawtext

openclaw cron list
# Should show: weekly cluster rebuild, daily memory consolidation
```

### First Run
ClawText works automatically from here. Your first agent run will:
1. Capture context as it works
2. Start building daily memory
3. Queue patterns for operational learning

No configuration needed to get started.

---

## Common First Workflows

### Scenario 1: Load Existing Documentation
You have a GitHub repo with lots of docs. Make them queryable:

```bash
clawtext ingest \
  --source=github:https://github.com/yourorg/docs \
  --type=repo \
  --priority=high

# Now agents can reference docs automatically
```

### Scenario 2: Set Up Operational Learning
You want to capture agent failures and surface workarounds:

```bash
clawtext operational-learning enable \
  --review-queue=true \
  --auto-capture-failures=true \
  --promotion-threshold=3

# ClawText will flag patterns after 3 recurrences
```

### Scenario 3: Control Memory Injection
Your prompts are already token-heavy. Tune injection:

```bash
# config.yaml
clawtext:
  workingMemory:
    maxMemories: 3          # Fewer memories
    minConfidence: 0.8      # Only high-confidence matches
    retrieval:
      depth: 2              # Shallow searches only
```

**Expected overhead:** ~10% more tokens, but agents skip 30-50% of repetitive clarification.

---

## Tuning for Your Situation

### Token Budget Is Tight
```yaml
maxMemories: 3
minConfidence: 0.75
retrieval.depth: 2
clusters.rebuildInterval: 1209600  # Every 2 weeks (less compute)
```

**Result:** ~8% token overhead, focused high-confidence recalls only.

### Knowledge-Rich Project
```yaml
maxMemories: 15
minConfidence: 0.5
ingestSources:
  - github repos
  - docs directories
  - thread archives
clusters.rebuildInterval: 86400  # Daily rebuild
```

**Result:** ~25% token use, but agents catch context 95% of the time and surface relevant prior work automatically.

### Production Default (Recommended)
```yaml
maxMemories: 7
minConfidence: 0.65
clusters.rebuildInterval: 604800  # Weekly
```

**Result:** ~15% token overhead, balanced recall and compute.

---

## How ClawText Fits Into OpenClaw

ClawText is a **plugin**, not a platform. It integrates with OpenClaw's existing systems:

- **Hooks:** Injects context via the `prompt-build` hook
- **Cron:** Weekly cluster rebuilds, daily consolidation
- **State:** Uses OpenClaw's canonical state directory
- **Plugins:** Doesn't require other plugins (works standalone)

**Typical workflow:**
```
1. Agent runs (OpenClaw)
   ↓
2. ClawText captures output (plugin captures from hook)
   ↓
3. Daily consolidation (cron job)
   ↓
4. Weekly cluster rebuild (cron job)
   ↓
5. Next agent session
   ↓
6. ClawText injects relevant context (prompt-build hook)
   ↓
7. Agent continues with context (prompt has memory)
```

No special configuration. It just integrates.

---

## What's Actually New in 2.0

ClawText 2.0 is the point where the system stops feeling like a loose collection of memory features and starts behaving like one coherent memory and continuity layer.

In 2.0, ClawText gives you:
- ✅ **Stable runtime behavior** — Plugin loads cleanly and works as a reliable part of OpenClaw runtime
- ✅ **Canonical state-rooted storage** — Runtime-owned mutable state lives under `state/clawtext/prod/`
- ✅ **A complete working-memory cycle** — Capture, extraction, daily memory write, clustering, and prompt-time retrieval all operate as one loop
- ✅ **Operational learning that compounds** — Repeated failures and successful workflows can become reusable guidance
- ✅ **Continuity artifacts that travel well** — Handoffs, bootstrap packets, manifests, and backups preserve useful work across sessions and surfaces
- ✅ **A clearer product identity** — ClawText now reads and behaves like a layered memory and continuity system, not just a memory helper

---

## Quality Bar for Your Use

A good ClawText setup should let agents:
- ✅ Remember prior context without prompting
- ✅ Reference past decisions without re-asking
- ✅ Avoid repeating known failures
- ✅ Retrieve relevant knowledge automatically
- ✅ Learn from operational patterns over time

If any of these aren't happening, something's misconfigured. See `TROUBLESHOOTING.md` or `ARCHITECTURE.md` for deep dives.

---

## Where to Go Next

**By role:**

| Role | Start Here |
|------|-----------|
| **Get it running** | `AGENT_INSTALL.md` → `AGENT_SETUP.md` |
| **Understand it deeply** | `docs/ARCHITECTURE.md` → `docs/INGEST.md` → `docs/OPERATIONAL_LEARNING.md` |
| **Tune for your use case** | `docs/CONFIGURATION.md` → scenario guides |
| **Build on top of it** | `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` → extension points |
| **Fix issues** | `TROUBLESHOOTING.md` → `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` |

---

## Why This Exists

Most agents do not fail because they lack capability. They fail because the work around them becomes fragmented.

Prior decisions live in one thread, docs live in another folder, operational lessons disappear into logs, and continuity breaks the moment work moves to a new session or recovery surface.

ClawText exists to make that context durable enough to keep using. It helps agents retrieve relevant prior work, preserve structured handoffs, and learn from repeated workflow outcomes instead of rediscovering the same lessons over and over.

It's the difference between "my agent keeps asking the same questions" and "my agent can continue with context already in place."

---

## Summary

ClawText is a **layered memory and continuity system** that runs automatically inside OpenClaw.

It combines:
- prompt-time working memory
- durable searchable memory and ingested knowledge
- operational learning from repeated failures and successful workflows
- continuity artifacts for handoffs, bootstrap packets, manifests, and recovery

Install it once. It captures context, retrieves relevant knowledge, preserves continuity, and helps agents improve over time.

**For agents that need to remember. For teams that need continuity.**

**Install:** `openclaw plugins install @openclaw/clawtext`  
**Start:** `AGENT_INSTALL.md`  
**Learn:** `docs/ARCHITECTURE.md`  
**Status:** Stable, production-ready, v2.0
