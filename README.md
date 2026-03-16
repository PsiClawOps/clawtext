# ClawText

**Durable memory and continuity for OpenClaw agents — so your work continues where it left off instead of starting over.**

---

[![npm](https://img.shields.io/npm/v/@openclaw/clawtext?label=%40openclaw%2Fclawtext&color=blue)](https://www.npmjs.com/package/@openclaw/clawtext)
[![version](https://img.shields.io/badge/version-1.5.0-informational)](#install)
[![OpenClaw Plugin](https://img.shields.io/badge/openclaw-plugin-blueviolet)](#install)
[![Lanes](https://img.shields.io/badge/lanes-3-green)](#architecture)
[![Status](https://img.shields.io/badge/status-production-brightgreen)](#)

🧠 **Working memory** &nbsp;·&nbsp; 📦 **Durable artifacts** &nbsp;·&nbsp; 🔁 **Continuity across sessions** &nbsp;·&nbsp; ⚙️ **Operational learning** &nbsp;·&nbsp; 🔍 **Hybrid retrieval**

---

## What ClawText does

ClawText is a layered memory and continuity system for OpenClaw agents.

It captures what matters from active work, retrieves it automatically when relevant, and packages context so agents continue where they left off — across sessions, threads, and surfaces — without manual re-explanation.

---

## How LLM agents lose context

Every LLM conversation is assembled at runtime. At the moment a prompt is built, the model sees:

1. **The system prompt** — who the agent is, how it should behave
2. **The conversation history** — what was said in this session
3. **Nothing else** — prior sessions, prior decisions, past failures, and resolved problems don't exist

Ask an agent "what was Caesar's greatest military victory?" in a fresh session — it answers from training. Ask it "what did we decide about the retry logic last week?" — it has no idea. The session boundary is a hard reset. Every switch feels like day one.

This is the fundamental problem ClawText solves.

---

## How OpenClaw addresses context today

OpenClaw ships with a structured context guidance system out of the box:

| File | Purpose |
|---|---|
| `SOUL.md` | Who the agent is — identity, principles, voice |
| `USER.md` | Who the user is — preferences, working style, commitments |
| `AGENT.md` | Project-level instructions — role definition, task focus |
| `MEMORY.md` | Hand-curated long-term memory — decisions, key facts, patterns |

These files get injected into every session. They're powerful, but they're **manual and static** — someone has to write them, someone has to keep them current, and they don't grow or improve on their own as the agent does real work.

OpenClaw's default memory system is a starting point. ClawText is what turns it into a living, operational layer.

---

## What ClawText adds

ClawText extends the OpenClaw memory model with three things that don't exist in the default system:

**Automatic capture** — context from real sessions is extracted, scored, and stored continuously. No manual `MEMORY.md` edits required.

**Semantic + hybrid retrieval** — at prompt time, ClawText searches across all prior context using BM25 + semantic hybrid search and injects the most relevant results into the working prompt. The right context surfaces automatically.

**Operational learning** — repeated failures, successful patterns, and workflow insights accumulate over time. Agents inherit organizational wisdom automatically, and humans review and promote the high-value patterns.

The `MEMORY.md` hand-curation workflow still works. ClawText builds on top of it — adding automatic capture, retrieval, and learning without removing what was already there.

---

## Design philosophy

> Automatic where it makes sense. Agent-led with user review where it doesn't. CLI available throughout.

ClawText never silently promotes high-stakes patterns to permanent memory without human review. Capture and retrieval are fully automatic. Promotion of operational learning and critical context is always reviewable. Everything is inspectable via CLI.

This design is non-negotiable and guides every feature decision.

---

## Architecture

ClawText is built on three lanes:

### Lane 1 — Working Memory
**Automatic capture → extraction → retrieval → prompt injection**

Continuous extraction from live sessions. Daily memory files. Nightly cluster rebuilds. Hybrid BM25 + semantic retrieval injected at every prompt build. Prior decisions, patterns, and work context surface without manual intervention.

### Lane 2 — Ingest
**External sources → structured memory**

Bring in repos, docs, threads, URLs, exported JSON, and forum posts. Everything becomes queryable context alongside session-captured memory.

### Lane 3 — Operational Learning
**Failures and patterns → reusable wisdom**

Tool failures, recovery paths, and successful workflows get captured automatically. A review queue lets agents propose promotions. User approves. Promoted patterns become retrievable operational guidance — permanently available to future sessions.

---

## Capabilities in depth

### Working memory pipeline
- Extraction cron runs every 20 minutes, pulling high-signal context from active sessions
- Nightly cluster rebuild indexes everything into semantic + BM25 search
- Every prompt automatically receives token-budgeted injection of the most relevant prior context
- Session handoff artifacts package active work for clean transfer to another session, surface, or agent

### Ingest
- Source types: repos, markdown docs, URLs, JSON exports, Discord thread transcripts
- Ingested content enters the same retrieval pipeline as session-captured memory
- CLI: `openclaw run clawtext --ingest` with source flag

### Operational learning
- Automatic capture: tool failures, retries, recovered workflows
- Review queue accumulates candidates with recurrence scoring
- Agent proposes promotions; user approves; promoted patterns persist
- Future agents inherit approved patterns automatically
- CLI: `openclaw run clawtext --operational` for queue review

### Memory layers

| Layer | What it holds | Speed | Durability |
|---|---|---|---|
| **L1 Hot cache** | Recent high-confidence context, active project state | Instant | Ephemeral |
| **L2 Curated memory** | Promoted decisions, protocols, preferences, project summaries | Fast | Permanent |
| **L3 Searchable archive** | Daily notes, ingested docs, cold history | Indexed | Permanent |
| **L4 Intake / staging** | Raw captures awaiting scoring, review queue | — | Transient |

---

## Comparison

| Capability | OpenClaw default | ClawText | qmd | mem0 |
|---|---|---|---|---|
| Manual curated memory | ✅ MEMORY.md | ✅ builds on it | ❌ | ❌ |
| Automatic session capture | ❌ | ✅ | ❌ | ✅ |
| Hybrid BM25 + semantic retrieval | ❌ | ✅ | ✅ | ✅ |
| Prompt-time auto-injection | ❌ | ✅ | ❌ | ✅ |
| Operational learning lane | ❌ | ✅ | ❌ | ❌ |
| Human review before promotion | n/a | ✅ | ❌ | ❌ |
| Structured session handoffs | ❌ | ✅ | ❌ | ❌ |
| External ingest (docs/repos/URLs) | ❌ | ✅ | ✅ | ⚠️ partial |
| File-first, auditable state | ✅ | ✅ | ⚠️ | ❌ |
| OpenClaw-native plugin | ✅ | ✅ | ❌ | ❌ |

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

Expected output includes:
- `@openclaw/clawtext` in plugins list
- `before_prompt_build` hook registered
- extraction cron active (every 20 minutes)
- cluster rebuild cron active (nightly 2am UTC)

ClawText activates automatically from first run. No additional configuration required to start capturing context.

---

## Tuning and performance

### What runs automatically
- **Extraction** (every 20 min) — high-signal context captured from session activity
- **Cluster rebuild** (nightly) — full semantic index rebuilt for retrieval quality
- **RAG injection** (every prompt) — token-budgeted context injection, no prompt bloat
- **Failure capture** (on tool error) — operational learning candidates queued automatically

### What is agent-led with your review
- **Operational learning promotion** — agent proposes, you approve before patterns become permanent
- **Memory curation review** — agent surfaces candidates; `MEMORY.md` stays curated, not bloated
- **Ingest operations** — you or an agent directs what external sources to bring in
- **Tuning adjustments** — admission confidence and score thresholds are configurable

### Key tuning knobs

| Setting | Default | What it controls |
|---|---|---|
| `admissionConfidence` | `0.60` | Minimum confidence to admit a capture to L2 |
| `admissionScore` | `0.80` | Minimum score for hot cache promotion |
| Extraction cron | Every 20 min | How frequently session context is extracted |
| Cluster rebuild | Nightly 2am UTC | How often the semantic index is rebuilt |

### Health checks
```bash
npm run operational:retrieval:health
openclaw run clawtext --operational:status
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
