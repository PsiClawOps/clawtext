# ClawText Operational Learning Lane

**Status:** Implemented through review, promotion, and scheduled maintenance  
**Version:** 1.3.0  
**Last Updated:** 2026-03-09

---

## Overview

ClawText adds a **third memory path** for operational learning:

1. **Working Memory** — Conversations, decisions, current state (existing)
2. **Knowledge Memory** — Repos, docs, imports (existing)
3. **Operational Learning** — Errors, fixes, successful patterns, self-improvement (NEW)

This lane captures **how the system itself behaves**, not just what the user is working on.

---


## Current Implementation Status

The operational learning lane is no longer just a design draft. Current implemented capabilities include:
- automatic operational retrieval gating on risky/operational tasks
- automatic tool/command failure capture via runtime hooks
- agent-owned review packets + review actions
- deferral-aware candidate maturation
- agent-owned promotion proposals and approval-gated apply flow
- scheduled maintenance/review orchestration

### Ownership model
- **automatic**: capture, retrieval gating, failure capture, scheduled execution once configured
- **agent-owned**: review, promotion, ingest, maintenance orchestration
- **user-discretion gated**: review approvals, promotion approvals, cadence approval when needed
- **backend/admin only**: raw CLI plumbing

### Activation / verification
This lane depends on ClawText being loaded as a plugin from the canonical path:
`~/.openclaw/workspace/skills/clawtext`

Verification:
```bash
openclaw plugins list
openclaw gateway status
```

Expected:
- `ClawText | clawtext | loaded`
- gateway running + RPC probe ok

## Why Separate?

Operational learning is fundamentally different from normal memory:

| Aspect | Normal Memory | Operational Learning |
|--------|--------------|---------------------|
| **Content** | "We chose Redis", "User prefers concise replies" | "Tool X fails when Y", "This pattern causes Z" |
| **Retrieval** | Every prompt (relevant context) | Only debugging, tool use, config work |
| **Injection** | Always when relevant | Never in normal chat |
| **Lifecycle** | Promoted to MEMORY.md, SOUL.md | Stays in operational lane, rarely promoted |
| **Noise Risk** | Low | High (raw errors are noise) |

**If you mix them:** Prompt quality degrades, operational patterns drown in project context, agents get confused.

**Separation keeps operational learning high-signal and actionable.**

---

## Data Model

### Entry Types

- `error-pattern` — Repeated failure with identifiable signature
- `anti-pattern` — Approach that consistently causes problems
- `recovery-pattern` — Successful fix/workaround
- `success-pattern` — Workflow that works reliably
- `optimization` — Performance or efficiency improvement
- `capability-gap` — Repeated request for missing capability

### Required Fields

```yaml
patternKey: string          # Stable identifier, e.g. "tool.exec.invalid_workdir"
type: enum                 # error-pattern, anti-pattern, etc.
summary: string            # One-line description
symptom: string            # What you see (error message, behavior)
trigger: string            # What causes it (context, inputs)
rootCause: string          # Why it happens
fix: string                # How to resolve/avoid
scope: enum                # tool, agent, project, gateway, global
confidence: number         # 0.0–1.0, how certain we are
recurrenceCount: number    # How many times observed
firstSeenAt: timestamp
lastSeenAt: timestamp
status: enum               # raw, candidate, reviewed, promoted, archived
evidence: array            # Links, log snippets, session refs
```

### Optional Fields

```yaml
relatedPatterns: array     # Links to related patternKeys
promotedTo: string         # If promoted, where (SOUL.md, TOOLS.md, etc.)
promotedAt: timestamp
tags: array                # For grouping/filtering
```

---

## Storage Layout

```
memory/
├── operational/
│   ├── raw/              # Captured events (unprocessed)
│   │   └── YYYY-MM-DD/
│   │       └── *.yaml
│   ├── candidates/       # Synthesized patterns awaiting review
│   │   └── *.yaml
│   ├── patterns/         # Reviewed, stable patterns
│   │   └── <category>/
│   │       └── *.yaml
│   └── archive/          # Deprecated, superseded, or noise
│       └── *.yaml
└── operational-index.json  # Lookup table for patternKey → file
```

**Why YAML?** Human-readable, easy to edit, version-control friendly.

**Why separate directories?** Clear lifecycle stages, easy to query by status.

---

## State Workflow

```
raw → candidate → reviewed → promoted → archive
         ↓          ↓
       (merge)   (reject)
```

### States

**raw** — Captured event, not yet analyzed
- Source: hooks, wrappers, manual entry
- Recurrence count: 1
- No patternKey yet (or auto-generated)

**candidate** — Synthesized from 2+ similar raw events
- PatternKey assigned
- Root cause hypothesized
- Fix proposed
- Awaiting human review

**reviewed** — Approved as valid pattern
- PatternKey stable
- Confidence assigned
- Ready for retrieval

**promoted** — Broadly applicable, moved to workspace guidance
- May appear in SOUL.md, TOOLS.md, AGENTS.md
- Still tracked in operational lane for updates

**archived** — Superseded, no longer relevant
- Kept for historical reference
- Not retrieved

---

## Capture Pipeline

### Sources

1. **Tool failures** — exec errors, API errors, timeout errors
2. **Command failures** — Shell commands that fail repeatedly
3. **Retries** — Same action attempted 3+ times
4. **Compaction issues** — Context overflow, compaction failures
5. **User corrections** — "No, that's not right" responses
6. **Health degradations** — Performance drops, cache misses
7. **Manual entry** — `npm run operational:capture:error`

### Capture Methods

