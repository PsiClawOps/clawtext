# ME-001 — Durability Classifier (Additive)

Date: 2026-03-12
Change ID: ME-001
Status: merged (flagged)

## Objective
Introduce a low-risk durability classifier to improve promotion quality by distinguishing likely durable guidance from transient/ephemeral observations.

## Non-interference posture
- Additive only
- Default OFF
- No schema migration
- No behavior change unless flag enabled

## Feature flag
- `CLAWTEXT_DURABILITY_CLASSIFIER_ENABLED=true`
- Default: disabled

## Implementation scope
- New classifier module: `src/durability-classifier.ts`
- Optional integration point: `src/operational-promotion.ts`
  - used during proposal rationale + confidence computation
  - only active when feature flag is enabled

## Behavior (when enabled)
Classifier returns:
- `label`: durable | borderline | transient
- `score`: 0..1
- `reasons`: short explanation strings
- `adjustment`: confidence adjustment applied to promotion proposal

Integration effects:
- adds durability notes to proposal rationale
- slightly boosts/penalizes proposal confidence

## Impact map
- ClawDash impact: none (memory-internal only)
- ClawTask impact: none
- Continuity transfer impact: none
- Recall latency impact: none expected (promotion-time only)

## Rollback
Immediate disable:
- unset flag or set `CLAWTEXT_DURABILITY_CLASSIFIER_ENABLED=false`

Hard rollback:
- revert ME-001 commit touching classifier + promotion integration

## Why this order
ME-001 aligns with the adoption plan ordering: low-risk quality improvement before heavier retrieval/consolidation changes.
