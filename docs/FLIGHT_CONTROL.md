---
doc: FLIGHT_CONTROL
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# ClawText Flight Control

## Purpose
Define bounded-autonomy execution rules for finishing and hardening ClawText inside a lifecycle-aware framework.

## Default posture
Agents may continue routine implementation, documentation sync, test writing, and evidence capture without constant interruption when work remains inside the current Northstar and PRD.

## Heartbeat policy
### Primary trigger
Send a heartbeat on meaningful batch completion.

### Timed fallback
If a run is long enough that silence creates operator uncertainty, emit timed heartbeats.

### Default timed interval
- **15 minutes**

### Configurability
Heartbeat timing may be adjusted at the project, lane, or run level.

## Escalate immediately for
- changes to ClawText strategic identity or product boundaries
- retrieval semantics that materially affect correctness or trust
- multi-agent isolation uncertainty
- continuity artifact spec changes
- architecture forks or major release-definition shifts
- blocked dependency or failing validation that prevents milestone progress

## Cross-lane acknowledgement
Cross-lane acknowledgement is required for:
- architecture changes
- milestone-impacting changes
- changes that alter another lane's assumptions, inputs, or outputs

Not required for routine isolated doc or code cleanup.

## Execution brief minimum
- lane / objective
- approved scope
- out of scope
- expected evidence
- cross-lane impact check
- heartbeat plan
- escalation triggers
- completion condition

## Completion handoff minimum
- what changed
- what evidence exists
- what remains open
- whether canonical docs were updated
- whether a decision record is needed

## Change routing during active runs
If new guidance or insight arrives mid-run, classify it before mutating canon.

Use:
- `docs/CHANGE_ROUTING.md`
- `docs/templates/CHANGE_INTAKE.md`
