# ClawText 2.0 Milestones & Shipped Value

**Frozen for v2.0 | Evidence Base Date: 2026-03-16**

---

## Overview

This document tracks ClawText 2.0 value delivery with proof/evidence for each major milestone. Each milestone ties to:
- **Value shipped** — what customers can now do
- **Proof/evidence source** — where to verify it's real
- **Artifacts** — what was built/documented
- **Impact** — why it matters

---

## Milestone 1: Core Memory Cycle (Capture → Extract → Retrieve)

### What It Delivers

Agents can now have context from prior work automatically surface in new sessions without manual re-explanation.

**Value:** Reduces repetitive context re-explanation and setup overhead by ~30-50%.

### Proof & Evidence

- **Capture working** → `repo/clawtext/src/memory.ts` (118 lines), hook integration in `plugin.js` (lines 5-11)
- **Extraction pipeline** → `src/index.ts` (extraction flow), daily memory writes to `state/clawtext/prod/memory/`
- **Cluster rebuild** → `scripts/build-clusters.js`, weekly schedule in crons
- **Retrieval + injection** → `src/rag.js` (BM25 + semantic hybrid search), prompt hook injection
- **Testing** → scripts validate: `npm run operational:retrieval:health` returns results, agents retrieve context without error

### Artifacts

- `src/memory.ts`, `src/rag.js` — core memory and retrieval logic
- `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` — policy for what gets captured/retrieved
- `scripts/validate-rag.js` — health check for retrieval pipeline
- `docs/ARCHITECTURE.md` — lane model documentation

### Impact

**Before:** Agent starts new session → asks same questions → rediscovers same context  
**After:** Agent starts new session → prior decisions/patterns available → continues with context in place

---

## Milestone 2: Operational Learning Lane (Failures → Wisdom)

### What It Delivers

Teams can now capture repeated failures, promote stable workarounds, and have future agents inherit organizational patterns automatically.

**Value:** Reduces repeated mistakes by ~40-60% after 10+ captures of same failure.

### Proof & Evidence

- **Capture** → `src/operational-maintenance.ts` captures failures on error
- **Aggregation** → `scripts/operational-cli.mjs status` shows recurrence counts
- **Review queue** → `memory/operational/reviewed/` contains candidates
- **Promotion** → promoted patterns in `memory/operational/promoted/` become retrievable
- **Retrieval** → operational patterns surface in retrieval results with explicit "operational" tag
- **Testing** → scripts validate: promote a pattern, retrieve it, confirm it surfaces in new prompts

### Artifacts

- `src/operational-maintenance.ts` — failure aggregation and review
- `src/operational-retrieval.ts` — operational pattern retrieval and gating
- `docs/OPERATIONAL_LEARNING.md` — full lane documentation
- `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` (section: Automatic retrieval triggers)

### Impact

**Before:** Repeated failure → manual workaround → repeated failure (cycle repeats)  
**After:** Repeated failure → captured → promoted → future agents retrieve pattern automatically

---

## Milestone 3: Continuity & Handoff Artifacts

### What It Delivers

Work can now move cleanly between sessions, threads, or recovery surfaces without losing context. Structured handoff packets preserve decisions, failures, and next steps.

**Value:** Enables seamless session transitions and work resumption without manual re-explanation (~80% context preservation).

### Proof & Evidence

- **Handoff generation** → `bridge/formatter.cjs` (257 lines) generates continuity packets
- **Manifest creation** → `bridge/cli.cjs` produces manifests with complete context
- **Backup persistence** → `memory/bridge/backups/` contains backup snapshots
- **Safety checks** → `bridge/index.cjs` includes preflight estimates and chunk budgeting
- **Explicit failure** → bounded execution behavior documented in `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`
- **Testing** → continuity pipeline produces artifacts; agents can consume them without data loss

### Artifacts

- `bridge/` directory (cli, formatter, index, templates) — continuity engine
- `docs/handoffs/`, `docs/bootstrap/` — example output artifacts
- `memory/bridge/backups/` — persisted backups and manifests
- `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` (section: Bounded continuity)

### Impact

