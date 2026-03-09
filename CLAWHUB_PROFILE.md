# ClawText - Comprehensive Memory Skill for OpenClaw Agents

## The Problem

Every AI agent conversation starts from zero. Your agent doesn't know:
- What you decided yesterday
- What failed last time (so it can avoid the same mistake)
- Your project's current state
- What other agents learned
- Your preferences and style

This kills agent productivity. You're constantly re-explaining context. Knowledge evaporates between sessions. Agents become stateless, interchangeable, disposable.

**The real cost:** Agents that should be learning and evolving instead become expensive, forgetful search engines.

## The Solution: ClawText

ClawText is a **production-grade memory system built specifically for OpenClaw agents**. It captures context from conversations, organizes it intelligently, injects relevant memories into every prompt, and maintains the system automatically.

**Result:** Agents that actually remember. Agents that learn. Agents that build on past work.

## What You Get

### 🔥 Sub-Millisecond Memory Injection
Recent memories live in a hot cache. Adding context to prompts adds microseconds, not milliseconds.

**Performance:** 98%+ cache hit rate, 7ms average search latency

### 🧠 Four-Tier Memory Architecture
- **L1 Hot Cache:** Active project context (sub-1ms, in-memory)
- **L2 Curated:** Validated, ranked memories (~10ms, searchable)
- **L3 Archive:** Historical context for deep searches (~100ms)
- **L4 Staging:** Raw captures and bulk ingest buffer (write-only)

Your agent queries L1 first (instant). If needed, searches L2. Archive is there for deep historical queries. L4 feeds both automatic capture and bulk ingestion.

### 🤖 Multi-Agent Memory Sharing
One memory system. Many agents. All sharing the same knowledge.

- **Shared memories:** Architecture decisions, lessons, blockers (visible to all agents)
- **Private memories:** Sensitive context stays isolated (per-agent or team-specific)
- **Cross-agent handoff:** One agent leaves context. Another picks it up. Seamlessly.

### 🔄 Automatic Continuity
Agents remember which session they were in. No more "Wait, who am I? What are we doing?"

**Mechanism:** SessionId + relatesToSession tracking across agent lifecycles.

### 💡 Intelligent Retrieval (No Vector DB Required)
- **BM25 scoring:** Term frequency + project weighting (not just cosine similarity)
- **Semantic clustering:** Memories grouped by topic (15 pre-built clusters)
- **Hybrid search:** Hot cache + indexed clusters (fast and comprehensive)
- **Deduplication:** SHA1 hashing prevents duplicate ingestion

**Why this beats vector search:**
- Zero external dependencies (no embedding API calls, no vector service)
- Instant relevance (keyword match is faster than network round-trip)
- Transparent (you can see exactly why a memory matched)
- Tunable (adjust weights and keywords easily)

### 🏥 Self-Monitoring & Automated Maintenance
The system watches itself and alerts you:

```
npm run health
→ Reports cache hit rate (98.9%)
→ Flags stale knowledge repos (>90 days)
→ Suggests deduplication
→ Recommends re-ingestion
```

**No manual work required.** System provides recommendations. You decide.

### 💻 Programmable API + CLI
Add and search memories from code, CLI, or hooks:

```bash
npm run memory -- add "Decision: Use PostgreSQL for state"
npm run memory -- search "database" --project myapp
npm run memory -- inject "current_context"
```

Or programmatically:
```javascript
import ClawText from 'clawtext-rag';
const memories = await clawtext.findRelevantMemories(query, projectKeywords);
```

### 🔌 Two Memory Paths: Conversational + Bulk
- **Agent Memory:** Auto-captured from conversations. Promoted through tiers. Injected into prompts. (~100 bytes–10 KB per item)
- **Knowledge Repos:** Large sources (codebases, docs, exports) loaded in bulk. Queryable on-demand. (~100 KB–MB per project)

Why separate? Injecting a 500KB codebase into every prompt wastes tokens. Instead, repos live separately and are queried when relevant.

## Why ClawText Wins

| Feature | ClawText | mem0 | QMD | Standard MEMORY.md |
|---------|----------|------|-----|------------------|
| Multi-tier retrieval | ✅ (4 tiers) | ⚠️ (basic) | ✅ (3 tiers) | ❌ |
| BM25 + clustering | ✅ | ❌ | ✅ | ❌ |
| Knowledge repo support | ✅ | ⚠️ (basic) | ✅ | ❌ |
| Multi-agent memory | ✅ (shared/private/cross-agent) | ❌ | ❌ | ❌ |
| Agent-assisted maintenance | ✅ (health checks, alerts) | ⚠️ (manual) | ⚠️ (manual) | ❌ |
| Sub-millisecond cache | ✅ (<1ms) | ⚠️ (API latency) | ⚠️ (DB latency) | ❌ |
| Built for OpenClaw | ✅ | ❌ | ❌ | ✅ (limited) |
| No external dependencies | ✅ | ❌ (API calls) | ❌ (vector service) | ✅ |
| Cost | 💚 Free (no API calls) | 💛 Monthly billing | 💛 Compute cost | 💚 Free |

