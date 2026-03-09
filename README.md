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

Modern AI agents solve this by **injecting relevant memories into the prompt before processing it**. This works like giving an agent background information before asking a question.

### The Technical Flow

Every LLM interaction follows this pattern:

```
[Relevant memories from storage] + [User prompt] → LLM → [Better response]
```

Here's what happens at each step:

1. **User sends a request** — "Fix the authentication bug"
2. **Memory system retrieves context** — Searches storage for relevant memories (project decisions, past issues, patterns)
3. **Context injected into prompt** — The memories are prepended to the user's message, creating the full prompt:
   ```
   Context from memory:
   - Decision: Authentication uses JWT with 24h expiry
   - Bug: Redis cache not invalidating on logout
   - Pattern: We prefer async/await over callbacks
   
   User request: Fix the authentication bug
   ```
4. **LLM processes the full prompt** — The model now has both context and the current request
5. **Better response** — Because the model has background, it makes informed decisions instead of guessing

### Without Memory vs. With Memory

**Without Memory:**
```
User: "Fix the authentication bug"
Agent: "I don't have any context. What project is this?"
```

**With Memory:**
```
[Context injected from memory]
User: "Fix the authentication bug"
Agent: "I see the Redis invalidation problem. Here's the fix..."
```

The agent's capabilities don't change. What changes is the **quality of decisions** because it has context injected before processing.

---

## What ClawText Does

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
