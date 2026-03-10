# ClawText — Skill Definition

**Name:** clawtext  
**Type:** OpenClaw memory system / plugin  
**Status:** Production  
**Primary use case:** durable memory, retrieval, ingest, and operational learning for OpenClaw

## Summary

ClawText is a three-lane memory system for OpenClaw:

1. **Working memory** — prompt-time retrieval and context injection
2. **Ingest** — import and deduplicate external knowledge sources
3. **Operational learning** — capture failures, recurring fixes, and agent self-improvement patterns

It is designed to keep `MEMORY.md` small and high-signal while allowing larger project knowledge to stay searchable and maintainable.

## What it does

- builds searchable memory clusters from file-based memory
- injects relevant memories via `before_prompt_build`
- supports multi-source ingest with deduplication
- isolates operational learning from normal conversational memory
- adds anti-pattern walls to prevent false associations
- provides hygiene controls for sensitive data handling

## Installation

Canonical location:

```bash
~/.openclaw/workspace/skills/clawtext
```

Install:

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

Enable in `~/.openclaw/openclaw.json`:

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
      "clawtext": { "enabled": true }
    }
  }
}
```

Restart the gateway after enabling.

## Validation

```bash
node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs status
```

## Inputs

- workspace memory files
- imported markdown / docs / repos / Discord / JSON
- operational review data
- user prompts at `before_prompt_build`

## Outputs

- `memory/clusters/*.json`
- prompt-time injected context
- operational candidates / confirmed learnings
- review and maintenance artifacts

## Major components

- `plugin.js` — plugin entrypoint
- `src/rag.*` — retrieval and injection logic
- `scripts/build-clusters.js` — cluster builder
- `scripts/ingest-all.mjs` — ingest orchestration
- `scripts/operational-cli.mjs` — operational learning CLI
- `docs/OPERATIONAL_LEARNING.md` — lane design and workflow

## Guardrails

- token-budgeted injection
- confidence filtering
- anti-pattern walls
- hygiene controls for secrets
- raw log / noise filtering during cluster build
- user approval for risky promotions and external actions

## Documentation

- [README.md](./README.md)
- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/INGEST.md](./docs/INGEST.md)
- [docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md)

## Notes

ClawText is file-based by design. Auditability and operator control are preferred over hidden state and heavyweight infrastructure.
