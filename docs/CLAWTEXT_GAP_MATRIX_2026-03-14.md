# ClawText Gap Matrix — 2026-03-14

Purpose: compact audit of what ClawText claims, what the code actually implements, what is live on this server, and what still needs attention.

## Baseline and drift window

- **Baseline for comparison:** `v1.4.0`
- **Current runtime version:** `1.5.0`
- **Server runtime source:** `~/.openclaw/workspace/repo/clawtext`
- **Git state vs origin/main:** local branch is ahead by recent hardening commits

## Important commits after v1.4.0

- `41d0af9` — move runtime-owned state under `state/clawtext/prod`
- `3ed6aa6` / `55e5fb9` — lightweight relationship tracking (v1.5)
- `3b7c529` — memory health report
- `f3132e1` / `a74e7c6` — ClawBridge v2 engine + fallback rendering
- `b16e91f` — plugin/runtime reliability + bridge safety pipeline
- `bfed607` — bridge preflight estimates + chunk-budget guardrails
- `8ad44f0` — fail cleanly on invalid attach targets
- `24c234e` — safe wrapper + read fallback handling

## Feature/status matrix

| Area | Claimed / Intended | Code status | Live server status | Gap / note | Next action |
|---|---|---|---|---|---|
| Prompt injection / RAG | Automatic memory injection on `before_prompt_build` | Implemented in `src/index.ts`, `src/plugin.ts`, `src/rag.ts` | **Working** (`openclaw plugins info clawtext` = loaded) | Remote `origin/main` still lags local runtime fixes | Push local runtime commits upstream |
| Extraction hook | Buffer every in/out message | Implemented in hooks | **Working**, but state-root migration had split live paths | Workspace hooks were still writing legacy `memory/extract-*`; fixed on 2026-03-14 | Keep state-root canonical and retire legacy assumptions |
| 20-min extraction cron | Periodic extraction into daily notes | Implemented via `scripts/extract-buffer.mjs` + cron | **Working** (`clawtext-extract-buffer`) | README / older docs drifted on path location | Keep docs aligned with `state/clawtext/prod/ingest/` |
| Session-end flush hook | Prevent loss between cron windows | Implemented in hook | **Working**, now aligned to state root | Previously still pointed at legacy memory path in workspace hook copy | Keep workspace + repo hooks synchronized |
| Cluster rebuild / validation | Daily rebuild + validation | Implemented via `scripts/build-clusters.js` / `scripts/validate-rag.js` | **Working** (`clawtext-daily-cluster-rebuild`) | None major beyond release/doc drift | Leave active, monitor quality |
| Operational learning lane | Capture → aggregate → review → promotion → maintenance | Implemented across `src/operational-*` and `scripts/operational-cli.mjs` | **Mostly present**, cron exists | End-to-end proof of live item flow still not fully documented | Run one trace of a real item through the whole lane |
| Relationship tracking | Lightweight explicit relationships via YAML | Partially implemented (`docs/RELATIONSHIPS.md`, `memory/clusters/relationships.yaml`) | **Present as manual data/doc workflow** | Not strongly integrated into retrieval/query behavior | Either wire into retrieval or reduce claim strength in docs |
| Memory health reporting | Holistic health report | Implemented (`scripts/memory-health-report.js`) | Available | README mentions v1.6.0 while package is 1.5.0 | Normalize version story |
| ClawBridge v2 | Continuity transfer engine | Implemented in `skills/clawbridge/` and `bridge/` | **Working with guardrails** | Underlying Discord targetability still inconsistent | Investigate OpenClaw/Discord target resolution separately |
| Bridge safety | Backup, chunking, preflight, bounded runs | Implemented locally (`clawbridge.js`, `clawbridge-safe`) | **Working locally** | Local hardening not yet reflected in `origin/main` | Push local commits upstream |
| Install flow | Published install + `--link` dev install | Docs updated locally | Live install is path-linked + recorded | Docs cleanup not committed yet | Commit docs cleanup |
| State-root migration | Runtime-owned state under `state/clawtext/prod` | Intended by code and some docs | **Now partially cleaned live** | Legacy files / older docs / MEMORY.md still reference `memory/extract-*` | Finish canonicalization and compatibility notes |

## Current live-good truths

- ClawText is loaded and active.
- Hooks are ready: `clawtext-extract`, `clawtext-flush`.
- Crons are active:
  - `clawtext-extract-buffer`
  - `clawtext-daily-cluster-rebuild`
  - `clawtext-operational-maintenance`
- Extraction buffer/state are now canonicalized under:
  - `state/clawtext/prod/ingest/extract-buffer.jsonl`
  - `state/clawtext/prod/ingest/extract-state.json`
- Legacy paths in `memory/` now act as compatibility symlinks only.

## Operational lane trace (2026-03-14)

I ran one compact end-to-end trace against the current operational lane implementation.

### Trace path tested

1. **Capture** — manually captured the same success pattern twice through `OperationalCaptureManager`
2. **Aggregation / candidate promotion** — second capture auto-promoted the pattern from `raw` to `candidate`
3. **Review** — approved the candidate through the review CLI wrapper
4. **Promotion** — applied promotion programmatically with `applyToDocument: false`
5. **Retrieval check** — tested retrieval behavior after promotion

### Observed results

- ✅ `raw -> candidate` transition works when recurrence reaches `2`
- ✅ `candidate -> reviewed` review flow works
- ✅ `reviewed -> promoted` promotion flow works
- ✅ new trace data is written under `state/clawtext/prod/operational/`
- ⚠️ retrieval currently searches **reviewed** patterns, not **promoted** patterns, so once promoted the traced pattern no longer surfaced in retrieval tests
- ⚠️ there is still a **legacy operational corpus** under `memory/operational/` that the current state-root implementation does not automatically read

### Meaning

The operational lane mechanics are real and functioning in current code, but the live system is split between:
- **new canonical state-root operational data**: `state/clawtext/prod/operational/`
- **older legacy operational corpus**: `memory/operational/`

This means the lane is working for new items, but older accumulated operational knowledge is effectively stranded until migration or compatibility handling is added.

## Highest-priority remaining gaps

1. **Push local runtime hardening upstream** so GitHub matches the server.
2. **Finish state-root narrative cleanup** anywhere docs still imply `memory/extract-*` is canonical.
3. **Migrate or bridge legacy `memory/operational/` into `state/clawtext/prod/operational/`** so historical operational knowledge is visible again.
4. **Decide relationship feature scope**: integrated runtime feature vs manual curation overlay.
5. **Resolve version drift**: either cut 1.6.0 cleanly or remove 1.6 references.
6. **Decide whether promoted operational patterns should remain retrieval-visible** or whether promotion intentionally removes them from operational retrieval.

## Tight next actions

1. Commit docs cleanup + this matrix.
2. Push local runtime safety commits.
3. Run one operational-lane trace and append findings to this document.
