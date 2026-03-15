# ClawText 2.0 — Practical Memory & Continuity for OpenClaw

**Version:** release-boundary v2.0 | **Status:** production-capable runtime with documented constraints | **Repo:** https://github.com/ragesaq/clawtext

## The problem we’re solving

OpenClaw agents can continue a conversation, but they still lose context every time a session changes scope, thread, or timeframe.
That creates repetitive re-explanation:
- repeated setup work
- forgotten decisions
- lost lessons from prior failures
- inconsistent handoffs between workflows

ClawText solves this with **durable memory + retrieval + continuity packaging** so an agent can recover context quickly and safely without relying on one huge prompt or hidden internal state.

## How LLM memory typically works

Most agents combine:

1. **Short-context prompting** (what’s in the current message window)
2. **Recent memory snippets** (lightweight prompt-side context)
3. **External storage** (vectors, files, or manuals)

The gap is usually one of reliability: how to move from short snippets to **usable long-term memory + repeatable continuity**, with visibility and control.

## What OpenClaw and similar systems usually provide

A lot of systems provide some version of:

- plugin hooks for prompt assembly,
- basic note storage,
- basic retrieval from saved logs or notes.

That is useful, but often leaves teams doing manual context reconstruction and separate engineering for:
- structured memory recall,
- repeatable handoff artifacts,
- failure-learning feedback,
- operational safety around heavy continuity runs.

ClawText 2.0 adds the missing layer: **a coherent memory system, not just a memory feature.**

## How ClawText extends the baseline

ClawText 2.0 focuses on three things:

1. **Make memory durable and usable** (`capture → extract → recall → inject`)
2. **Make continuity portable** (handoff/full/bootstrap packets with backup + manifest)
3. **Make improvement automatic** (capture failures → recurrence → review → promote → reuse)

## Product philosophy

ClawText is intentionally opinionated:

- **Simple first** — keep the mental model small: files, lanes, and clear contracts.
- **Automatic where possible** — reduce agent friction for capture/rebuild/review flows.
- **Agent-assisted where needed** — human review for risk-sensitive promotion/decisions.
- **CLI/control-first** — if behavior matters, it should be inspectable and configurable.

## What ClawText 2.0 can safely claim

The repository defines a clear claim boundary for public positioning.

### ✅ We can claim
- plugin loads and works in OpenClaw
- capture-to-memory pipeline is operating (capture → extract → daily memory/writeback)
- retrieval/recall pipeline is active (ranking, merge, prompt injection)
- continuity artifact generation is reliable (`handoff`, `full continuity`, `bootstrap`, backups, manifests)
- operational learning loop works (capture → recurrence → review → promote → retrieve)
- bounded continuity safety is enforced:
  - preflight/estimate before runs
  - chunk budget checks
  - explicit oversized-run behavior unless override is used
  - backup + source snapshot persisted with each continuity transfer

### ⚠️ Important limits (intentional)
- Existing-thread appends work when destination thread is valid and resolvable; stale/invalid IDs may fail.
- ClawText owns context creation and continuity packaging, not all Discord transport semantics.
- Relationship support is real but lightweight (not full graph-native retrieval).
- Retrieval is operationally useful and improving; it is not mathematically perfect.

For exact language: [`docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`](./docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md)

## High-level architecture

ClawText is organized as three operational lanes:

| Lane | What it does | Why it matters |
|---|---|---|
| **Working memory** | Retrieve and inject relevant context at prompt time | continuity without bloating prompts |
| **Knowledge ingest** | Import and normalize docs/repos/threads/JSON sources | broader recall with controlled quality |
| **Operational learning** | Capture recurrent failures and promote stable guidance | fewer repeated mistakes over time |

```text
Conversation / source events
  -> capture staging
  -> extraction + dedupe
  -> clusters + validation
  -> ranked recall merge
  -> token-budgeted prompt injection

Continuity transfer
  -> preflight estimate
  -> handoff/full/bootstrap packet
  -> backup + manifest
  -> explicit bounded execution behavior
```

### Core technology choices

- **File-first state and artifacts** for auditability and transportability
- **Hybrid retrieval** (multi-source ranking and merge) with policy controls
- **Scheduled maintenance** for rebuild/health/review workflows
- **Operational lane feedback** for repeatable improvement