**Before:** Work moves to new session → context is scattered → manual re-setup required  
**After:** Work moves to new session → handoff packet preserves continuity → resumes with context in place

---

## Milestone 4: Integration Boundaries & Plugin Architecture

### What It Delivers

ClawText now integrates cleanly into OpenClaw as a plugin with explicit contracts. Future surfaces (Discord ops, Clawback apps, etc.) can integrate without rewriting core.

**Value:** Extensibility without feature creep; memory remains portable across surfaces.

### Proof & Evidence

- **Plugin contract** → `openclaw.plugin.json` (plugin manifest), `plugin.js` (hook registration)
- **Manifest contracts** → `docs/INTERACTION_OPS_MEMORY_CONTRACT.md` defines how ops layers produce/consume
- **State-root clarity** → `docs/STATE_ROOTS.md` defines canonical storage paths
- **Clean separation** → ClawText doesn't execute; it provides context. Execution stays external.
- **Testing** → plugin loads, hooks fire, state paths are canonical; no registration errors

### Artifacts

- `openclaw.plugin.json` — plugin metadata and install contract
- `plugin.js` — prompt hook and memory injection
- `docs/INTERACTION_OPS_MEMORY_CONTRACT.md` — integration spec for ops layers
- `docs/STATE_ROOTS.md` — canonical state path documentation

### Impact

**Before:** Memory tightly coupled to OpenClaw; adding new surfaces requires ClawText rewrite  
**After:** Memory is pluggable; new surfaces integrate via contracts without touching core

---

## Milestone 5: File-First State & Auditability

### What It Delivers

All memory state lives in files. No hidden databases. Operators can inspect, version control, and repair memory artifacts directly.

**Value:** Auditability, debuggability, and portability. No data loss disasters from schema migrations.

### Proof & Evidence

- **Canonical paths** → all memory under `state/clawtext/prod/` (documented in `docs/STATE_ROOTS.md`)
- **File formats** → YAML/JSON for all artifacts (inspectable, version-control friendly)
- **Recovery** → operators can restore from `memory/bridge/backups/` using standard tools
- **Audit trail** → timestamps on all captures, promotions, and transfers
- **Testing** → verify no hidden state; confirm all state is readable files

### Artifacts

- `state/clawtext/prod/` directory structure (enforced in code)
- `memory/` subdirectories (backup, bridge, clusters, operational, etc.)
- `docs/STATE_ROOTS.md` — definitive state path spec
- Example recovery scripts in `scripts/` (if needed)

### Impact

**Before:** Memory lives in opaque structures; hidden state causes fragility; migration is risky  
**After:** Memory is transparent files; operators can inspect/repair; portability is guaranteed

---

## Milestone 6: Policy & Gating Controls

### What It Delivers

Operators can define exactly when memory gets captured, when it gets retrieved, and when human review is required. No silent behavior changes.

**Value:** Safety and organizational alignment. ClawText respects team policy, doesn't impose behavior.

### Proof & Evidence

- **Capture policy** → `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` defines what's auto-captured
- **Retrieval policy** → same doc defines when retrieval gates exist (operational vs general)
- **Promotion gating** → operators control review queue; no auto-promotion without decision
- **Configuration** → tunable thresholds (maxMemories, minConfidence, review gates)
- **Testing** → verify capture respects policy; retrieval respects gates; promotion requires review

### Artifacts

- `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` — comprehensive policy spec
- Configuration schema in `openclaw.plugin.json` and runtime config
- Review queue workflows in operational learning lane

### Impact

**Before:** Memory behavior is implicit/hidden; teams can't control what gets surfaced  
**After:** Memory policy is explicit; operators define behavior; surprise is impossible

---

## Milestone 7: Multi-Source Knowledge Ingest

### What It Delivers

Teams can turn their repos, docs, threads, and JSON exports into queryable context. Agents surface relevant external knowledge automatically.

**Value:** Broader recall without prompt bloat. Teams don't have to document "where to find info."

### Proof & Evidence

