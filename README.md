# ClawText

**Version:** 1.0.0 | **Status:** Production-Ready

**Context Layer Augmentation with Text** — Intelligent retrieval-augmented generation (RAG) layer for OpenClaw. Automatically searches your memories and injects relevant context into every prompt before execution.

Think of it as a smart filter: instead of passing all memories to your model, ClawText identifies what matters and injects only that context.

## Why

OpenClaw's `memory-core` provides search tools (`memory_search`, `memory_get`). ClawText adds automatic context injection:

| Capability | memory-core | + ClawText | Benefit |
|---|---|---|---|
| **Storage & Persistence** | ✅ SQLite/JSON | — | Reliable data layer |
| **Manual Search Tools** | ✅ memory_search tool | — | Agent-initiated lookup |
| **Automatic Injection** | ❌ Manual | ✅ 5-7ms search | Always available |
| **Relevance Filtering** | ❌ All results | ✅ 85%+ confidence | Smart filtering |
| **Token Efficiency** | N/A | ✅ 12% budget | Safe, predictable |

## Features

- **Automatic context injection** — Searches on every prompt, injects relevant memories before agent execution
- **BM25 keyword matching** — Fast, accurate, project-aware filtering
- **Smart filtering** — Only injects memories above confidence threshold, preventing noise
- **Token efficient** — Respects OpenClaw budgets (~12% per query)
- **Agent-friendly** — Automated setup with exit codes; agents can configure at runtime
- **Compatible** — Works alongside memory-core search tools; no conflicts

## Installation

### For Agents (Recommended)

ClawText is designed to be installed and configured automatically by agents. Simply ask your agent to review and install the repository:

```
"Review and install ClawText from https://github.com/ragesaq/clawtext"
```

The agent will handle: git clone, npm install, configuration, and validation. Exit codes indicate success (0) or issues (1–3).

### Manual (Human Setup)

```bash
git clone https://github.com/ragesaq/clawtext.git
cd clawtext
npm install
node install.js --auto-config
```

Enable in OpenClaw config:
```json
{
  "skills": {
    "clawtext": { "enabled": true }
  }
}
```

## Performance

- **Search latency:** 5-7ms
- **Injection overhead:** <100ms
- **Memory footprint:** <8MB
- **Quality:** 85%+ avg confidence, <5% false positives
- **Tested with:** 476+ memories, 15 clusters

## Configuration

Out-of-the-box works for most use cases. Tunable per-agent:

```javascript
{
  "maxMemories": 7,        // Memories per query
  "minConfidence": 0.70,   // Quality threshold
  "tokenBudget": 4000,     // Injection limit
  "injectMode": "smart"    // Full text vs snippets
}
```

See README for advanced tuning scenarios (hallucination control, context loss, pattern recognition).

## How It Works

```
Prompt → memory-core (storage) + ClawText RAG (search) → Enriched prompt → Model
```

ClawText handles:
- BM25 keyword matching (fast, accurate)
- Project-aware filtering (prevent cross-domain noise)
- Pattern recognition (error prevention)
- Entity tracking (multi-agent cooperation)
- Token budgeting (safe, predictable)

## Docs

- **README.md** — Full guide, API, examples
- **AGENT_INSTALL.md** — Automation checklist
- **TROUBLESHOOTING.md** — 10 common issues + solutions

## License

MIT
