# ClawText - Comprehensive Memory Skill for OpenClaw Agents

**Type:** Skill | **Version:** 1.3.0 | **Status:** Production

OpenClaw agents have basic memory with MEMORY.md, but it doesn't scale—it requires manual maintenance and can't grow beyond a few hundred entries. **ClawText transforms that into a robust, tiered system** — automatically captured from conversations, intelligently curated for speed, continuously tuned. Memory that grows with your project.

---

## Why ClawText: Engineering & Technology

ClawText isn't just a basic memory cache. It's a production-grade system with sophisticated retrieval and maintenance:

### Retrieval & Search
- **BM25 scoring** — Term frequency, confidence weighting, project-aware ranking
- **Semantic clustering** — Memories grouped by topic, not just timestamp
- **Hybrid retrieval** — Hot cache (sub-1ms) + cluster search (indexed, scalable)
- **Deduplication** — SHA1-based content hashing prevents re-storing the same memory

### Tiered Architecture
- **L1 Hot Cache** — In-memory with configurable TTL and sticky retention (recent high-value items stay)
- **L2 Curated** — Validated, ranked memories ready for injection
- **L3 Archive** — Full historical searchability (for deep recalls)
- **L4 Staging** — Buffer for bulk ingest and conversational capture

### Automatic Maintenance
- **Auto-promotion** — Memories promoted from staging → curated → hot based on usage patterns
- **Staleness detection** — Knowledge repos flagged at 30/90 day thresholds
- **Deduplication pipeline** — Removes redundant entries, keeps canonical versions
- **Token budgeting** — Never exceeds configured prompt context budget

### Compared to Alternatives

| Feature | ClawText | mem0 | QMD | Standard LLM + MEMORY.md |
|---------|----------|------|-----|------------------------|
| **Multi-tier retrieval** | ✅ (4 tiers) | ⚠️ (basic) | ✅ (3 tiers) | ❌ |
| **BM25 + clustering** | ✅ | ❌ | ✅ | ❌ |
| **Knowledge repo support** | ✅ (bulk ingest, separate from agent memory) | ⚠️ (basic ingest) | ✅ | ❌ |
| **Agent-assisted maintenance** | ✅ (staleness alerts, health checks) | ⚠️ (manual) | ⚠️ (manual) | ❌ |
| **Hot cache optimization** | ✅ (<1ms retrieval) | ⚠️ (vector DB latency) | ⚠️ (DB latency) | ❌ |
| **Built for OpenClaw** | ✅ | ❌ | ❌ | ✅ (but limited) |
| **No external dependencies** | ✅ | ❌ (API calls) | ❌ (vector service) | ✅ |

---

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

### The Architecture: Four Tiers

A simple "store everything" approach creates problems:
- **Speed** — Searching all old memories adds latency
- **Noise** — Irrelevant memories waste tokens
- **Duplicates** — The same decision stored multiple times
- **No ranking** — Old memories mix with important ones
- **Unbounded growth** — Memory becomes unmaintainable

ClawText solves this with a **tiered architecture**:

| Tier | Purpose | Latency | Size |
|------|---------|---------|------|
| **L1: Hot Cache** | Active project context, recent decisions, current blockers | <1ms | ~50-300 items |
| **L2: Curated** | Validated, deduplicated, ranked memories | ~10ms | Indexed, searchable |
| **L3: Archive** | Historical context for deep searches | ~100ms | Full history |
| **L4: Staging** | Raw captures awaiting review; also buffer for bulk ingest | Write-only | Temporary |

Your agent queries L1 first (instant), then L2 if needed. Archive is there for deep searches. L4 feeds both conversational capture and bulk ingestion.

---

## Two Memory Paths: Conversational vs. Bulk

ClawText handles two distinct types of knowledge, each optimized for its use case.

### Agent Memory (Conversational)
Captures from your ongoing conversations. Automatically promoted through the tiers. Injected into every prompt.

**Examples:** Decisions, lessons learned, project state, current blockers

### Knowledge Repositories (Bulk Ingest)
Large information sources loaded in bulk. Organized by project. Queryable on-demand (not in every prompt).

**Examples:** Codebases, documentation, Discord thread exports, wikis, design docs

### Why Separate?

Injecting a 500KB codebase into every prompt wastes tokens and confuses the LLM. Instead, knowledge repos live separately:

```bash
# Ingest a GitHub repo into the knowledge base
npm run ingest -- https://github.com/myteam/myproject.git \
  --project myapp --type repo

# Agent workflow
User: "How does auth work?"
Agent: [Checks agent memory for decisions] (fast, <1ms)
       [Queries knowledge repo for code examples] (on-demand, ~100ms)
       "We use JWT. Here's the implementation..."
```

### Maintenance

| Aspect | Agent Memory | Knowledge Repos |
|--------|--------------|-----------------|
| **Source** | Conversations | Bulk imports (repos, docs, exports) |
| **Size** | ~100 bytes–10 KB per item | ~100 KB–MB per project |
| **Injection** | Always (hot cache, <1ms) | On-demand (when relevant) |
| **Maintenance** | Auto (promote, dedup, archive) | Agent-assisted (staleness alerts + re-ingest guidance) |

**Agent-assisted knowledge repo maintenance:**

The system monitors repo age and alerts you when updates are needed:

```bash
# View all knowledge repos and their age
npm run knowledge:status
# Output: 🟢 fresh (<30d) | 🟡 aging (30-90d) | 🔴 stale (>90d)

# Health check includes repo recommendations
npm run health
# If stale: "Knowledge repo 'myapp' is 120 days old — re-ingest recommended"
```

Your agent can have a conversation about whether to refresh a repo, see the specific command needed, and execute it—rather than manually running shell scripts.

---

## Key Features

### 🔥 Sub-Millisecond Retrieval
Recent memories live in L1 hot cache. Injecting context into prompts adds microseconds, not milliseconds.

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

---

## Deployment & Scalability

### Single-Node, Multi-Agent (Current)
ClawText is optimized for a single OpenClaw Gateway with multiple agents:
- **Architecture:** All agents share the same `~/.openclaw/workspace/memory/` directory
- **Memory sharing:** File-based (JSON clusters, hot cache), automatically synchronized
- **Zero coordination:** Agents read/write independently; no locking or sync logic needed
- **Transparency:** All memories visible in plaintext files (audit, debug, edit directly)

**This covers 99% of real deployments.** One machine, many agents, shared memory.

### Multi-Node Deployment (Future)
If you scale to multiple OpenClaw Gateways on different machines:
- Each Gateway has its own workspace, isolated memories
- Agents on Gateway A can't see memories from Gateway B

**At that point, you'd add a sync layer:**
- Shared filesystem (NFS mount)
- Central database (PostgreSQL + API)
- Git-based sync (push/pull orchestration)
- Or distributed file service (S3-compatible)

**Timeline:** This is not v1.3.0 scope. v1.3.0 is production-ready for single-node. Multi-node support would be a v2.0 feature with dedicated architecture decisions.

---
