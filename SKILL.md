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

New addition:
- **Continuity transfer** — structured handoff artifacts for moving active work across threads/sessions without context loss

It is designed to keep `MEMORY.md` small and high-signal while allowing larger project knowledge to stay searchable and maintainable.

## What it does

- builds searchable memory clusters from file-based memory
- injects relevant memories via `before_prompt_build`
- supports multi-source ingest with deduplication
- isolates operational learning from normal conversational memory
- adds anti-pattern walls to prevent false associations
- provides hygiene controls for sensitive data handling
- includes companion continuity transfer tooling (`skills/clawbridge/`) for short/full/bootstrap handoff generation

## Installation

Canonical install flows:

### Published / user install

```bash
openclaw plugins install @openclaw/clawtext
```

### Local development install

```bash
openclaw plugins install --link /path/to/clawtext
```

If `~/.openclaw/workspace/skills/clawtext` exists, treat it as a linked alias or workspace convenience path — **not** the canonical install contract.

Manual `plugins.load.paths` editing in `~/.openclaw/openclaw.json` is recovery/debug-only, not the primary install story.

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

**Getting Started:**
- [README.md](./README.md) — Full product guide (problem, solution, three lanes, architecture, configuration, quick start)
- [docs/START_HERE.md](./docs/START_HERE.md) — Role-based navigation (find your starting point: just running it → complete picture)

**Technical Details:**
- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/INGEST.md](./docs/INGEST.md)
- [docs/OPERATIONAL_LEARNING.md](./docs/OPERATIONAL_LEARNING.md)
- [docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md](./docs/ADOPTION_PLAN_MEMORY_EVOLUTION.md)
- [docs/ADOPTION_LOG_MEMORY_EVOLUTION.md](./docs/ADOPTION_LOG_MEMORY_EVOLUTION.md)
- [docs/ME-001_DURABILITY_CLASSIFIER.md](./docs/ME-001_DURABILITY_CLASSIFIER.md)
- [docs/ME-002_SCOPE_ISOLATION_HARDENING.md](./docs/ME-002_SCOPE_ISOLATION_HARDENING.md)
- [docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md](./docs/ME-003_CONTEXT_LIBRARIAN_CURATION.md)
- [docs/ME-004_EVAL_HARNESS.md](./docs/ME-004_EVAL_HARNESS.md)
- [docs/STATE_ROOTS.md](./docs/STATE_ROOTS.md)
- [skills/clawbridge/START_HERE.md](./skills/clawbridge/START_HERE.md)

## Notes

ClawText is file-based by design. Auditability and operator control are preferred over hidden state and heavyweight infrastructure.
