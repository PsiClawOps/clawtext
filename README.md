# ClawText

**Durable memory and continuity for OpenClaw agents — so your work continues where it left off instead of starting over.**

---

[![npm](https://img.shields.io/npm/v/@openclaw/clawtext?label=%40openclaw%2Fclawtext&color=blue)](https://www.npmjs.com/package/@openclaw/clawtext)
[![version](https://img.shields.io/badge/version-1.5.0-informational)](#install)
[![OpenClaw Plugin](https://img.shields.io/badge/openclaw-plugin-blueviolet)](#install)
[![Lanes](https://img.shields.io/badge/lanes-3-green)](#architecture--capabilities)
[![Status](https://img.shields.io/badge/status-production-brightgreen)](#)

🧠 **Working memory** &nbsp;·&nbsp; 📦 **Durable artifacts** &nbsp;·&nbsp; 🔁 **Continuity across sessions** &nbsp;·&nbsp; ⚙️ **Operational learning** &nbsp;·&nbsp; 🔍 **Hybrid retrieval**

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

Ask an agent "what was Caesar's greatest military victory?" in a fresh session — it answers from training data. Ask it "what did we decide about the retry logic last week?" — the session boundary erased it. That third slot — prior context — is empty by default. Filling it is what separates an agent that continues from one that starts over.

---

## How OpenClaw addresses context today

OpenClaw directly addresses the first slot through a structured set of context guidance files injected at session start:

| File | What it fills in the prompt | How it's maintained |
|---|---|---|
| `SOUL.md` | Agent identity, voice, principles | Manually — rarely changes |
| `USER.md` | User preferences, working style, commitments | Manually — updated occasionally |
| `AGENT.md` | Task focus, project-level instructions | Manually — per project |
| `MEMORY.md` | Key decisions, facts, curated patterns | Manually — as needed |

This is meaningful. The Caesar question gets a consistent, identity-aware answer every session. A well-maintained `MEMORY.md` means the retry logic decision can be there — if someone remembered to write it down.

The system is only as good as its last manual update. Prior session decisions don't surface unless someone captured them. Nothing grows or improves on its own.

---

## What ClawText adds

That retry logic question — ClawText answers it without `MEMORY.md` ever being touched. The decision was captured automatically when it was made, scored, indexed, and stored. At prompt time, ClawText queries across everything and injects the most relevant results.

| Prompt slot | Without ClawText | With ClawText |
|---|---|---|
| **System prompt** | OpenClaw config files (manual) | Same, plus auto-enriched operational guidance |
| **Conversation history** | Current session only | Current session only |
| **Prior context** | `MEMORY.md` if manually updated | ✅ auto-retrieved from all prior sessions, ingested docs, and promoted patterns |

ClawText extends the OpenClaw memory model with three capabilities that don't exist in the default system:

**Automatic capture** — context from real sessions is extracted, scored, and stored continuously. The agent earns memory without you maintaining it.

**Semantic + hybrid retrieval** — at prompt time, ClawText searches all prior context using BM25 + semantic hybrid search and injects the most relevant results. The right context surfaces automatically, every session.

**Operational learning** — repeated failures, successful patterns, and workflow insights accumulate over time. Agents inherit organizational wisdom automatically. Humans review and approve before anything becomes permanent.

The `MEMORY.md` hand-curation workflow still works. ClawText builds on top of it — without replacing it.

---

## Design philosophy

> Automatic where it makes sense. Agent-led with user review where it doesn't. CLI available throughout.

| Behavior | Mode | Implementation |
|---|---|---|
| Session context capture | 🤖 Automatic | Extraction cron every 20 min — no config, no intervention required |
| Semantic index rebuild | 🤖 Automatic | Nightly at 2am UTC — full BM25 + semantic reindex |
| Prior context injection | 🤖 Automatic | Every prompt, token-budgeted — no bloat |
| Failure + pattern capture | 🤖 Automatic | On tool error — queued to operational learning lane |
| External source ingest | 👤 Agent-led | You or an agent directs sources; CLI executes |
| Memory promotion | 👤 Agent-led, user approves | Agent proposes candidates; nothing promotes silently |
| `MEMORY.md` curation | 👤 Agent-led, user approves | Agent surfaces candidates; human approves changes |
| Retrieval health check | 🖥️ CLI | `npm run operational:retrieval:health` |
| Operational queue review | 🖥️ CLI | `openclaw run clawtext --operational` |
| Ingest control | 🖥️ CLI | `openclaw run clawtext --ingest` |

Nothing promotes to permanent memory without human approval. Everything is inspectable. This is non-negotiable and guides every feature decision.

---

## Architecture & Capabilities

ClawText is built on three lanes. Each lane owns a distinct part of the memory lifecycle — capture, retrieval, and learning are separated by design so each can be tuned, inspected, and operated independently.

### Lane 1 — Working Memory
**capture → extract → index → inject**

Every 20 minutes, the extraction cron pulls high-signal context from active sessions and stages it for indexing. Nightly, a full cluster rebuild reindexes everything using BM25 + semantic hybrid search. At every prompt build, the most relevant prior context is injected automatically — token-budgeted, no bloat.

Structured handoff artifacts package active work so it can continue cleanly in another session, on another surface, or with another agent. Session context travels with the work.

### Lane 2 — Ingest
**external sources → structured, searchable memory**

Repos, markdown docs, URLs, JSON exports, and Discord thread transcripts can all be brought into the same retrieval pipeline as session-captured memory. Ingested content is indexed and becomes queryable alongside everything else — no separate lookup, no silos.

### Lane 3 — Operational Learning
**failures and patterns → reusable organizational wisdom**

Tool failures, recovery workflows, and successful operational patterns are captured automatically on error. A review queue accumulates candidates with recurrence scoring — one-time failures don't surface, repeated patterns do. The agent proposes promotions; you approve; promoted patterns persist as permanent retrievable guidance for all future sessions.

Teams stop re-learning the same lessons.

### Memory layers

| Layer | What it holds | Latency | Durability |
|---|---|---|---|
| **L1 — Hot cache** | Recent high-confidence context, active project state | Instant | Rebuilt as needed |
| **L2 — Curated memory** | Promoted decisions, protocols, preferences, project summaries | Fast | Permanent |
| **L3 — Searchable archive** | Daily notes, ingested docs, full session history | Indexed | Permanent |
| **L4 — Intake / staging** | Raw captures, review queue, scoring candidates | — | Transient |

---

## Comparison

| Capability | OpenClaw default | ClawText | MemGPT | Zep | mem0 |
|---|---|---|---|---|---|
| Manual curated memory | ✅ MEMORY.md | ✅ builds on it | ❌ | ❌ | ❌ |
| Automatic session capture | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hybrid BM25 + semantic retrieval | ❌ | ✅ | ⚠️ semantic only | ✅ | ✅ |
| Prompt-time auto-injection | ❌ | ✅ | ✅ | ⚠️ app-controlled | ✅ |
| Operational learning lane | ❌ | ✅ | ❌ | ❌ | ❌ |
| Human review before promotion | n/a | ✅ | ❌ | ❌ | ❌ |
| Structured session handoffs | ❌ | ✅ | ❌ | ❌ | ❌ |
| External ingest (docs/repos/URLs) | ❌ | ✅ | ❌ | ⚠️ partial | ⚠️ partial |
| File-first, auditable state | ✅ | ✅ | ❌ | ❌ | ❌ |
| OpenClaw-native plugin | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Install

### Agent-assisted install

Paste this into your agent:

```
Install and configure the ClawText plugin for OpenClaw.
Run: openclaw plugins install @openclaw/clawtext
Then verify: openclaw plugins list, openclaw hooks list, openclaw cron list
Confirm the extraction cron and before_prompt_build hook are both active.
If anything is missing, fix it before reporting done.
```

### Manual install

```bash
# Install
openclaw plugins install @openclaw/clawtext

# Verify
openclaw plugins list
openclaw hooks list
openclaw cron list
```

Expected output:
- `@openclaw/clawtext` in plugins list
- `before_prompt_build` hook registered
- extraction cron active (every 20 minutes)
- cluster rebuild cron active (nightly 2am UTC)

ClawText activates automatically from first run. No additional configuration required to start capturing context.

---

## Tuning

Every ClawText behavior ties to a specific knob. Here's the full map — what it controls, and when to move it:

| Knob | Default | Controls | Raise when | Lower when |
|---|---|---|---|---|
| `admissionConfidence` | `0.60` | Minimum confidence to promote a capture into L2 curated memory | L2 has too much noise | Useful context is being filtered out |
| `admissionScore` | `0.80` | Minimum score for L1 hot cache admission | Hot cache is bloated or slow | Relevant context is missing from prompts |
| Extraction cron interval | Every 20 min | How often session context is extracted and staged | Stable, low-activity sessions | High-volume sessions where recent context isn't arriving fast enough |
| Cluster rebuild schedule | Nightly 2am UTC | How often the full BM25 + semantic index is rebuilt | Memory is stable and low-churn | Index feels stale mid-session |

### Operational learning threshold

The operational learning lane promotes based on **recurrence** — a pattern that appears once doesn't surface for review. Patterns that repeat accumulate score until they cross the promotion threshold. This prevents one-off noise from ever reaching permanent memory.

### Health and queue status

```bash
npm run operational:retrieval:health       # retrieval pipeline status + index freshness
openclaw run clawtext --operational:status  # operational learning queue summary
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
