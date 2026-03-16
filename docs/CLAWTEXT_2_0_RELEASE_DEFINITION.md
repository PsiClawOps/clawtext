# ClawText 2.0 Release Definition

**Status:** Internal release-definition note  
**Purpose:** Define what ClawText 2.0 is, what is included, what is explicitly deferred, and what must be true before calling the release good.

---

## Version semantics

For release-truth purposes, distinguish between:
- **Product/release boundary:** ClawText 2.0
- **Current package version:** `@openclaw/clawtext` 1.5.0

This is acceptable temporarily if docs are explicit and do not misrepresent the package tag.
If the team wants a single-version story, bump the package version to match before external publication.

## Release intent

ClawText 2.0 is the point where ClawText becomes a coherent, trustworthy memory system rather than a collection of promising memory features.

The goal is not to make ClawText everything an agent platform could be.
The goal is to ship a practical, automatic, reviewable system for:
- memory capture
- continuity preservation
- operational learning
- durable retrieval

---

## One-line definition

**ClawText 2.0 is a layered memory and continuity system for agents that automatically captures durable context, retrieves relevant knowledge at the right time, and learns operationally from repeated failures and successful workflows.**

---

## What 2.0 includes

### 1. Stable runtime/plugin behavior

2.0 includes a ClawText plugin that:
- loads correctly in OpenClaw
- registers the prompt-build hook correctly
- performs memory injection without runtime registration errors
- has a coherent install story for published install and local linked development

### 2. Canonical installation contract

2.0 includes a clear installation story:
- published/user install: `openclaw plugins install @openclaw/clawtext`
- local dev install: `openclaw plugins install --link /path/to/clawtext`

`~/.openclaw/workspace/skills/clawtext` may exist as a linked alias or convenience path, but it is not the canonical install contract.

### 3. Canonical state-rooted storage

2.0 includes a clear runtime-owned storage model under:
- `state/clawtext/prod/...`

This includes:
- extraction buffer/state
- operational memory state
- runtime-owned mutable artifacts

Legacy paths may exist as compatibility shims, but the canonical model is state-rooted.

### 4. Working memory cycle

2.0 includes a full working memory cycle that is actually operating:
- capture
- extraction
- daily memory write
- cluster rebuild
- retrieval/injection

The memory cycle does not need to be perfect, but it must be working, testable, and non-silent when it fails.

### 5. Operational learning lane

2.0 includes a functioning operational lane with:
- capture of failures and successful workflows
- recurrence aggregation
- review queue
- promotion flow
- retrieval of operational guidance

This includes visibility for both reviewed and promoted operational patterns.

### 6. Memory policy / trigger contract

2.0 includes a documented behavioral contract for:
- what gets captured automatically
- what gets retrieved automatically
- what is reviewed
- what gets promoted
- when the system asks for user judgment

This is represented by the memory policy and trigger contract.

### 7. Extensible interaction-ops memory integration

2.0 includes a clean separation between:
- external interaction-surface execution systems
- ClawText's memory/continuity role

This means ClawText can consume normalized manifests and artifacts from:
- Discord/forum operations
- future Clawback-native app surfaces
- other adapters later

without becoming the execution engine itself.

### 8. Safer continuity / bridge behavior

2.0 includes bounded continuity tooling behavior:
- backup creation
- manifest capture
- chunk budgeting / estimate-first safety
- safer failure behavior
- no silent destructive fallback behavior

This does **not** require perfect Discord transport semantics, but it does require predictable and bounded behavior.

---

## What 2.0 does not require

### 1. Full identity platform scope

2.0 does not require ClawText to become:
- a full agent identity layer
- a full secrets/auth platform
- a complete protocol for portable agents

### 2. Perfect graph-native retrieval

2.0 does not require relationship tracking or graph traversal to be deeply integrated into retrieval.

Lightweight/manual relationship support is acceptable in 2.0, provided we do not overclaim it.

### 3. A standalone daemon/platform architecture

2.0 does not require:
- a standalone daemon
- SDK ecosystem
- full multi-surface platform abstraction beyond the documented contracts

### 4. Perfect Discord/forum ops execution

2.0 does not require ClawText to solve all Discord execution quirks.

Interaction execution should be handled by the dedicated ops layer.
ClawText only needs a clean memory-side integration contract and safe bounded behavior where continuity tooling is involved.

### 5. Marketing-perfect GitHub/docs copy

2.0 does not require the final polished publication pass.
That can and should happen after the technical release definition is satisfied.

---

## Explicitly deferred beyond 2.0

These are good future directions, but they are not required to call 2.0 complete:

- deeper relationship-aware retrieval
- richer graph traversal in runtime retrieval
- broader identity-layer features
- more ambitious multi-surface SDK/platform work
- full trust/auth/secrets governance inside ClawText itself
- highly polished public positioning language
- broader ClawHub/GitHub packaging refinement

---

## Known limitations acceptable in 2.0

See also: [`CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`](./CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md) for the concrete supported-behavior boundary validated during the release wrap-up.

The following limitations are acceptable if they are documented honestly:

1. **Relationship tracking is still lightweight**
   - useful as curation support
   - not yet a major retrieval engine

2. **Surface execution reliability may vary outside ClawText**
   - especially for Discord/forum ops transport details
   - ClawText should document integration expectations, not absorb those semantics

3. **Compatibility shims may remain temporarily**
   - especially for legacy paths and archived artifacts
   - as long as canonical state-root behavior is clear

4. **Operational retrieval ranking may continue to be tuned**
   - as long as promoted/reviewed patterns are visible and useful

---

## Release gates

Before calling ClawText 2.0 ready, these should be true.

### Gate A — Runtime integrity
- plugin loads cleanly
- no constructor/export registration error
- hooks are active
- cron jobs are present and usable

### Gate B — Memory cycle integrity
- extraction buffer path is canonical
- extraction writes into daily memory
- cluster rebuild works
- retrieval/injection works on live queries

### Gate C — Operational lane integrity
- capture works
- aggregation works
- review works
- promotion works
- reviewed/promoted retrieval works
- legacy operational corpus is visible from canonical state root

### Gate D — Continuity safety integrity
- continuity tooling produces backups/manifests
- estimate-first safety exists
- unsafe oversized runs are blocked unless explicitly overridden
- failure behavior is bounded and visible

### Gate E — Documentation integrity
- install story is consistent
- memory policy/trigger contract exists
- interaction-ops memory contract exists
- state-root story is coherent enough for operators

---

## Release narrative for internal use

If the above is true, the internal 2.0 story is:

- ClawText is now a coherent layered memory system
- it captures and retrieves memory automatically
- it preserves continuity across work
- it learns operationally from repeated experience
- it does this with bounded, reviewable behavior
- and it has clean integration boundaries for future surfaces like Clawback-native app operations

---

## Practical decision rule

If a proposed feature improves:
- automatic memory quality
- continuity reliability
- operational learning quality
- review/promote clarity
- clean integration boundaries

it is likely in-scope for 2.0.

If it mainly expands ClawText into:
- identity platform scope
- full execution/orchestration platform scope
- heavy protocol/platform ambition
- public polish without technical necessity

it is likely post-2.0.

---

## Short internal summary

**ClawText 2.0 should mean:**
- technically coherent
- operationally useful
- automatically helpful
- reviewable and bounded
- extensible across future interaction surfaces

It should **not** mean “we attempted to solve every adjacent agent-platform problem before shipping.”
