---
doc: PRD
version: 0.1.0
status: draft
owner: ClawText project
last_updated: 2026-03-16
---

# Product Requirements Document — ClawText 2.0+

## 1. Product summary
ClawText is the executable product-definition layer for durable memory, continuity, and operational learning in OpenClaw.

In this phase, the product being built and hardened is:
- a file-first memory plugin for OpenClaw
- a layered continuity system spanning hot context, durable memory, and continuity artifacts
- a bounded, reviewable operational-learning workflow that turns repeated failures into reusable guidance

## 2. Users and phase-specific problem
- **Primary user in this phase:** OpenClaw operators and teams running long-lived agent workflows
- **Secondary user:** engineers integrating memory/continuity into OpenClaw-adjacent systems
- **Problem being solved in this phase:** context fragmentation, repeated failures, and poor continuity across sessions, threads, and recovery surfaces
- **Why now:** ClawText already has substantial implementation and documentation; it needs a lifecycle-aware finish path to harden remaining gaps and complete release-quality execution under canon

## 3. Scope
### In scope now
- file-first memory capture and retrieval
- hybrid recall over durable memory
- multi-source ingest for docs/repos/JSON/thread artifacts
- operational learning capture, review, and promotion workflow
- continuity artifact generation for handoffs / bootstrap / recovery
- release hardening for retrieval correctness, isolation, and continuity consumption

### Out of scope now
- full execution/orchestration platform
- secrets, identity, or auth ownership
- graph-native relationship engine
- autonomous pattern promotion without review

### Deferred intentionally
- documentation / library lane for curated, queryable project knowledge
- deeper graph-native relationship retrieval
- broader org/tenant governance
- platform-native execution surfaces beyond existing contracts
- post-2.0 expansion beyond memory/continuity center of gravity

## 4. Core workflows
### Workflow A — Continue prior work with context in place
- **Trigger:** an agent resumes related work in a new session or thread
- **Steps:** retrieve relevant prior context → inject best-ranked memories → continue work with reduced re-explanation
- **Expected outcome:** fewer repeated questions, better continuity, faster productive continuation

### Workflow B — Promote repeated failures into guidance
- **Trigger:** the same failure or workaround pattern recurs enough times to justify review
- **Steps:** capture failure context → aggregate recurrence → review candidate → promote stable guidance → retrieve in future runs
- **Expected outcome:** future agents inherit proven workarounds instead of repeating the same mistakes

### Workflow C — Move work across surfaces without losing continuity
- **Trigger:** work must move to another thread, session, or recovery surface
- **Steps:** generate continuity artifact → preserve decisions/context/next steps → consume artifact in new surface
- **Expected outcome:** work resumes from a structured best-known state instead of a blank reset

## 5. Requirements
### Functional requirements
- retrieve relevant memory at prompt time with bounded token usage
- support ingest from repos/docs/JSON/thread-like sources
- preserve canonical file-first state under stable paths
- capture operational failures and review candidates
- generate continuity artifacts with enough structure to resume work
- expose health / maintenance commands and validation paths

### Non-functional requirements
- auditable and inspectable with plain files
- predictable failure behavior instead of silent corruption
- low-friction default operation for OpenClaw plugin users
- portable across repos/workspaces without black-box databases

### Constraints
- file-first state is non-negotiable
- memory must stay bounded and reviewable
- execution surfaces remain outside ClawText ownership
- promotion to durable guidance requires human review/policy gate

## 6. Acceptance / done
ClawText 2.0+ hardening is complete when:
- promoted operational patterns are retrievable end-to-end
- private/shared multi-agent isolation is verified
- continuity artifacts can be consumed end-to-end in a documented workflow
- invalid/stale continuity targets fail explicitly and safely
- documentation reflects supported behavior without drift

**Evidence expected:** validation scripts, documented test runs, milestone updates, and release-readiness notes in canonical docs.

## 7. Dependencies and risks
- **Dependency:** OpenClaw plugin/runtime compatibility
- **Dependency:** continued correctness of retrieval/indexing scripts and state paths
- **Risk:** strong docs but incomplete validation on a few critical edge cases
- **Risk:** package/version/public-story mismatch causing release confusion
- **Mitigation:** milestone-linked hardening, explicit boundaries, and lifecycle-aware enforcement

## 8. Implementation notes
- architecture/UX assumptions should continue respecting the layered memory model
- release hardening should prioritize proof of supported behavior over new feature expansion
- changes that alter retrieval semantics, isolation guarantees, or continuity contracts should escalate and update canon
- post-2.0 feature intake should update both `docs/NORTHSTAR.md` and this PRD so roadmap intent and executable product direction stay aligned

## 9. Post-2.0 feature intake — Documentation / Library Lane
### Feature summary
Add a dedicated library lane for curated, queryable project knowledge.

### Why it matters
Teams need agents to reference current repo state, architecture decisions, project status, and canonical docs without re-reading an entire repo or confusing reference material with conversational memory.

### Intended outcomes
- project-status questions resolve against curated library entries first
- architecture and repo-shape questions retrieve reviewed summaries before raw ingest
- source lineage stays visible and auditable
- library knowledge remains separate from operational patterns and continuity artifacts

### Initial implementation shape
- file-first storage under `state/clawtext/prod/library/`
- named library collections for trusted imported doc corpora
- curated Markdown entries with machine-usable metadata
- optional overlays for local/operator environment notes
- agent-led library import workflow backed by collection manifests
- separate retrieval weighting for reference-seeking questions
- refresh / stale / superseded workflow for collections and entries

### Non-goals for this phase
- no graph-native knowledge engine
- no autonomous promotion without review
- no collapse of the existing working-memory / ingest / operational-learning / continuity lanes

### Canonical design reference
See `docs/LIBRARY_LANE.md` for the current design draft.