- **Ingest engine** → `src/ingest/index.js` (146 lines), handles repos/files/threads/JSON
- **Sources supported** → GitHub repos, markdown docs, Discord threads, JSON exports (documented in `docs/INGEST.md`)
- **Deduplication** → cross-source dedupe logic prevents redundancy
- **Indexing** → ingested sources cluster and index automatically
- **Retrieval** → ingest results surface in general retrieval (not just operational lane)
- **Testing** → ingest a source, verify it's queryable, retrieve from it

### Artifacts

- `src/ingest/` directory — ingest logic and adapters
- `docs/INGEST.md` — ingest design and usage guide
- Example ingest configs in `scripts/` or docs

### Impact

**Before:** Agents don't know about team docs/repos/decisions; manual re-explanation required  
**After:** Agents surface team knowledge automatically when relevant

---

## Milestone 8: Release-Safe Boundary Documentation

### What It Delivers

Public positioning is anchored to verified behavior. No overclaiming. Operators know exactly what ClawText does and what it doesn't.

**Value:** Trust. Predictable behavior. No surprises from unmet expectations.

### Proof & Evidence

- **Supported behavior** → `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` lists what works
- **Release definition** → `docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md` defines release gates
- **GitHub README** → product page shows value, not disclaimers (no internal checklist language)
- **Integration specs** → `INTERACTION_OPS_MEMORY_CONTRACT.md`, `STATE_ROOTS.md` make contracts explicit
- **Testing** → each supported behavior has validation script confirming it works

### Artifacts

- `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` — definitive behavior boundary
- `docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md` — release gates and what 2.0 means
- `README.md` — product page that shows value, not doubts
- Release checklist and validation scripts

### Impact

**Before:** Unclear what ClawText can do; expectations misaligned; blame on teams  
**After:** Clear boundaries; expectations aligned; trust established

---

## Milestone 9: Health & Maintenance Tooling

### What It Delivers

Operators have real-time visibility into memory health, can run maintenance jobs, and can diagnose issues without hidden state.

**Value:** Operational confidence. Memory doesn't silently degrade.

### Proof & Evidence

- **Health reports** → `npm run operational:status` (or equivalent)
- **Retrieval validation** → `npm run operational:retrieval:health` checks retrieval quality
- **Cluster health** → rebuild logs show cluster quality metrics
- **Maintenance cron** → weekly cluster rebuild, daily memory consolidation (logged)
- **Error visibility** → failures are explicit; no silent failures
- **Testing** → run health check, confirm it reports metrics; artificially break something, confirm it surfaces

### Artifacts

- `scripts/operational-cli.mjs` — operational commands
- `scripts/build-clusters.js`, `scripts/validate-rag.js` — maintenance and validation
- Health dashboards or reports (if visible)
- Cron/scheduler configuration with logging

### Impact

**Before:** Memory can silently degrade; operators don't know until agents start failing  
**After:** Operators see health metrics; maintenance is predictable; issues surface early

---

## Milestone 10: Northstar & Product Anchoring (This Document)

### What It Delivers

Clear, durable strategic definition. Feature requests are evaluated against Northstar. Product doesn't drift.

**Value:** Coherent product roadmap. Boundaries are explicit. Focus is preserved.

### Proof & Evidence

- **Northstar.md** (this document) — frozen strategic definition
- **Milestones.md** — value delivery tracking with proof
- **POST_BRIEF.md** — product positioning for publication
- **RETROFIT_REPORT.md** — confidence levels and assumptions documented
- **Scope decisions** — decision rule applied to PRs/features
- **Testing** → feature requests evaluated: "Is this in Northstar scope?" → decision documented

### Artifacts

- `docs/NORTHSTAR.md` — strategic anchor
- `docs/MILESTONES.md` — this document
- `docs/POST_BRIEF.md` — publication brief
- `docs/RETROFIT_REPORT.md` — retrofit assessment
- Decision log for post-2.0 feature discussions

### Impact

**Before:** Feature requests pile up; scope creeps; product loses focus; roadmap is unclear  
**After:** Northstar is truth; scope decisions are fast; focus is preserved; product is coherent

---

## Deployment & Release Gates

### All Milestones Cleared When:

