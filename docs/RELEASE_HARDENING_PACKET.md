---
doc: RELEASE_HARDENING_PACKET
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# ClawText Release Hardening Packet

## Purpose
Convert ClawText from a successfully retrofitted project into a finished, release-hardened product under ClawTomation control.

This packet identifies the remaining finish work, groups it into execution lanes, and defines what evidence is needed before release claims can be treated as complete.

## Finish criteria
ClawText is considered finish-ready when all of the following are true:
- promoted operational patterns are retrievable end-to-end
- multi-agent memory isolation is verified
- continuity artifacts can be consumed end-to-end in a documented workflow
- invalid/stale continuity targets fail explicitly and safely
- version/package/public story alignment is clear
- canonical docs match supported behavior and evidence

## Hardening lanes

### Lane A — Retrieval correctness and operational promotion
**Goal:** prove that promoted patterns are retrievable and operational learning closes the loop.

**Work includes:**
- verify promotion → retrieval path with a real promoted pattern
- document any gap between reviewed vs promoted retrieval behavior
- fix or document ranking behavior if promoted patterns are not surfaced correctly

**Evidence required:**
- validation run or test proving promoted patterns surface in retrieval
- milestone note confirming actual supported behavior

**Current assessment:**
- source path appears to support both reviewed and promoted retrieval
- a real fixture/live proof artifact is still required to close the lane

### Lane B — Multi-agent isolation and boundary trust
**Goal:** prove private/shared memory behavior does not leak across agents incorrectly.

**Work includes:**
- inspect current isolation/filtering behavior
- write or run explicit isolation verification test
- document supported shared/private/cross-agent boundaries

**Evidence required:**
- test or verification artifact showing isolation behavior
- docs updated if current behavior is narrower than implied

### Lane C — Continuity artifact consumption
**Goal:** prove continuity artifacts are not only generated, but usable end-to-end.

**Work includes:**
- define the artifact consumption contract clearly
- run one end-to-end continuity handoff/consumption test
- document failure behavior for invalid or stale targets

**Evidence required:**
- end-to-end artifact consumption demonstration
- explicit docs covering supported and unsupported continuity behaviors

### Lane D — Release truth alignment
**Goal:** remove any mismatch between package version, release framing, and publication narrative.

**Work includes:**
- reconcile package version vs product-version language
- confirm README, POST_BRIEF, and release docs say the same thing
- update milestone/publication language where necessary

**Evidence required:**
- aligned docs across README + POST_BRIEF + release docs
- explicit note on versioning semantics if dual-version framing remains

### Lane E — Final publication readiness
**Goal:** make outward-facing release messaging fully evidence-backed.

**Work includes:**
- refresh POST_BRIEF from current canon
- ensure README and public claims reflect the real hardening state
- identify which proof statements are measured vs estimated

**Evidence required:**
- updated POST_BRIEF
- publication-ready README alignment
- no unsupported release claims remaining

## Recommended execution order
1. Lane D — Release truth alignment
2. Lane A — Retrieval correctness and operational promotion
3. Lane B — Multi-agent isolation and boundary trust
4. Lane C — Continuity artifact consumption
5. Lane E — Final publication readiness

## Why this order
- release truth should be cleaned up early so the team knows exactly what is being finished
- retrieval correctness and isolation are core trust issues
- continuity consumption is a core promise and should be proven before final publication push
- publication should be last so it reflects actual validated truth

## Execution rules
- use `docs/templates/EXECUTION_BRIEF.md` for each lane
- use `docs/templates/COMPLETION_HANDOFF.md` at lane completion
- update `docs/MILESTONES.md` when a lane materially changes finish-state truth
- route new operator guidance through `docs/CHANGE_ROUTING.md`
- escalate immediately for strategic/boundary contradictions

## Immediate next recommended lane
**Lane D — Release truth alignment**

Reason:
- it is the fastest path to clearer operator confidence
- it reduces ambiguity before deeper validation work
- it may simplify downstream publication hardening
