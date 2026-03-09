# ClawText — Memory for AI Agents

**Version:** 1.3.0 | **Status:** Production

---

## The Problem: Agents Without Memory Are Limited

Every time you talk to an AI agent, it processes your message in isolation. It doesn't know:
- What project you were working on yesterday
- What decisions you already made
- What mistakes to avoid
- Your preferences or style
- What other agents have learned

This works fine for one-off questions. But for agents that tackle real work—coding, debugging, managing projects, collaborating with other agents—this lack of continuity is crippling.

**The core issue:** Without memory, every agent interaction starts from zero. You're constantly re-explaining context. The agent can't build on past work. Knowledge is lost between sessions.

---

## How Agent Memory Works

Every time an agent processes a request, it builds a prompt from:
- **System instructions** — Core rules and identity
- **Context** — Conversation history, background information
- **Current request** — What the user is asking

Memory's job is to intelligently populate the "context" layer.

### OpenClaw's Approach

OpenClaw agents already use static system prompts to define who they are:
- **SOUL.md** — Personality and core values
- **AGENTS.md** — Role and capabilities
- **USER.md** — Who you're helping
- **MEMORY.md** — Long-term knowledge (currently static, limited)

These files work well for stable context. But they don't capture:
- **Decisions made during this project** — "We chose PostgreSQL because X"
- **Lessons from past sessions** — "That approach failed last time; here's why"
- **Current state** — "We're blocked on the Redis cache issue"
- **Other agents' work** — "Agent-B already fixed similar problem yesterday"

ClawText fills this gap.

### The Prompt Before Memory

```
[SOUL.md: Your personality/values]
[AGENTS.md: Your role]
[USER.md: Who you're helping]
[Recent conversation]
+ User request: "Fix the authentication bug"
     ↓
  [LLM]
     ↓
  Response: "What's your auth architecture?"
```

**Problem:** The LLM doesn't know past decisions or lessons. You re-explain context every session.

### The Prompt With ClawText

```
[SOUL.md: Your personality/values]
[AGENTS.md: Your role]
[USER.md: Who you're helping]
[Recent conversation]
[ClawText injected memories:
  - Decision: JWT with 24h expiry
  - Bug: Redis invalidation failing
  - Pattern: Async/await preferred]
+ User request: "Fix the authentication bug"
     ↓
  [LLM]
     ↓
  Response: "I see the Redis issue. Here's the fix..."
```

**Benefit:** Memory adds dynamic context that evolves with your project. Your static system prompts stay clean; memories handle the specific, changeable stuff.

### Why a Simple Memory System Isn't Enough

A basic "store everything" approach creates problems:

- **Speed** — Searching all old memories adds latency. Your agent gets slower over time.
- **Noise** — Irrelevant memories waste tokens and confuse the LLM.
- **Duplicates** — "Use async/await" gets stored 10 times. Which is current?
- **No ranking** — Old memories mix with important ones. System can't prioritize.
- **Unbounded growth** — Memory becomes an unmaintainable pile of entries.

### What ClawText Does Differently

ClawText is a **tiered memory system** that solves these problems:

| Tier | Purpose | Speed |
|------|---------|-------|
| **L1: Hot Cache** | Active project context, recent decisions, current blockers | <1ms |
| **L2: Curated** | Validated, deduplicated, ranked memories | ~10ms |
| **L3: Archive** | Historical context for deep searches | ~100ms |
| **L4: Staging** | Raw captures awaiting review; also entry point for bulk ingest | Write-only |

Your agent gets fast, relevant context. Memory stays maintainable. Your system prompts stay focused on who you are; ClawText handles what you've learned.

---

## Ingestion: Bulk Knowledge Loading

L4 (Staging) serves a dual purpose: it captures conversational memories *and* receives bulk ingests. ClawText's ingest system loads large information stores in bulk—repos, documentation, Discord exports, wikis—and routes them to **knowledge repositories** instead of agent memory.