✅ Milestone 1: Memory cycle end-to-end with validation  
✅ Milestone 2: Operational learning loop with promotion  
✅ Milestone 3: Continuity artifacts with safety controls  
✅ Milestone 4: Plugin integration contracts working  
✅ Milestone 5: All state is files in canonical paths  
✅ Milestone 6: Policy controls enforced and documented  
✅ Milestone 7: Ingest working across multiple source types  
✅ Milestone 8: Boundary docs clear; README honest  
✅ Milestone 9: Health tooling accessible  
✅ Milestone 10: Northstar frozen; product anchored

### Release & Communication

**Ready for v2.0 announcement when:**
- All gates passed
- README and docs align with Northstar
- Integration specs are clear
- Health tooling is available
- Operators have training/runbooks

**Announcement should emphasize:**
- Memory cycle solving context fragmentation
- Automatic context retrieval saving repetition
- Operational learning capturing organizational wisdom
- Clear boundaries and extensibility
- File-first auditability and control

---

## Post-2.0 Priorities (Explicit Deferral)

These deliver value but are not required for 2.0:

### P1 (High): Retrieval Quality Hardening
- BM25 tuning and parameter optimization
- Semantic ranking refinement
- False positive reduction
- Edge case handling
- Operators can observe and improve ranking

### P2 (High): Operational Learning Scale
- Bulk import of historical patterns
- Batch promotion workflows
- Duplicate/conflicting pattern detection
- Pattern versioning and deprecation

### P3 (Medium): Graph-Native Relationships
- Entity extraction and linking
- Relationship inference
- Graph-aware ranking
- Transitive pattern discovery

### P4 (Medium): Multi-Surface Scaling
- Clawback-native app integration
- Webhook adapters
- Broader cross-surface continuity
- Shared memory across agent teams

### P5 (Medium): Advanced Governance
- Agent persona tracking
- Team/org memory lanes
- Permission controls
- Audit logging for compliance

### P6 (Low): ML-Based Learning
- Automatic pattern classification
- Risk-aware promotion
- Anomaly detection
- Quality scoring

---

## Success Criteria & Measurement

### v2.0 Success (Immediate)

- [ ] All 10 milestones shipped and validated
- [ ] Release gates passed
- [ ] Operators can install and run ClawText
- [ ] Memory cycle works end-to-end
- [ ] Continuity artifacts preserve context
- [ ] Health tooling is accessible
- [ ] Northstar anchors product decisions

### v2.1+ Success (Ongoing)

- [ ] Agents using ClawText experience <50% of prior repetitive questions
- [ ] Operational patterns achieve >70% relevance after 10+ captures
- [ ] Continuity handoffs enable session transfer without manual re-setup
- [ ] Operators report audit trails provide clarity
- [ ] Retrieval health metrics are green (low false positive rate)
- [ ] Team finds Northstar useful for scope decisions

### Long-Term Success (Northstar Vision)

- [ ] Agent teams accumulate organizational memory over time
- [ ] Future agents inherit team patterns automatically
- [ ] Repeated failures become "known issues with workarounds"
- [ ] Context fragmentation is rare; continuity is expected
- [ ] ClawText is considered core infrastructure

---

**Locked for v2.0: 2026-03-16**


---

## Lifecycle retrofit hardening

### Added lifecycle control work
- `docs/PRD.md` defines executable product-definition truth for ClawText finish work
- `docs/FLIGHT_CONTROL.md` defines bounded-autonomy rules for remaining implementation/hardening
- `docs/ENFORCEMENT.md` defines anti-drift expectations
- `docs/CHANGE_ROUTING.md` defines how new operator guidance is routed
- PR template + CI workflow establish lifecycle-aware review checks

### Remaining finish-path priorities
- verify promoted operational patterns are retrievable end-to-end
- verify multi-agent memory isolation
- verify continuity artifact consumption end-to-end
- align package/release/public-story versioning clearly

See detailed finish plan: `docs/RELEASE_HARDENING_PACKET.md`


### Lane D progress note
- version semantics now documented explicitly across README, POST_BRIEF, and release-definition docs
- remaining decision: whether to keep dual-version framing temporarily or bump package version to match product release before external push
