# ClawText

**Durable memory and continuity for OpenClaw agents — so your work continues where it left off instead of starting over.**

---

<div align="center">

[![version](https://img.shields.io/badge/version-0.3.0-informational)](#install)
[![OpenClaw Plugin](https://img.shields.io/badge/openclaw-plugin-blueviolet)](#install)
[![Status](https://img.shields.io/badge/status-deploy--ready-yellow)](#)

</div>

🧠 **Working memory** &nbsp;·&nbsp; 📦 **Durable artifacts** &nbsp;·&nbsp; 🔁 **Continuity across sessions** &nbsp;·&nbsp; ⚙️ **Operational learning** &nbsp;·&nbsp; 🌉 **ClawBridge transfer** &nbsp;·&nbsp; 🔍 **Hybrid retrieval**

---

## What ClawText does

ClawText is a layered memory and continuity system for OpenClaw agents.

It captures what matters from active work, retrieves it automatically when relevant, and packages context so agents continue where they left off — across sessions, threads, and surfaces — without manual re-explanation.

---

## How LLM agents lose context

Every LLM conversation is assembled at runtime. The model doesn't "remember" anything — it sees only what's in the prompt at that moment:

| Prompt slot | Source | Persists across sessions? |
|---|---|---|
| **System prompt** | Agent config — identity, behavior, instructions | ✅ injected every session |
| **Conversation history** | Current session messages only | ❌ resets on every new session |
| **Prior context** | Past decisions, resolved problems, prior work | ❌ not populated by default |

This architecture means the quality of any answer depends entirely on what was put into the prompt — not on what the agent has experienced before. Two questions make this concrete:

| Question | What the LLM has | What happens |
|---|---|---|
| *"What was Caesar's greatest military victory?"* | Training data — general world knowledge | ✅ Answered correctly — no session context needed |
| *"What did we decide about the retry logic last week?"* | Nothing — prior session is gone | ❌ No answer — the decision existed only in that session |

The difference isn't intelligence. It's what was available in the prompt when the question was asked. General knowledge lives in training data and is always present. Specific decisions, earned context, and prior work don't — unless something deliberately puts them there.

---

## How OpenClaw addresses context today

Those two questions are a useful lens for understanding what OpenClaw's context system already handles well, and where the gap is.

OpenClaw injects a structured set of guidance files into every session:

| File | What it contributes | Caesar question | Retry logic question |
|---|---|---|---|
| `SOUL.md` | Agent identity, voice, principles | ✅ Consistent, identity-aware answer | ✅ Same voice and reasoning style |
| `USER.md` | User preferences, working style, commitments | ✅ Tailored to the user's context | ✅ Knows how the user thinks about decisions |
| `AGENT.md` | Task focus, project-level instructions | ✅ Relevant if historical context is defined | ⚠️ Only if someone wrote the decision here |
| `MEMORY.md` | Hand-curated decisions, facts, patterns | ✅ If someone added Caesar context manually | ⚠️ Only if someone remembered to write it down |

OpenClaw's guidance files are powerful for identity and preferences — they're always current because they're always maintained. But the retry logic decision? It lives in the prior session. If nobody manually captured it into `MEMORY.md`, that session boundary erased it.

The system is only as strong as its last manual update. That's a meaningful foundation — and it's also the starting point for taking things further.

---

## What ClawText adds

ClawText works alongside OpenClaw's existing context system — extending it rather than replacing it. The guidance files and `MEMORY.md` stay in place and keep doing what they do well. What ClawText adds is the layer that makes the system automatic, self-improving, and capable of moving with the work.

Automatic capture means the retry logic decision doesn't need to be manually filed — it's pulled from the session, scored, indexed, and made retrievable without any intervention. Hybrid retrieval means that at the next prompt, the most relevant prior decisions surface on their own — the agent already knows what was decided. Operational learning means the system accumulates wisdom from repeated failures and successful patterns over time, with human review before anything becomes permanent.

ClawBridge extends this further: when a session has been running for days and the thread needs to move, ClawBridge packages the full working state and transfers it intact to a new thread, session, or surface. Not a summary. Not a copy of messages. The actual working context — knowledge, decisions, and live answers as a cohesive unit — travels with the work.

| Question | OpenClaw default | With ClawText |
|---|---|---|
| *"What was Caesar's greatest military victory?"* | ✅ Answered from training | ✅ Same — plus historically consistent with prior agent context |
| *"What did we decide about the retry logic last week?"* | ❌ Session boundary erased it | ✅ Auto-retrieved from prior session capture |
| *"We're starting a new thread — what did we establish?"* | ❌ Context lost at thread boundary | ✅ ClawBridge transferred the working state intact |

The `MEMORY.md` workflow still works. ClawText builds on top of it — without replacing it.

---

## Design philosophy

> Automatic where it makes sense. Agent-led with user review where it doesn't. CLI available throughout.

Agent memory systems tend to fail in one of two ways: they either require constant manual effort to stay useful, or they operate as black boxes that silently change state in ways the operator can't see or control. ClawText is designed to avoid both. High-frequency, low-risk operations — capture, indexing, retrieval — run automatically so the system improves without friction. Anything that changes permanent state — promotions, curation decisions, what gets ingested — involves the agent and requires human approval. Everything is visible and reversible via CLI. This balance is what makes the system trustworthy enough to leave running.

Every ClawText behavior falls into one of three operating modes. This isn't convention — it's the design protocol that governs every feature decision:

| Behavior | Mode | What runs | What it means in practice |
|---|---|---|---|
| Session context capture | 🤖 **Automatic** | Extraction cron every 20 min | Every session generates memory without any action from you. Decisions, patterns, and resolved problems enter the pipeline immediately. |
| Semantic index rebuild | 🤖 **Automatic** | Nightly at 2am UTC | The full BM25 + semantic index rebuilds on a schedule. Retrieval quality improves as memory grows, without touching a config. |
| Prior context injection | 🤖 **Automatic** | Every prompt, token-budgeted | The most relevant prior context surfaces at prompt time. If you've done the work before, the agent knows. No commands, no prompting. |
| Failure + pattern capture | 🤖 **Automatic** | On every tool error | Tool failures, retries, and recovery paths are queued to the operational learning lane automatically. The system learns from mistakes without you logging them. |
| External source ingest | 👤 **Agent-led** | Request agent to ingest source material | You or an agent identifies repos, docs, threads, or URLs worth ingesting. The agent handles the operation; the result enters the same retrieval pipeline as everything else. |
| ClawBridge transfer | 👤 **Agent-led** | Request agent to bridge information somewhere else | When work needs to move to a new thread, session, or surface, ask the agent to bridge it. The agent packages and transfers the full working state — knowledge, decisions, and context intact. |
| Memory promotion | 👤 **Agent-led, you approve** | Review queue → approval | The agent identifies high-value candidates and proposes promotions. Nothing reaches permanent memory without your sign-off. The queue accumulates; you decide when to review. |
| `MEMORY.md` curation | 👤 **Agent-led, you approve** | Agent surfaces candidates | The agent proposes additions to `MEMORY.md` based on what it's seen. You approve. The curated fast-path stays curated, not bloated. |
| Retrieval health | 🖥️ **CLI** | `npm run operational:retrieval:health` | Inspect pipeline status, index freshness, and retrieval quality at any time. |
| Operational queue | 🖥️ **CLI** | `openclaw run clawtext --operational` | Review, score, and act on the operational learning queue manually when needed. |
| Ingest control | 🖥️ **CLI** | `openclaw run clawtext --ingest` | Direct ingest of specific sources outside of agent-led flows. |

Nothing promotes to permanent memory without human approval. Everything is inspectable. This is non-negotiable.

---

## Architecture & Capabilities

ClawText is built on four lanes. Each owns a distinct part of the memory and continuity lifecycle — designed to be tuned, inspected, and operated independently.

### Lane 1 — Working Memory
**capture → extract → index → inject**

Every 20 minutes, the extraction cron pulls high-signal context from active sessions and stages it for indexing. Nightly, a full cluster rebuild reindexes everything using BM25 + semantic hybrid search. At every prompt build, the most relevant prior context is injected automatically — token-budgeted, no bloat.

Prior decisions, resolved problems, and earned patterns surface in new sessions without any manual work.

### Lane 2 — Ingest
**external sources → structured, searchable memory**

Repos, markdown docs, URLs, JSON exports, and Discord thread transcripts enter the same retrieval pipeline as session-captured memory. Ingested content is indexed alongside everything else — no separate lookup, no silos. Anything worth knowing becomes queryable.

### Lane 3 — Operational Learning
**failures and patterns → reusable organizational wisdom**

Tool failures, recovery workflows, and successful operational patterns are captured automatically on error. A review queue accumulates candidates with recurrence scoring — one-time failures don't surface, repeated patterns do. The agent proposes promotions; you approve; promoted patterns persist as permanent retrievable guidance for all future sessions.

Teams stop re-learning the same lessons.

### Lane 4 — ClawBridge
**active working context → structured transfer → destination surfaces**

When work needs to move — a thread grows too long, a session needs to continue somewhere else, a new agent takes over — ClawBridge packages the full working state and transfers it intact.

This isn't a summary or a copy of messages. A ClawBridge packet carries the knowledge, decisions, and answers from an active session as a cohesive unit. Three artifacts are generated: a short human-readable summary, a full context packet for the next agent, and a bootstrap doc telling the next session exactly where to start and what not to re-derive.

ClawText remembers durable knowledge. ClawBridge moves active context. Both are required for true continuity.

### Lane 5 — Documentation / Library
**trusted docs → named collection → reference retrieval**

When you start using something new — like Proxmox, Tailscale, or internal platform docs — ClawText can ingest that documentation into a named library collection and make it retrievable as stable reference knowledge.

This lane is agent-led and manifest-backed: the operator asks for a library import, the agent creates or updates the collection manifest, imports the source set, builds the library index, and future reference-style questions prefer that trusted corpus over random general memory. Collections can also gain curated start-here entries and local overlays for environment-specific notes.

This keeps upstream truth, local operating reality, and operational lessons separate — while still making all three retrievable at the right time.

### Memory layers

| Layer | What it holds | Latency | Durability |
|---|---|---|---|
| **L1 — Hot cache** | Recent high-confidence context, active project state | Instant | Rebuilt as needed |
| **L2 — Curated memory** | Promoted decisions, protocols, preferences, project summaries | Fast | Permanent |
| **L3 — Searchable archive** | Daily notes, ingested docs, full session history | Indexed | Permanent |
| **L4 — Intake / staging** | Raw captures, review queue, scoring candidates | — | Transient |

### Lane 6 — Clawptimization *(v0.3.0)*
**score → compose → prune → audit**

The prompt compositor. Instead of dumping everything into context and hoping it fits, Clawptimization scores every piece of context, allocates it into named slots with percentage-based budgets, and actively prunes low-value content as the context window fills.

| Component | What it does |
|---|---|
| **PromptCompositor** | Orchestrator — allocate → fill → redistribute → prune → log |
| **SlotProviders** | Pluggable context sources (history tiers, memory, library, ClawBridge, cross-session, decision tree) |
| **BudgetManager** | % of context window per slot, auto-scales on model switch, overflow redistribution |
| **ContextPressureMonitor** | Rate-aware burn tracking — continuous aggressiveness, not threshold levels |
| **ActivePruner** | Per-turn evaluation — drops acks, compresses mid-history, preserves decisions |
| **ContentTypeClassifier** | Half-lives by content type: decisions=∞, specs=180d, discussion=60d, noise=0 |
| **ContradictionDetector** | Flags conflicting context before it reaches the prompt |
| **DecisionTreeMemory** | Operational guidance patterns extracted from journal history |
| **CrossSessionAwareness** | Journal-scanned multi-channel situational context |

Every decision is logged and auditable. Nothing is lost — pruned content is always recoverable from the journal. The agent never knows less, it just stores smarter.

---

## Where ClawText fits

| Capability | OpenClaw default | ClawText | MemGPT | Zep | mem0 |
|---|---|---|---|---|---|
| Manual curated memory | ✅ MEMORY.md | ✅ builds on it | ❌ | ❌ | ❌ |
| Automatic session capture | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hybrid BM25 + semantic retrieval | ❌ | ✅ | ⚠️ semantic only | ✅ | ✅ |
| Prompt-time auto-injection | ❌ | ✅ | ✅ | ⚠️ app-controlled | ✅ |
| Operational learning lane | ❌ | ✅ | ❌ | ❌ | ❌ |
| Human review before promotion | n/a | ✅ | ❌ | ❌ | ❌ |
| Active context transfer (ClawBridge) | ❌ | ✅ | ❌ | ❌ | ❌ |
| Structured session handoffs | ❌ | ✅ | ❌ | ❌ | ❌ |
| Intelligent prompt composition | ❌ | ✅ scored slots + budgets | ❌ | ❌ | ❌ |
| Active context pruning | ❌ | ✅ rate-aware | ⚠️ tiered eviction | ❌ | ❌ |
| Cross-session awareness | ❌ | ✅ journal-based | ❌ | ❌ | ❌ |
| External ingest (docs/repos/URLs) | ❌ | ✅ | ❌ | ⚠️ partial | ⚠️ partial |
| File-first, auditable state | ✅ | ✅ | ❌ | ❌ | ❌ |
| OpenClaw-native plugin | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Install

### Agent-assisted install

Paste this into your agent:

```
Install and configure the ClawText plugin for OpenClaw.
Run: openclaw plugins install github:PsiClawOps/clawtext
Then verify: openclaw plugins list, openclaw hooks list, openclaw cron list
Before finalizing, interview me about:
- whether deterministic ClawText maintenance should stay in OpenClaw cron or move to system cron/systemd timers
- whether extract-buffer should stay at 30m or tighten to 20m
- whether Discord history should use prefetch only, or prefetch + backfill + journal reindex
Confirm the extraction path, retrieval path, and Discord history plan before reporting done.
If anything is missing, fix it before reporting done.
```

### Manual install

```bash
# Install
openclaw plugins install github:PsiClawOps/clawtext

# Verify
openclaw plugins list
openclaw hooks list
openclaw cron list
```

Expected output:
- `clawtext` in plugins list
- `before_prompt_build` hook registered
- extraction cron active (every 20 minutes)
- cluster rebuild cron active (nightly 2am UTC)

ClawText activates automatically from first run. No additional configuration required to start capturing context.

---

## Tuning — automatic behaviors

These knobs govern the pipeline that runs without any intervention. Adjusting them changes how aggressively ClawText captures and promotes context.

| Knob | Default | Controls | Raise when | Lower when |
|---|---|---|---|---|
| `admissionConfidence` | `0.60` | Minimum confidence to admit a capture into L2 curated memory | L2 is noisy — low-quality captures are getting through | Good context is being dropped — relevant decisions aren't surfacing |
| `admissionScore` | `0.80` | Minimum score for L1 hot cache admission | Hot cache is bloated or retrieval feels slow | Prompt context feels thin — relevant recent work isn't appearing |
| Extraction cron interval | Every 20 min | How often session context is extracted and staged for indexing | Sessions are stable and low-volume | High-activity sessions where recent context needs to arrive faster |
| Cluster rebuild schedule | Nightly 2am UTC | How often the full BM25 + semantic index is rebuilt | Memory is stable — rebuilds feel unnecessary | Index feels stale; retrieval misses recent captures |

### Health check
```bash
npm run operational:retrieval:health    # pipeline status, index freshness, retrieval quality
```

---

## Tuning — agent-led and manual

These behaviors run on demand and involve judgment calls. The agent surfaces candidates and proposes actions; you make the call.

| Behavior | How to trigger | What to decide |
|---|---|---|
| **Operational learning review** | `openclaw run clawtext --operational` | Review queued candidates, approve or dismiss promotions |
| **Memory promotion** | Agent proposes during session | Approve or reject — nothing enters permanent memory without your sign-off |
| **`MEMORY.md` curation** | Agent surfaces additions | Approve new entries — keeps the curated fast-path signal-dense, not bloated |
| **Ingest** | `openclaw run clawtext --ingest` | Direct what external sources to bring in — repos, docs, threads, URLs |
| **ClawBridge transfer** | Agent-led or CLI | Decide when work needs to move and where it should land |

### Operational learning threshold

The operational learning lane promotes based on **recurrence**. A pattern that appears once stays in the queue. Patterns that repeat accumulate score. Only consistent, recurring patterns cross the promotion threshold — one-off noise never reaches permanent memory.

### Queue status
```bash
openclaw run clawtext --operational:status    # review queue summary, recurrence counts
```

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full system design and memory lane model
- [`docs/NORTHSTAR.md`](docs/NORTHSTAR.md) — product definition, principles, and strategic locks
- [`docs/MILESTONES.md`](docs/MILESTONES.md) — shipped value and evidence base
- [`docs/OPERATIONAL_LEARNING.md`](docs/OPERATIONAL_LEARNING.md) — operational learning lane implementation
- [`docs/INGEST.md`](docs/INGEST.md) — ingest sources, CLI, and configuration
- [`docs/HOT_CACHE.md`](docs/HOT_CACHE.md) — hot cache design and tuning
- [`docs/MEMORY_POLICY_TRIGGER_CONTRACT.md`](docs/MEMORY_POLICY_TRIGGER_CONTRACT.md) — when ClawText captures, retrieves, promotes, or asks
- [`docs/LIBRARY_LANE.md`](docs/LIBRARY_LANE.md) — post-2.0 design for curated project/library knowledge
- [`docs/LIBRARY_PROXMOX_9_1_COLLECTION_PLAN.md`](docs/LIBRARY_PROXMOX_9_1_COLLECTION_PLAN.md) — first external library collection plan using official Proxmox VE 9.1 docs
- [`docs/LIBRARY_LANE_INTEGRATION_SPEC.md`](docs/LIBRARY_LANE_INTEGRATION_SPEC.md) — technical integration plan for collections, overlays, indexing, and retrieval
- [`docs/LIBRARY_AGENT_IMPORT_WORKFLOW.md`](docs/LIBRARY_AGENT_IMPORT_WORKFLOW.md) — agent-led workflow for turning natural-language library import requests into structured collection ingest
- `npm run library:smoke` — quick validation that Library Lane outranks general memory for reference-style queries