**Why separate paths?**
- **Agent memory** (conversational) → Small, focused, always injected, fast
- **Knowledge repos** (ingested) → Large, queryable on-demand, versioned

This keeps agent prompts lean while giving agents access to deep knowledge when needed.

### Quick Examples

```bash
# Ingest a GitHub repo
npm run ingest -- https://github.com/myteam/myproject.git \
  --project myapp --type repo

# Ingest Discord thread export
npm run ingest -- threads-export-2026-03.json \
  --project myapp --cluster "decisions"

# Agent workflow: uses both automatically
User: "How does auth work?"
Agent: [Checks agent memory for decisions]
       [Queries knowledge repo for code examples]
       "We use JWT. Here's the flow..."
```

| | Agent Memory | Knowledge Repo |
|---|---|---|
| **Source** | Conversations | Bulk imports (repos, docs, exports) |
| **Size** | ~100 bytes–10 KB | ~100 KB–MB |
| **Query** | <1ms (always included) | ~50-200ms (on-demand) |
| **Maintenance** | Auto | Manual versioning |

---

ClawText is a **tiered memory system** designed specifically for agents. It ensures:

1. **Fast retrieval** — Recent, high-value memories are instantly available (no latency added to prompts)
2. **Relevance** — The system finds memories that actually matter to the current task
3. **Automatic maintenance** — Old or duplicate memories are archived; important ones are promoted
4. **Multi-agent collaboration** — Agents can share context and build on each other's work
5. **Scalability** — Memory grows without becoming unmaintainable

### The Four-Tier Architecture

| Tier | Purpose | Latency | Size |
|------|---------|---------|------|
| **L1: Hot Cache** | Immediate recall for active projects and recent decisions | <1ms | ~50-300 items |
| **L2: Curated** | Important context promoted from staging after validation | ~10ms | Indexed, searchable |
| **L3: Archive** | Historical context, less-accessed but still searchable | ~100ms | Full history |
| **L4: Staging** | Raw captures from conversations, awaiting curation | Write-only | Temporary buffer |

When your agent needs context, it queries L1 first (instant), then L2 if needed. Archive is there if you want deep searches.

---

## Key Features

### 🔥 Sub-Millisecond Retrieval
Recent memories live in a hot cache. Injecting context into prompts adds microseconds, not milliseconds.

### 🤖 Multi-Agent Memory
- **Shared** — All agents can access common decisions and architecture notes
- **Private** — Sensitive context stays isolated
- **Cross-agent** — One agent can leave context for another to pick up

### 🔄 Automatic Continuity
Agents remember which session they were in and can pick up mid-conversation. No more "Wait, who are you? What are we doing?"

### 💻 Programmable API
Add and search memories from code, CLI, or hooks:
```bash
npm run memory -- add "Decision: Use PostgreSQL for state"
npm run memory -- search "database" --project myapp
npm run memory -- inject "current_task"  # Get context for prompt injection
```

### 🏥 Self-Monitoring
The system watches itself and alerts you to problems:
```bash
npm run health
# → Reports: cache hit rate, staleness, review backlog, recommendations
```

---

## How It Fits Into Your Workflow

**Without ClawText:**
```
Agent session 1 → Learns something → Lost after session ends
Agent session 2 → Starts from zero → Relearns same lessons
```

**With ClawText:**
```
Agent session 1 → Learns something → Auto-captured and stored
Agent session 2 → Context injected into prompt → Builds on session 1
```

The memory system runs in the background. Your agents just get smarter over time.

---

## Quick Start

```bash
# Install
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build

# Test
npm test    # Should show: 15 clusters, 191 memories, hot cache ready
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — How memory tiers work, retrieval algorithms, performance tuning
- **[Multi-Agent](docs/MULTI_AGENT.md)** — Shared/private memory, agent collaboration, cross-agent context
- **[Curation](docs/CURATION.md)** — How memories are promoted, archived, deduplicated
- **[Testing](docs/TESTING.md)** — Verify your installation and run integration tests

## GitHub

https://github.com/ragesaq/clawtext