**Hook-based (preferred):**
- `tool:failure` — When any tool call fails
- `command:failure` — When exec fails
- `gateway:compaction-failure` — When compaction errors
- `health:degradation` — When metrics drop

**Wrapper-based:**
- Wrap internal ClawText workflows (cluster rebuild, RAG injection, etc.)
- Log failures to operational lane

**Manual:**
- CLI commands for operator entry
- Useful for patterns discovered outside system

---

## Aggregation & Synthesis

### Raw → Candidate

**Trigger:** Similar events repeat (2-3 occurrences)

**Process:**
1. Group by signature (error code, message pattern, tool name)
2. Increment recurrence count
3. Merge evidence
4. Generate patternKey (if not present)
5. Create candidate entry

**Thresholds:**
- 1 occurrence → raw
- 2-3 similar → candidate
- 4+ → candidate with urgency flag

### Candidate → Reviewed

**Trigger:** Human review (or auto-review for high-confidence patterns)

**Review questions:**
- Is this a real pattern or noise?
- Is the root cause correct?
- Is the fix actionable?
- Should this be promoted?

### Reviewed → Promoted

**Trigger:** Pattern is broadly applicable

**Examples:**
- "Tool X always fails with Y" → TOOLS.md
- "This gateway config causes Z" → AGENTS.md
- "User prefers approach A over B" → SOUL.md

---

## Retrieval Policy

### When to Query Operational Memory

**YES — Query:**
- Debugging
- Tool-heavy tasks
- Command execution
- Config changes
- Gateway/plugin work
- Deployment/recovery
- Repeated failure contexts

**NO — Don't Query:**
- Normal chat
- General writing
- Simple factual queries
- Unrelated project planning
- Creative work

### Retrieval Strategy

**Separate from normal memory:**
- Query operational lane independently
- Merge results only when task classification says relevant
- Boost by:
  - tool name match
  - error signature match
  - patternKey match
  - scope match
  - recurrence count

**Injection rules:**
- Only operational memories with status `reviewed` or `promoted`
- Only when task classification matches scope
- Only if patternKey or symptom matches context
- Never inject raw or candidate memories

---

## Non-Goals (v1.4–1.6)

**We are NOT doing:**
- Dumping raw logs into prompt memory
- Auto-generating code from patterns
- Self-writing extensions
- Unconditional injection into every prompt
- Blurring operational memory with project memory
- Full automation without review

**Why:** These are Foundry's domain, not ClawText's. ClawText is the memory platform; Foundry is the meta-extension. They can complement each other, but shouldn't be merged yet.

---

## Operator Tooling

### Commands

```bash
# Status
npm run operational:status

# Review queue / agent-facing packet
npm run operational:review
npm run operational:review:packet -- 5
npm run operational:review:apply -- approve 1 "Looks stable now"

# Show promotion proposal / apply promotion
npm run operational:promote -- <patternKey>
npm run operational:promote:apply -- <patternKey>

# Search operational memories
npm run operational:search -- "compaction failure"

# Manual capture
npm run operational:capture:error
npm run operational:capture:success

# Transfer check (before complex task)
npm run operational:transfer-check -- "deploying gateway config"

# Scheduled maintenance
npm run operational:maintenance:status
npm run operational:maintenance:run review-digest
```

### Health Report Additions

```bash
npm run health
# Output now includes:
# - Operational raw backlog: X
# - Operational candidate backlog: Y
# - Top recurring patterns: [list]
# - Unresolved high-priority issues: [list]
# - Promoted patterns this week: [list]
```

---

## Integration Points

### With Existing ClawText

**Hot Cache:**
- Operational patterns can be cached separately
- High-recurrence patterns get sticky TTL

**Clusters:**
- Operational memories form their own cluster(s)
- Not mixed with project clusters

**RAG Injection:**
- Separate retrieval path
- Merged only when task classification matches

**Curation:**
- Same promotion workflow (raw → candidate → reviewed → promoted)
- But promoted operational patterns go to different targets (SOUL/TOOLS/AGENTS)

### With Foundry (Future)

**Foundry can:**
- Read operational patterns as "learning material"
- Use patterns to guide code generation
- Crystallize high-confidence patterns into hooks/tools

**ClawText can:**
- Store patterns Foundry discovers
- Track pattern recurrence
- Provide retrieval for Foundry's transfer checks

**Integration point:** Shared operational memory lane, separate code-generation logic.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Noise explosion from raw errors | Separate lane, candidate review, recurrence thresholds |
| Over-injecting into normal prompts | Strict retrieval policy, task classification |
| Duplicate patterns with different wording | PatternKey normalization, merge on review |
| Review backlog too large | Auto-aggregate, prioritize by recurrence |
| Operational memory becomes diagnostics dumpster | Clear scope definition, status workflow |

---

## Phase Status

Completed:
- Phase 2: Data model + storage
- Phase 3: Capture pipeline
- Phase 4: Aggregation + synthesis
- Phase 5: Review workflow
- Phase 6: Retrieval + injection policy + runtime gating
- Phase 7B: Agent-owned review UX
- Phase 7C: Agent-owned promotion workflow
- Scheduled maintenance / review orchestration

Current documentation phase:
- activation path
- allowlist / enablement story
- restart / verification story
- ownership model

Remaining:
- final rollout / publication polish

---

## References

- **Community patterns:** self-improving-agent, metaskill
- **Foundry:** openclaw-foundry (separate system, future integration)
- **Memory Braid:** Hybrid recall merge patterns
- **OpenClaw hooks:** docs.openclaw.ai/automation/hooks

---

**Status:** Design complete, ready for implementation  
**Owner:** ragesaq + agent team  
**Timeline:** v1.4–v1.6 (3 releases)
