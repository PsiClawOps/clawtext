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

Without persistent memory, that context layer is empty. Every session starts from zero:

```
Session 1:
[System] + [Context] + [Request] → Response
         (empty!)

Session 2:
[System] + [Context] + [Request] → Response
         (empty again!)

Each session relearns the same lessons. Knowledge is lost between sessions.
```

Memory systems fill that context layer with information that persists across sessions. The agent can build on past work, remember decisions, apply lessons from previous errors.

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
Fast retrieval (<1ms) (L1)
```

The system learns which memories you use most. High-value items stay readily available. Less-used memories are still searchable but live deeper in the retrieval chain.

**Key properties:**
- **BM25 scoring** — term frequency + confidence weighting + project-aware ranking
- **Semantic clustering** — memories grouped by topic, not just timestamp
- **Deduplication** — SHA1 hashing prevents re-storing duplicate knowledge
- **Token budgeting** — never exceeds your configured prompt context budget
- **Sticky retention** — high-value memories stay readily available longer

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

## Ownership Model

ClawText is designed to be automatic where it's safe, agent-guided where orchestration helps, and controlled where human judgment matters.

| What | Owner | How |
|------|-------|-----|
| Capture hooks, memory injection, failure capture, maintenance runs | 🤖 Automatic | No action needed |
| Review packets, promotion proposals, ingest orchestration, maintenance scheduling | 🤝 Agent | Agent presents; you glance and decide |
| Approve/reject/defer candidates, approve durable promotions, approve recurring cadence | ✅ You | Your call |
| Raw CLI, cache tuning, direct memory edits | 🤝 Agent-assisted | Available if you want it; not required |

---

## Compared to Alternatives

| Feature | **ClawText 1.4** | mem0 | QMD | MEMORY.md only |
|---------|:----------------:|:----:|:---:|:--------------:|
| Multi-tier retrieval (4 tiers) | ✅ | ⚠️ basic | ✅ 3 tiers | ❌ |
| BM25 + semantic clustering | ✅ | ❌ | ✅ | ❌ |
| Sub-millisecond hot cache | ✅ | ⚠️ DB latency | ⚠️ DB latency | ❌ |
| Knowledge repo / bulk ingest | ✅ (repos, docs, forums, JSON, text) | ⚠️ basic | ✅ | ❌ |
| Multi-source ingest (Discord, repos, code, exports) | ✅ | ❌ | ❌ | ❌ |
| Auto deduplication | ✅ SHA1 | ⚠️ | ⚠️ | ❌ |
| Agent-assisted maintenance | ✅ | ⚠️ manual | ⚠️ manual | ❌ |
| No external services required | ✅ | ❌ API calls | ❌ vector service | ✅ |
| Built for OpenClaw | ✅ | ❌ | ❌ | ✅ |
| Operational learning lane | ✅ | ❌ | ❌ | ❌ |
| Failure capture + pattern review | ✅ | ❌ | ❌ | ❌ |
| Promotion to durable guidance | ✅ | ❌ | ❌ | ❌ |
| System self-healing over time | ✅ | ❌ | ❌ | ❌ |

---

## Quick Start

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

Most agents can read `AGENT_INSTALL.md` from the repo and handle the setup automatically. Then they can guide you through initial ingest.

### Manual Installation

If you prefer to do it yourself:

#### 1. Activate

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/workspace/skills/clawtext"]
    },
    "allow": ["clawtext"],
    "entries": {
      "clawtext": { "enabled": true }
    }
  }
}
```

Restart your gateway, then verify:

```bash
openclaw plugins list
# Expected: ClawText | clawtext | loaded

openclaw gateway status
# Expected: running + RPC probe ok
```

#### 2. Build

```bash
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

#### 3. Use

```bash
# Check system health
npm run health

# Ingest a Discord forum
npm run ingest:discord -- --forum-id YOUR_FORUM_ID --verbose

# Ingest files
clawtext-ingest ingest-files --input="docs/**/*.md" --project=myproject

# Check working memory
npm run memory -- search "auth"

# Check operational patterns
npm run operational:status
```

---

## Architecture

```
~/.openclaw/workspace/skills/clawtext/   ← ONE install path
│
├── openclaw.plugin.json   ← plugin manifest
├── SKILL.md               ← skill definition
├── AGENT_INSTALL.md       ← agent-friendly activation guide
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
│   └── ...
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

- **[SKILL.md](SKILL.md)** — Runtime role, ownership model, plugin/skill story
- **[AGENT_INSTALL.md](AGENT_INSTALL.md)** — Activation, allowlist, restart, verification
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Memory tiers, retrieval algorithms, performance tuning
- **[docs/INGEST.md](docs/INGEST.md)** — Bulk ingest sources, multi-source setup, deduplication
- **[docs/OPERATIONAL_LEARNING.md](docs/OPERATIONAL_LEARNING.md)** — Operational lane design, capture policy, review/promotion lifecycle
- **[docs/MULTI_AGENT.md](docs/MULTI_AGENT.md)** — Shared/private memory, agent collaboration
- **[docs/CURATION.md](docs/CURATION.md)** — Promotion, archiving, deduplication pipeline
- **[docs/TESTING.md](docs/TESTING.md)** — Verify installation, run integration tests

---

## GitHub

**https://github.com/ragesaq/clawtext**

---

## Version History

| Version | What Changed |
|---------|-------------|
| **1.4.0** | Bundled ingest engine (was separate package). Added operational learning lane: capture, review, promotion, maintenance. Three-lane knowledge lifecycle complete. |
| 1.3.0 | Hot cache optimization, BM25 scoring, plugin activation + allowlist story, SKILL.md / AGENT_INSTALL.md |
| 1.2.0 | Tiered memory (L1–L4), cluster rebuild, validate-rag tooling |
| 1.1.0 | Initial multi-source ingest, deduplication pipeline |
| 1.0.0 | Initial release — basic memory injection + retrieval |
