# ClawText — Comprehensive Memory Platform for OpenClaw

**Version:** 1.4.0 | **Status:** Production | **Type:** OpenClaw Skill/Plugin

> A complete knowledge lifecycle system — capturing, ingesting, retrieving, curating, and actively learning from patterns to make your agents more capable and resilient over time.

---

## How Memory Works in Agent Systems

### The Problem

Every time an LLM processes a request, it builds a prompt from three layers:

1. **System instructions** — Core rules and identity (SOUL.md, AGENTS.md, USER.md in OpenClaw)
2. **Context** — Background information to inform the response
3. **Current request** — What you're asking right now

Without persistent memory, the context layer is empty. Every session starts from zero:

```
Session 1:
[System] + [CONTEXT: EMPTY] + "Where was Caesar's greatest military victory?"
→ Response: "Battle of Alesia in 52 BC"

Session 2 (new conversation):
[System] + [CONTEXT: EMPTY] + "Who was that guy he defeated in that battle you told me about yesterday?"
→ Response: "What battle? I don't have any context from our previous conversation."

With a memory system:
[System] + [CONTEXT: Battle of Alesia, Caesar's military history] + "Who was that guy he defeated?"
→ Response: "Vercingetorix, the Gallic chieftain. That victory at Alesia was decisive because..."
```

Memory systems fill that context layer with information that persists across sessions. The agent remembers previous conversations, decisions, and can build on past work rather than relearning the same things.

### OpenClaw's Built-In Memory

OpenClaw agents already have basic memory through `MEMORY.md` — a static file for recording decisions and facts. It works for small projects. It doesn't scale. It requires manual maintenance and can't grow beyond a few hundred entries.

**ClawText doesn't replace `MEMORY.md`; it complements it.** MEMORY.md stays high-signal and hand-curated. ClawText handles the dynamic, scalable parts: conversational captures, bulk imports, tiered retrieval, automatic maintenance, and learned patterns from failures.

---

## What Is ClawText?

ClawText is a knowledge lifecycle system with three integrated lanes:

| Lane | What It Does |
|------|-------------|
| **Working Memory** | Captures conversation context automatically. Tiered retrieval injects the right memories at prompt time. |
| **Knowledge Ingest** | Bulk-loads repos, docs, Discord forums/threads, exports, and other structured knowledge sources. Queryable on-demand. |
| **Operational Learning** | Captures tool failures and recurring errors. Reviews patterns with agents. Promotes stable lessons into durable guidance. |

---

## What's New in v1.4.0

### Automatic Memory Pipeline

ClawText now runs a three-stage pipeline automatically:

1. **Extraction (every 20 min)** — Messages captured to `memory/extract-buffer.jsonl`, then extracted facts/decisions/learnings written to `memory/YYYY-MM-DD.md` using LLM
2. **Clustering (nightly)** — Daily 2am UTC cron rebuilds semantic clusters from daily memories, validates RAG quality, notifies if confidence < 70%
3. **Injection (every prompt)** — `before_prompt_build` hook injects top 5 relevant memories (by BM25 + semantic similarity) automatically — zero latency (~1ms), token-budgeted, confidence-filtered

**Result:** You get context-aware responses without manual memory searches. All memories are discoverable via `memory_search` as well.

### Bundled Ingest Engine

Knowledge ingest engine is now fully bundled into ClawText (previously separate `clawtext-ingest` package). Supports Discord, repos, docs, JSON, and more — all in one install.

### State Root Adoption

Runtime-generated state now lives under `~/.openclaw/workspace/state/clawtext/prod/`:
- Cluster indices
- Evaluation metrics
- Extraction checkpoints

This keeps the repo clean and separates sources (git-tracked) from runtime state (not git-tracked).

---

## Three Lanes in Depth

### Lane 1: Working Memory

Captures from conversations and stores them in a tiered system. Memory doesn't just sit there — the system actively retrieves and injects the most relevant items at prompt time.

```
Conversation captures
       ↓
Conversational → Raw staging buffer (L4)
       ↓ review/promotion
Gets validated, ranked, deduped
       ↓
Full history searchable (L3)
       ↓ hot-admitted by relevance score
Curated, indexed memories (L2)
       ↓ selected, injected into prompt
Fast retrieval (~1ms) (L1)
```

