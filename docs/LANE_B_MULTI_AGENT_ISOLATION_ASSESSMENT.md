---
doc: LANE_B_MULTI_AGENT_ISOLATION_ASSESSMENT
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# Lane B — Multi-Agent Isolation and Boundary Trust Assessment

## Purpose
Assess whether ClawText currently enforces private/shared/cross-agent memory boundaries strongly enough to support release-truth claims around multi-agent isolation.

## Summary
**Result:** base memory lane includes explicit isolation filtering, operational lane includes optional scope isolation, but durable end-to-end proof is still missing and the operational isolation behavior is not clearly default-on.

## Confirmed in source
### 1. Base memory lane has explicit visibility filtering
From `src/memory.ts` / `src/memory.js`:
- `shared` memories are broadly visible when shared retrieval is enabled
- `private` memories only return when `memory.agentId === options.agentId`
- `cross-agent` memories only return when `memory.targetAgent === options.agentId`

This is real source-level isolation logic, not just documentation.

### 2. Operational lane has scope isolation support
From `src/operational-retrieval.ts`:
- retrieval supports a scope-isolation mode behind `CLAWTEXT_SCOPE_ISOLATION_ENABLED=true`
- allowed scopes are narrowed by task type
- patterns can be filtered to only those allowed scopes

### 3. Evaluation tooling exists
From `scripts/eval-memory-evolution.mjs`:
- there is an evaluation scenario specifically for `scopeIsolation`
- this suggests multi-scope retrieval hardening was already being treated as a real feature/evaluation area

## Current gaps / limits
### Gap A — No explicit release-grade isolation test artifact found
During this pass, no dedicated regression/integration test was found that proves:
- agent A private memory is invisible to agent B
- cross-agent memory only reaches intended target agent
- shared memory remains visible as expected

So the code path looks meaningful, but the proof artifact is still missing.

### Gap B — Operational isolation appears optional, not guaranteed by default
Operational retrieval scope isolation is feature-flagged.

Implication:
- the operational lane may still be broader/noisier unless the scope-isolation flag is enabled
- release claims should avoid overstating strict operational-lane isolation unless default behavior or launch configuration is explicit

### Gap C — Docs are directionally correct, but stronger support wording is still needed
`docs/MULTI_AGENT.md` describes the intended architecture well.
However, release-grade confidence needs:
- explicit statement of what is currently guaranteed in base memory
- explicit statement of whether operational scope isolation is default, optional, or experimental
- explicit test/validation evidence

## Assessment
### What appears safe to say now
- ClawText has real multi-agent visibility concepts in source (`shared`, `private`, `cross-agent`)
- base memory retrieval includes explicit agent-context filtering
- operational scope isolation exists as a hardening capability

### What is not yet safe to claim strongly
- release-grade verified multi-agent isolation end-to-end
- strict operational-lane isolation as a universal always-on guarantee

## Recommendation
Treat Lane B as **partially advanced**.

### Completed in this pass
- confirmed that isolation is not merely aspirational in the base memory lane
- identified that operational isolation exists, but appears flag-gated
- narrowed the remaining gap to proof + launch/default-configuration clarity

### Needed to close Lane B
One of the following should be added:
1. integration test covering shared/private/cross-agent memory retrieval boundaries
2. validation script/artifact proving expected isolation behavior
3. explicit release note documenting current isolation guarantees and whether operational scope isolation is enabled by default

## Suggested release-truth wording for now
Prefer wording like:
- "ClawText supports shared, private, and cross-agent memory visibility with agent-context filtering in the base memory lane."
- "Operational retrieval also includes scope-isolation hardening, with launch configuration determining whether the stricter isolation mode is enabled."

Avoid stronger wording like:
- "fully verified multi-agent isolation across all lanes"

until a proof artifact exists.
