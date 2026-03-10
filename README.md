# ClawText

**Status:** Production  
**Architecture:** Three-lane memory system for OpenClaw  
**Focus:** working memory, ingest, and operational learning in one install story

ClawText is a file-based memory system for OpenClaw that keeps `MEMORY.md` small, keeps recent/high-value context on the fast path, and lets deeper knowledge stay searchable without turning the whole workspace into prompt sludge.

It does three things together:

1. **Working memory** — retrieves relevant context into prompts
2. **Ingest** — pulls in docs, repos, Discord, JSON, and other sources
3. **Operational learning** — captures failures, reviews them, and promotes durable guidance

---

## Why ClawText exists

Most agent memory systems fail in one of two ways:

- they keep almost everything in the prompt and blow up token usage
- or they push everything into a giant archive that agents never retrieve well

ClawText splits the problem into lanes:

- **fast path** for recent and high-value memories
- **searchable path** for larger knowledge stores
- **review path** for lessons about the system itself

That gives you a memory system that stays useful under real load.

---

## Core architecture

### 1. Working Memory

- memory files live in `memory/` and `MEMORY.md`
- clusters are built into `memory/clusters/`
- the plugin injects relevant memories via `before_prompt_build`
- anti-pattern walls prevent bad cross-project contamination

### 2. Ingest

- imports from markdown, repos, Discord, docs, JSON, and structured exports
- deduplication uses persistent hashes so repeated imports are safe
- large imports stay file-based; no external vector DB required

### 3. Operational Learning

- captures failures, successful recoveries, and recurring agent mistakes
- keeps operational knowledge separate from normal project memory
- supports review, maturation, promotion, and maintenance workflows

---

## Safety and quality model

ClawText is designed to avoid the two biggest memory failures:

1. **storing things that should never be stored**
2. **retrieving things that should never be injected**

Current controls include:

- hygiene patterns for secrets and credentials
- raw-log detection to keep pasted logs/tool dumps out of clusters
- anti-pattern walls to block false associations
- token budgeting for prompt injection
- approval-gated promotion for durable operational guidance
- file-based auditability instead of hidden database state

See:

- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)

---

## Install

Clone into the canonical OpenClaw workspace path:

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

Enable the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/.openclaw/workspace/skills/clawtext"
      ]
    },
    "allow": ["clawtext"],
    "entries": {
      "clawtext": {
        "enabled": true
      }
    }
  }
}
```

Then restart the gateway.

---

## Validate installation

```bash
# Build clusters
node scripts/build-clusters.js --force

# Validate retrieval quality
node scripts/validate-rag.js

# Operational learning status
node scripts/operational-cli.mjs status
```

You should see cluster files in `memory/clusters/` and a successful validation report.

---

## Documentation map

### OpenClaw-standard docs

- [SKILL.md](./SKILL.md) — formal skill definition
- [SECURITY.md](./SECURITY.md) — threat model, controls, trust boundaries
- [RISK.md](./RISK.md) — operational risk register and mitigations

### Architecture and operations

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/INGEST.md](./docs/INGEST.md)
- [docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md)
- [docs/MEMORY_SCHEMA.md](./docs/MEMORY_SCHEMA.md)
- [docs/HOT_CACHE.md](./docs/HOT_CACHE.md)
- [docs/TESTING.md](./docs/TESTING.md)

### Agent/operator docs

- [AGENT_INSTALL.md](./AGENT_INSTALL.md)
- [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md)
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## Optional operator UI

ClawText also has a browser UI for operators:

- search memories
- inspect graph structure
- manage anti-pattern walls
- review operational learnings
- manage hygiene patterns

This lives in `skills/clawtext-browser/`.

---

## What ClawText is not

ClawText is **not**:

- a hidden long-context dump
- a vector-database-first architecture
- a replacement for human review on risky changes
- a license to ingest arbitrary untrusted content without controls

It is a practical, auditable memory layer for OpenClaw.

---

## Repository

- Source: <https://github.com/ragesaq/clawtext>

## License

MIT