**Key properties:**
- **BM25 scoring** — term frequency + confidence weighting + project-aware ranking
- **Semantic clustering** — memories grouped by topic, not just timestamp
- **Deduplication** — SHA1 hashing prevents re-storing duplicate knowledge
- **Token budgeting** — never exceeds your configured prompt context budget
- **Sticky retention** — high-value memories stay readily available longer

#### How Conversation Capture Works

ClawText automatically captures all conversation context (incoming and outgoing messages) without any action on your part.

**The pipeline (fully automatic):**

```
Every message event (in/out)
       ↓
[clawtext-extract hook] — appends to buffer (zero-LLM-cost)
       ↓ (asynchronous)
Memory/extract-buffer.jsonl (rolling 24h buffer)
       ↓ every 20 minutes
[Extraction cron] — LLM extracts facts, decisions, learnings
       ↓
Memory/YYYY-MM-DD.md (YAML-formatted daily memories)
       ↓ triggered if 3+ extracted
[Cluster rebuild] — semantic grouping, dedup, indexing
       ↓
Hot cache + RAG injection
       ↓
Injected automatically into next prompt (~1ms latency)
```

**Key points:**
- **Hook runs on every message** — captures both you and the agent
- **Zero cost at capture time** — just appends JSON lines to a buffer file
- **Automatic extraction every 20 minutes** — background cron processes the buffer
- **Session flush on `/new`** — if you start a fresh conversation, the current buffer drains immediately so nothing is lost
- **Daily rebuild at 2am UTC** — full cluster rebuild + quality validation
- **Format stored** — JSONL in buffer, then YAML in daily memory files:

```yaml
# Example extracted memory
- id: mem_20260310_001
  timestamp: 2026-03-10T09:02:00Z
  type: decision
  topic: ClawText
  content: "Decided to bundle clawtext-ingest into main package for unified installation story"
  confidence: 0.95
  project: openclaw
```

**You don't need to do anything.** Conversation capture is always on. The system handles extraction, clustering, deduplication, and injection automatically.

---

### Lane 2: Knowledge Ingest

Bulk-loads external knowledge sources into a searchable base kept separate from working memory. Why separate? Injecting a 500KB codebase into every prompt wastes tokens and confuses the LLM. Knowledge repos live separately — your agent queries them on-demand when it needs specifics.

**Supported sources:**
- GitHub repos and local code directories
- Markdown/documentation folders
- Discord forums, channels, and threads (with full conversation hierarchy)
- JSON exports from any source
- Raw text and structured data

```bash
# Ingest a Discord forum
npm run ingest:discord -- --forum-id 123456789 --mode batch --verbose

# Ingest a folder of docs
clawtext-ingest ingest-files --input="docs/**/*.md" --project=myproject

# Ingest a full codebase
clawtext-ingest ingest-files --input="src/**/*.{ts,js}" --project=myapp

# Check knowledge repo freshness
npm run knowledge:status
# → 🟢 fresh (<30d) | 🟡 aging (30-90d) | 🔴 stale (>90d)
```

Knowledge repos are automatically tracked for staleness. The system alerts you (and agents) when imports need refreshing.

---

### Lane 3: Operational Learning

The system learns from its own operational history. When tools fail or commands error, the system captures it. If the same error recurs, it becomes a pattern. Agents review the pattern, decide if it's useful, and promote stable lessons into durable guidance.

**Lifecycle:**

```
Tool/command fails or hook fires
          ↓
    [Capture: raw]     ← automatic, no action needed
          ↓ recurs N times
    [Candidate]        ← pattern promoted when it repeats
          ↓ agent-led review
    [Reviewed]
      ↙         ↘
  reject       approve
    ↓              ↓
 Archived    Ready for promotion
                   ↓
    Agent proposes target + user confirms
                   ↓
           ┌──────────────────┐
           │ Durable Guidance │
           │ SOUL.md          │
           │ AGENTS.md        │
           │ TOOLS.md         │
           │ project docs     │
           └──────────────────┘
```

**What gets captured:**
- Tool failures (automatic via hooks)
- Command/script failures
- Repeated error patterns
- Successful recovery patterns
- Optimization discoveries

**Why this matters:**
Most memory systems optimize for prompt efficiency — faster retrieval, better token use, cleaner context injection. Operational learning goes further: it makes the *system itself* more reliable. Recurring failures become reviewed guidance. Agent and system both learn from the same operational history. Over time, the system gets more robust and self-healing.

---

## Safety and Quality Model

ClawText is designed to avoid the two biggest memory failures:

1. **Storing things that should never be stored**
2. **Retrieving things that should never be injected**

Current controls include:

- **Hygiene patterns** for secrets and credentials
- **Raw-log detection** to keep pasted logs/tool dumps out of clusters
- **Anti-pattern walls** to block false associations
- **Token budgeting** for prompt injection
- **Approval-gated promotion** for durable operational guidance
- **File-based auditability** instead of hidden database state

See [SECURITY.md](./SECURITY.md) and [RISK.md](./RISK.md) for detailed threat models.

---

## Installation

### Agent-Assisted Setup

You can have agents handle most of the installation and configuration. Here's a sample prompt:

```
Please help me set up ClawText for this workspace.
I want to:
1. Add it to my openclaw.json (plugins.load.paths, plugins.allow, plugins.entries)
2. Install dependencies
3. Run a quick health check
4. Then we can ingest [my project docs / a Discord forum / a code repo]

Assume I'm comfortable with shell commands if needed, but prefer you to handle the details.
```

Most agents can read `AGENT_SETUP.md` from the repo and handle the setup automatically. Then they can guide you through initial ingest.

See [AGENT_SETUP.md](./AGENT_SETUP.md) for full agent-assisted workflow.

### Manual Installation

If you prefer to do it yourself:

#### Step 1: Clone and Install

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

#### Step 2: Activate

Add to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/workspace/skills/clawtext"]
    },
    "allow": ["clawtext"],
    "entries": {
      "clawtext": {
        "enabled": true,
        "memorySearch": {
          "sync": { "onSessionStart": true },
          "maxMemories": 5,
          "minConfidence": 0.70
        },
        "clusters": {
          "rebuildInterval": "0 2 * * *",
          "validationThreshold": 0.70
        }
      }
    }
  }
}
```

Restart your gateway:

```bash
openclaw gateway restart
```

#### Step 3: Verify

```bash
# Check plugin loaded
openclaw plugins list
# Expected: ClawText | clawtext | loaded

# Check gateway status
openclaw gateway status
# Expected: running + RPC probe ok

# Build clusters
npm run build-clusters.js --force

# Validate retrieval quality
npm run validate-rag.js

# Check operational learning status
npm run operational-cli.mjs status
```

---

## Architecture

```
~/.openclaw/workspace/skills/clawtext/   ← ONE install path
│
├── openclaw.plugin.json   ← plugin manifest
├── SKILL.md               ← skill definition
├── AGENT_INSTALL.md       ← agent-friendly activation guide
├── AGENT_SETUP.md         ← agent-assisted setup workflow
│
├── src/
│   ├── index.ts           ← plugin entry
│   ├── plugin.ts          ← OpenClaw plugin wiring
│   ├── rag.ts             ← retrieval engine (BM25, clustering)
│   ├── hot-cache.ts       ← L1 cache
│   ├── memory.ts          ← L2/L3 memory management
│   ├── ingest/            ← bundled ingest engine
│   │   ├── index.js       ← ClawTextIngest class
│   │   ├── agent-runner.js
│   │   └── adapters/
│   │       └── discord.js ← multi-source adapter
│   ├── operational.ts     ← operational memory store
│   ├── operational-capture.ts
│   ├── operational-aggregation.ts
│   ├── operational-retrieval.ts
│   ├── operational-review.ts
│   ├── operational-promotion.ts
│   └── operational-maintenance.ts
│
├── bin/
│   ├── ingest.js          ← clawtext-ingest CLI
│   └── discord.js         ← clawtext-ingest-discord CLI
│
├── scripts/               ← agent-owned backend commands
│   ├── operational-cli.mjs
│   ├── health-report.mjs
│   ├── review-digest.mjs
│   ├── ingest-all.mjs
│   ├── build-clusters.js
│   └── validate-rag.js
│
└── docs/
    ├── ARCHITECTURE.md
    ├── INGEST.md
    ├── OPERATIONAL_LEARNING.md
    └── ...