ClawText is designed to avoid a fragile single-store model. Files and deterministic artifacts keep it easier to inspect, debug, and version.

## Product positioning against memory approaches

> Short-form benchmark: this is directional, not a universal benchmark.

| Approach | Strength | Trade-off | Why ClawText differs |
|---|---|---|---|
| **OpenClaw default / basic note-based memory** | Simple integration and fast initial setup | weak continuity packaging and limited continuity tooling | Adds structured lanes + bounded continuity transfer + operational loop |
| **Pure vector store RAG** | strong semantic similarity | can over-inject noise without guardrails and weak prompt governance | Adds ranking merge + prompt-safe gating + operational review controls |
| **Agent-memory tools (single-surface)** | lightweight and portable | often isolated by surface and weak cross-workflow continuity | Focuses on OpenClaw workflows + artifact-based continuity handoff |
| **Graph/neo4j-style memory systems** | rich entity relations | complexity, schema burden, and operational overhead | Uses lightweight relationships today with explicit roadmap for deeper graph-native behavior |
| **Manual context workflows** | full control, human-safe | high operator overhead | balances automation with explicit review points |

## Installation

### Canonical install

```bash
openclaw plugins install @openclaw/clawtext
```

### Local development install

```bash
openclaw plugins install --link /path/to/clawtext
```

You may still see `~/.openclaw/workspace/skills/clawtext` as an alias/convenience path, but this is not the canonical contract.

### Verify runtime

```bash
openclaw plugins list
openclaw hooks list
openclaw cron list
```

### Sanity check script set

```bash
node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs status
```

If these commands are not available in your environment, use the companion setup playbooks below.

## Agent-assisted setup (recommended)

For complex environments, have an agent do the setup pass with your constraints:

1. install + plugin verification
2. confirm hook/crons
3. validate memory policy controls and retrieval behavior
4. test continuity packet run on safe input
5. tune defaults for your token/cost profile

See: [`AGENT_INSTALL.md`](./AGENT_INSTALL.md), [`AGENT_SETUP.md`](./AGENT_SETUP.md)

## Configuration and tuning (starting point)

Core tuning points live in your normal OpenClaw config plus ClawText runtime options.

A common pattern:

- `maxMemories`: reduce for concise prompts / token-critical workflows
- `minConfidence`: raise when you want stricter recall quality
- `clusters.rebuildInterval`: shift maintenance cadence to balance freshness vs compute
- `retrieval` thresholds: tune for signal/noise depending on project complexity

Detailed fields and safe ranges are in:
- [`docs/MEMORY_POLICY_TRIGGER_CONTRACT.md`](./docs/MEMORY_POLICY_TRIGGER_CONTRACT.md)
- [`docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`](./docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md)
- [`docs/INTERACTION_OPS_MEMORY_CONTRACT.md`](./docs/INTERACTION_OPS_MEMORY_CONTRACT.md)

## Links for deeper reading

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/INGEST.md`](./docs/INGEST.md)
- [`docs/OPERATIONAL_LEARNING.md`](./docs/OPERATIONAL_LEARNING.md)
- [`docs/HOT_CACHE.md`](./docs/HOT_CACHE.md)
- [`docs/PROJECT_DOCS_SCHEMA.md`](./docs/PROJECT_DOCS_SCHEMA.md)

## Version history (summary)

| Version | What changed |
|---|---|
| **2.0 (claim boundary)** | Release-safe 2.0 claim boundary, continuity safety claims, and public positioning alignment |
| **1.5.0** | operational learning cadence, relationship support, continuity safety hardening |
| 1.4.0 | integrated knowledge ingest + memory lane consolidation |
| 1.3.0 | working-memory improvements + plugin + policy controls |
| 1.2.0 | tiered memory model and cluster rebuild/validation |
| 1.1.0 | multi-source ingest and dedup pipeline |

> Note: `2.0` here is a product boundary marker. Runtime package version is currently `1.5.0`.

## Security and operating assumptions

- file-based artifacts are preferred over hidden-only state,
- continuity safety behavior is explicit (not silent fallback),
- recovery should always be auditable from produced artifacts.

See [`SECURITY.md`](./SECURITY.md) and [`RISK.md`](./RISK.md).

## License

MIT
