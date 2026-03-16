---
doc: LANE_A_RETRIEVAL_CORRECTNESS_ASSESSMENT
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# Lane A — Retrieval Correctness and Operational Promotion Assessment

## Purpose
Assess whether ClawText currently supports retrieval of reviewed and promoted operational patterns, and identify what remains to prove the path end-to-end.

## Summary
**Result:** source-level support appears present, but end-to-end runtime proof is still missing.

### Confirmed in source
- `src/operational-retrieval.ts` retrieves both `reviewed` and `promoted` statuses.
- Promoted patterns receive a higher ranking bonus than reviewed patterns.
- Health reporting in `src/operational-maintenance.ts` explicitly treats retrievable patterns as `reviewed + promoted`.
- Promotion flow in `src/operational-promotion.ts` marks entries as `promoted` and logs promotion metadata.

### Not yet proven in this repo state
- the current repo snapshot does not contain reviewed/promoted operational patterns under `state/clawtext/prod/operational/`
- therefore this pass cannot yet prove end-to-end retrieval from real promoted state without creating or capturing representative patterns

## Evidence gathered
### Retrieval status support
From `src/operational-retrieval.ts`:
- `getRetrievalStatuses()` returns `['reviewed', 'promoted']`
- ranking gives promoted patterns a stronger score bonus than reviewed patterns

### Health-report support
From `src/operational-maintenance.ts`:
- health summary reports `Retrievable patterns (reviewed + promoted)`

### Promotion support
From `src/operational-promotion.ts`:
- promotion apply flow marks patterns as promoted
- provenance is recorded in `promotion-log.json`

### Current runtime-state gap
State inspection found no current reviewed/promoted fixtures or live entries under:
- `state/clawtext/prod/operational/`

This means the contradiction is not currently "source says one thing, code does another."
It is now better stated as:
- **source path appears to support reviewed/promoted retrieval**
- **end-to-end validation artifact is still missing**

## Revised interpretation of the earlier contradiction
### Previous concern
"Docs say reviewed/promoted patterns are visible, but retrieval may only surface reviewed patterns first."

### Better current reading
The code path is designed to retrieve both reviewed and promoted patterns, and promoted patterns are intentionally favored in ranking.

The remaining problem is not necessarily logic exclusion.
The remaining problem is lack of durable runtime proof / fixture-backed validation in the repo state examined during this pass.

## What remains to finish Lane A completely
### Needed proof artifact
One of the following:
1. a real promoted operational pattern captured in canonical runtime state and shown retrievable for a relevant task
2. a fixture-backed validation script/test that creates reviewed/promoted patterns and proves retrieval behavior
3. a documented operator run showing promotion → retrieval end-to-end

## Recommendation
Treat Lane A as **partially advanced, not fully complete**.

### Completed in this pass
- clarified that source-level support exists
- reduced the risk that release docs are overstating unsupported logic
- identified the exact evidence gap blocking closure

### Next step to close Lane A
Create a minimal retrieval validation artifact using either:
- a real promoted pattern from live operational state
- or a controlled fixture/test harness that exercises promotion → retrieval directly