```

---

## Deployment

### Single-Node (Current, Recommended)

All agents share `~/.openclaw/workspace/memory/`. File-based, automatically synchronized. No coordination overhead needed.

**Covers 99% of real deployments.** One machine, many agents, shared memory.

### Multi-Node (Future)

Each Gateway would have isolated memory. If you scale to multiple Gateways, add a sync layer: shared filesystem, central DB, Git-based sync, or S3-compatible storage. This is not v1.4 scope.

---

## Tuning

ClawText works out of the box. If you want to tune:

### Hot Cache Admission

In `src/hot-cache.ts`:

```javascript
admissionConfidence: 0.60,  // Min confidence to enter cache (0.0–1.0)
admissionScore: 0.8,        // Min BM25 score to enter cache
maxItems: 300,              // Max items in cache
defaultTtlDays: 14,         // Days before memory expires
stickyTtlDays: 60,          // Days before high-confidence memory expires
```

**When to adjust:**
- Hit rate dropping → lower thresholds
- Cache filling with noise → raise thresholds

### Monitor

```bash
npm run health
# Reports: hit rate, cache size, staleness, review backlog, recommendations
```

Target hit rate: **>95%**

---

## Documentation

### For First-Time Users

- **[SKILL.md](./SKILL.md)** — Formal skill definition (runtime role, ownership model)
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Memory tiers, retrieval algorithms, performance tuning
- **[docs/HOT_CACHE.md](./docs/HOT_CACHE.md)** — How fast-path memory injection works

### For Operators & Agents

- **[AGENT_INSTALL.md](./AGENT_INSTALL.md)** — Quick activation guide
- **[AGENT_SETUP.md](./AGENT_SETUP.md)** — Agent-assisted setup workflow
- **[docs/INGEST.md](./docs/INGEST.md)** — Bulk ingest sources, multi-source setup, deduplication
- **[docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md)** — Operational lane design, capture policy, review/promotion
- **[docs/CURATION.md](./docs/CURATION.md)** — Promotion, archiving, deduplication pipeline
- **[SECURITY.md](./SECURITY.md)** — Threat model, controls, trust boundaries
- **[RISK.md](./RISK.md)** — Operational risk register and mitigations

### For Deep Dives

- **[docs/MULTI_AGENT.md](./docs/MULTI_AGENT.md)** — Shared/private memory, agent collaboration
- **[docs/MEMORY_SCHEMA.md](./docs/MEMORY_SCHEMA.md)** — YAML format, field reference, examples
- **[docs/ME-001_DURABILITY_CLASSIFIER.md](./docs/ME-001_DURABILITY_CLASSIFIER.md)** — How to score memory durability
- **[docs/ME-002_SCOPE_ISOLATION_HARDENING.md](./docs/ME-002_SCOPE_ISOLATION_HARDENING.md)** — Cross-project contamination prevention
- **[docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md](./docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md)** — Curation patterns and heuristics
- **[docs/ME-004_EVAL_HARNESS.md](./docs/ME-004_EVAL_HARNESS.md)** — Evaluation metrics and quality thresholds
- **[docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md](./docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md)** — Phased rollout strategy
- **[docs/ADOPTION_LOG_MEMORY_EVOLUTION.md](./docs/ADOPTION_LOG_MEMORY_EVOLUTION.md)** — Live adoption log with outcomes
- **[docs/TESTING.md](./docs/TESTING.md)** — Verify installation, run integration tests

### Companion Skills

- **[ClawBridge](https://github.com/ragesaq/clawbridge)** — Thread handoff and continuity transfer (separate repo)

---

## What ClawText Is & Isn't

### ✅ ClawText IS

- A practical, file-based memory system for multi-agent coordination
- Fully auditable (no hidden databases)
- Operationally maintainable (YAML configs, explicit pipelines)
- Safe by default (token budgeting, confidence thresholds, hygiene patterns)
- Deployable without external dependencies (no vector DB required)

### ❌ ClawText IS NOT

- A hidden long-context dump
- A vector-database-first architecture
- A replacement for human review on risky changes
- A license to ingest arbitrary untrusted content without controls
- Self-improving code (v1 focuses on guidance capture, not auto-rewrite)

---

## Version History

| Version | What Changed |
|---------|-------------|
| **1.4.0** | Bundled ingest engine (was separate package). Added operational learning lane: capture, review, promotion, maintenance. Automatic memory pipeline (extraction, clustering, injection). Three-lane knowledge lifecycle complete. |
| 1.3.0 | Hot cache optimization, BM25 scoring, plugin activation + allowlist story, SKILL.md / AGENT_INSTALL.md |
| 1.2.0 | Tiered memory (L1–L4), cluster rebuild, validate-rag tooling |
| 1.1.0 | Initial multi-source ingest, deduplication pipeline |
| 1.0.0 | Initial release — basic memory injection + retrieval |

---

## Repository

**https://github.com/ragesaq/clawtext**

## License

MIT

**Made for OpenClaw.** Designed to be the memory backbone for workspace-wide agent coordination, research, and operational learning.