## Real-World Examples

### Example 1: Project Continuity
```
Session 1 (Tuesday):
  Agent: "We need caching. I'll use Redis."
  [Memory captured: Decision: Use Redis for session caching]

Session 2 (Friday):
  User: "Why can't we scale horizontally?"
  Agent: [Memory injected] "We're using Redis (single-node). We need memcached or
          distributed Redis. Here's the migration path..."
  [Agent builds on previous decision without re-explaining context]
```

### Example 2: Learning from Mistakes
```
Session 1:
  Agent: "I'll use setTimeout for async. Should work..."
  [Fails. Lesson captured: Anti-pattern: setTimeout for async]

Session 2 (different project, same pattern):
  Agent: [Memory injected] "I see async work. Last time we tried setTimeout 
          and hit race conditions. Let me use Promises instead..."
  [Agent avoids same mistake]
```

### Example 3: Multi-Agent Handoff
```
Agent-A session:
  "We need authentication. Using JWT with 24h expiry."
  [Memory captured: Decision: JWT 24h expiry]

Agent-B session (different task):
  User: "Can agents see the auth approach?"
  Agent-B: [Cross-agent memory injected] "Yes, Agent-A set this up: JWT 
           with 24h expiry. Here's the implementation..."
  [Knowledge transfers seamlessly]
```

## Installation & Deployment

### Quick Start
```bash
# Clone into your OpenClaw workspace
git clone https://github.com/ragesaq/clawtext.git \
  ~/.openclaw/workspace/skills/clawtext

cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build

# Verify
npm test
# → Should show: 15 clusters loaded, 191 memories indexed, hot cache ready
```

### Enable in OpenClaw
ClawText is already in your `~/.openclaw/openclaw.json` skills array. Just restart the gateway:

```bash
openclaw gateway restart
```

The plugin auto-activates and starts injecting memories.

### No Configuration Required
ClawText works out of the box. If you want to tune:

- **Max memories per query:** Edit `plugin.js`, change `maxMemories` (default: 7)
- **Confidence threshold:** Change `minConfidence` (default: 0.70)
- **Token budget:** Change `tokenBudget` (default: 4000 tokens)

All tuning is reversible.

## Architecture & Deployment

### Single-Node, Multi-Agent (Current)
ClawText is optimized for one OpenClaw Gateway with multiple agents:
- All agents share the same memory files (`~/.openclaw/workspace/memory/`)
- Zero coordination needed (file-based, JSON-backed)
- All memories transparently visible (plaintext files, audit-friendly)

**This covers 99% of real deployments.**

### Multi-Node (Future Roadmap, v2.0+)
If you scale to multiple Gateways on different machines, you'd add:
- Shared filesystem (NFS mount), or
- Central database (PostgreSQL + API), or
- Git-based sync, or
- S3-compatible service

ClawText's architecture is designed for this upgrade path, but it's not v1.3.0 scope.

## What's Included

### Code
- **1,254 lines** of production TypeScript
- **22/22 integration tests** passing
- Full memory API (add/search/list/delete/stats)
- RAG injection plugin
- CLI commands for agent workflows

### Documentation
- **ARCHITECTURE.md** — Deep dive on tiers, algorithms, performance
- **HOT_CACHE.md** — Cache tuning and behavior
- **MULTI_AGENT.md** — Shared/private memory, agent collaboration
- **CURATION.md** — Memory promotion, archival, deduplication
- **INGEST.md** — Bulk loading, dedup strategies
- **MEMORY_SCHEMA.md** — Memory format and metadata
- **TESTING.md** — Verify your installation

### Testing & Quality
- **98%+ cache hit rate** (production verified)
- **7ms average search latency** (with typical queries)
- **8 MB memory footprint** (hot cache + clusters)
- All code tested against 15 memory clusters and 191 stored memories

## Getting Started

1. **Install:** Clone repo, run `npm install && npm run build`
2. **Verify:** Run `npm test` to see health report
3. **Use:** Memories auto-inject into prompts. Check `npm run health` periodically.
4. **Maintain:** System alerts you when repos are stale or dedup recommended.

## Learn More

- **GitHub:** https://github.com/ragesaq/clawtext
- **Companion Skill:** `clawtext-ingest` (for bulk knowledge loading)
- **OpenClaw Docs:** https://docs.openclaw.ai

## Community & Support

- Report issues: https://github.com/ragesaq/clawtext/issues
- Discussions: https://github.com/ragesaq/clawtext/discussions
- Questions: Ask in the OpenClaw Discord community

---

**ClawText v1.3.0 — Production Ready**

Built for agents that learn. Memory that scales. System that maintains itself.
