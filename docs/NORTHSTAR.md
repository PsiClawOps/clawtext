# ClawText Northstar — Strategic Definition

**Owner:** ClawText project | **Version:** 2.0 | **Status:** Frozen for v2.0 release | **Last Updated:** 2026-03-16

---

## I. Mission & Core Identity

### Mission

Make agents more useful by turning fragmented context into durable, retrievable, and automatically surfaced memory — so agents continue with continuity instead of restarting from zero.

### Problem We Solve

Long-running agent work fails not because models are incapable, but because context fragments across:
- prior sessions and threads
- scattered docs, READMEs, and decisions
- operational failures and workarounds
- handoff artifacts and recovery surfaces

When that happens, agents lose:
- prior decisions and rationales
- lessons from repeated failures
- successful workflow patterns
- continuity when work moves between sessions

Every context switch feels like day one.

**ClawText is the layer that prevents that.**

### ICP (Ideal Customer Profile)

**Who ClawText is built for:**
- **OpenClaw agents** running long-term workflows (hours/days/weeks)
- **Teams** that operate the same agents across multiple sessions, threads, or surfaces
- **Organizations** where operational learning and failure patterns matter (DevOps, QA, knowledge work, incident response)
- **Operators** who want visibility into agent memory and continuity, not hidden state

**Who is explicitly excluded:**
- Single-turn, stateless use cases (one API call, done)
- Agents with no session continuity requirements
- Systems where memory should be completely opaque (security-first, zero-trust models)
- Lightweight embeddings-only solutions seeking a different problem domain

### Core Promise

**ClawText 2.0 promises:**

1. **Automatic context retrieval** — Prior decisions, docs, failures, and successful patterns surface without config
2. **Preservable continuity** — Structured handoffs and artifacts let work continue cleanly across sessions, threads, or surfaces
3. **Learning from operational patterns** — Repeated failures and successes become organizational wisdom automatically
4. **Honest boundaries** — We own memory capture, retrieval, and continuity packaging; we do not overclaim Discord execution, relationship graphs, or full agent identity

### What We Do NOT Claim

- **Full identity platform** — we are memory, not secrets/auth/identity
- **Graph-native relationship retrieval** — relationships are lightweight curation support, not deep graph traversal
- **Perfect execution layer** — we own memory contracts, not all Discord/forum transport semantics
- **Comprehensive agent platform** — we solve memory; we do not solve orchestration, deployment, or platform scope

---

## II. Immutable Principles & Strategic Locks

### Principle 1: File-First State Wins

**Why:** Auditable, portable, version-control friendly, testable. Hidden state causes fragility.

**What this locks:** All canonical memory lives in files under `state/clawtext/prod/`. No black-box databases. No internal state migration disasters.

**Boundary:** Caches can be ephemeral, but recovery artifacts and learned patterns must be files.

### Principle 2: Automatic Where Possible, Reviewable When It Matters

**Why:** Agents can capture and inject memory without friction. Humans review risky promotions.

**What this locks:**
- Capture happens silently (no config needed to start)
- Retrieval/injection happens automatically (agents continue with context in place)
- Promotion requires human review (no silent promotion to critical guidance)
- Visibility is non-optional (review queues, health reports, audit trails)

**Boundary:** Never prioritize convenience over auditability for operational patterns.

### Principle 3: Memory is Layered, Not All-In-One

**Why:** Different context needs different retrieval patterns and access speeds.

**What this locks:**
- L1 hot context (prompt-time working memory)
- L2 durable memory (searchable, clustered, persistent)
- L3 continuity artifacts (structured handoffs, backups, manifests)

**Boundary:** Do not flatten these layers. Each layer has different latency, recency, and reliability needs.

### Principle 4: Integration Boundaries Before Feature Creep

**Why:** Clean contracts let memory work with any execution surface (Discord, Clawback-native, future adapters).

**What this locks:**
- ClawText consumes normalized manifests from external ops layers
- ClawText does not become the execution engine
- Future surfaces (Clawback apps, webhooks, etc.) can integrate via the memory interface, not by rewriting ClawText

**Boundary:** Do not absorb interaction-execution responsibility.

---

## III. Do-Not-Become (Identity Drift Guardrails)

ClawText will not become:

### ❌ A Full Agent Platform
- We are memory. We are not deployment, orchestration, or framework.
- Do not subsume agent scheduling, routing, or model selection.
- Do not build a second agent-execution layer.

**Guard:** When considering a feature, ask: "Does this require ClawText to execute code?" If yes, defer to post-2.0 or to integration contracts.

### ❌ A Comprehensive Identity System
- We hold context, not identity, secrets, or auth state.
- We are not a credential store or permission system.
- We are not the source of truth for agent personas.

**Guard:** If a feature requires secrets governance or auth bootstrapping, it's out of scope.

### ❌ A Graph Database
- Relationships are lightweight curation support, not deep entity/relationship stores.
- We do not replace neo4j, knowledge graphs, or RDF systems.
- Graph-native retrieval is post-2.0.

**Guard:** Relationship support must remain queryable via file structure and YAML, not require a heavy relationship engine.

### ❌ A Social/Org Platform
- We do not model teams, orgs, or identity hierarchies.
- We do not build permission systems or multi-tenant governance.
- We support shared/private/cross-agent memory lanes, but we don't own org structure.

**Guard:** If a feature requires org-level governance, it belongs in OpenClaw, not ClawText.

### ❌ A Self-Healing / Fully Autonomous System
- We do not automatically promote guidance without human review.
- We do not auto-correct agent behavior.
- We do not use ML to determine what constitutes "good" patterns.

**Guard:** Promotion always requires explicit human decision or policy gate. Errors must be auditable.

---

## IV. Adjacent Product Boundaries

### What Belongs IN ClawText

**Memory capture:** Automatic capture of agent interactions, decisions, failures, workflows

**Memory retrieval:** Ranking, merging, and injecting relevant context at prompt time

**Memory curation:** Review, promotion, archival, and maintenance workflows

**Operational learning:** Aggregating recurring failures → surfacing for review → promotion

**Continuity packaging:** Generating handoffs, bootstrap packets, manifests, and backups

**Memory policy & controls:** Configuration of what gets captured/retrieved/promoted and when

---

### What Belongs OUTSIDE ClawText (Integration Points)

| Responsibility | Owner | ClawText's Role |
|---|---|---|
| Agent execution / scheduling | OpenClaw runtime | Consume normalized artifacts; provide memory context |
| Discord/forum transport | Interaction-ops layer | Consume handoffs; store them in memory |
| Model selection | OpenClaw or caller | Provide context; do not choose models |
| Secrets/credentials | OpenClaw platform | Never store or manage; provide memory of decisions |
| Identity/personas | OpenClaw identity system | Never own personas; provide memory of preferences |
| Workflow orchestration | OpenClaw or external orchestrator | Provide continuity artifacts; not the orchestrator |

---

## V. Core Experience & Center of Gravity

### What Users Return To ClawText For

**The core value moment:**

An agent is stuck on a problem it already solved once. Without ClawText, it repeats the same work. With ClawText, the prior decision surfaces automatically. The agent continues without friction.

**That is the center of gravity.**

All features should reinforce this moment:
- Capture → makes prior decisions available
- Retrieval → surfaces them at the right time
- Learning → turns repeated failures into "don't do that again"
- Continuity → preserves context across session boundaries

### Secondary Use Cases (Valid But Not Core)

- Documenting org knowledge (secondary to capture)
- Complying with audit/governance (secondary to visibility)
- Training new agents on org patterns (secondary to learning)
- Reducing token budget (valid, but not the primary reason to use ClawText)

**Guard:** If a feature serves secondary use cases but harms the core experience, defer it.

---

## VI. Canonical Terms & Language

### Preferred Language

| Term | Usage | Example |
|---|---|---|
| **working memory** | L1 hot context; prompt-time retrieval | "Inject working memory at prompt start" |
| **durable memory** | L2 searchable memory; persistent storage | "Store this in durable memory for later" |
| **continuity artifact** | L3 handoff/bootstrap; transfer package | "Generate a continuity artifact for this session" |
| **operational pattern** | Learned guidance from failures/successes | "Promote this operational pattern to guidance" |
| **promotion** | Explicit elevation to reusable guidance | "The team promoted this pattern after 3 recurrences" |
| **capture** | Auto-record of agent activity | "ClawText captures failures silently" |
| **retrieval** | Query and ranking | "Hybrid retrieval uses BM25 + semantic search" |
| **lane** | One of three memory layers | "Memory is organized into three lanes" |

### Avoid (Anti-Patterns)

| Term | Why Avoid | Better Alternative |
|---|---|---|
| "memory database" | Implies we're a replacement for persistent DBs | "memory system" or "memory layers" |
| "auto-heal" or "self-healing" | Implies autonomous correction without review | "capture failures and surface patterns" |
| "knowledge graph" | Implies deep semantic relationships (not true for 2.0) | "lightweight relationships" |
| "perfect continuity" | Overstates what handoffs can preserve | "structured continuity artifacts" |
| "claim boundary" / "limitations" | Internal engineering language, not product speak | Show what we do; let docs speak for limits |
| "operational learning engine" | Implies autonomous learning (not true) | "operational learning lane" or "pattern capture" |

---

## VII. Northstar Maturity & Release State

### Current State: v2.0 Stable Release

**Why 2.0 is the right stopping point:**

1. **Memory cycle works end-to-end** — capture → extract → retrieve → inject, proven in testing
2. **Continuity is reliable** — handoffs/bootstrap/manifests work with predictable behavior and safety controls
3. **Operational learning is real** — failures aggregate, review works, promotion is visible
4. **Integration boundaries are clean** — memory contracts are clear enough for future adapters
5. **Visibility is non-negotiable** — all state is auditable, failures are explicit, review queues are active

**What 2.0 means:**
- Technically coherent
- Operationally useful
- Automatically helpful (reduces friction)
- Reviewable and bounded (auditable, not autonomous)
- Extensible (future surfaces can integrate)

### What 2.0 Does NOT Mean

- "Attempts to solve every adjacent agent-platform problem"
- "Graph-native relationship retrieval" (post-2.0)
- "Full identity/secrets platform" (post-2.0)
- "Comprehensive self-healing" (post-2.0)
- "Perfect GitHub/marketing polish" (separate phase)

### Post-2.0 Roadmap (Explicit Deferral)

These are valuable but not required for 2.0:

- **Phase 3: Documentation/Library Lane** — Structured project knowledge storage (repo state, architecture decisions, team docs). Cross-agent knowledge sharing without re-explanation.
- **Phase 4: Deeper relationship retrieval** — Graph-native traversal, entity linking in prompts
- **Phase 5: Identity platform extensions** — Agent personas, preference learning, identity continuity
- **Phase 6: Multi-surface scaling** — Clawback-native app surfaces, webhook adapters, broader platform integration
- **Phase 7: Advanced learning** — ML-based pattern detection, automatic safety classification, risk-aware promotion

---

## VIII. Success Metrics & Northstar Vision

### For v2.0 (Technical Release)

**Release gates (all must pass):**
- Runtime integrity: plugin loads, hooks active, no registration errors
- Memory cycle: capture → extract → cluster rebuild → retrieval works end-to-end
- Operational lane: capture → aggregation → review → promotion → retrieval works
- Continuity: handoffs produced, manifests created, safety enforced
- Documentation: install story clear, contracts documented, state-root coherent

### For v2.1+ (Quality + Learning)

**Adoption metrics:**
- Agents using ClawText experience fewer repeated questions
- Operational patterns achieve >70% relevance after first 10 samples
- Continuity handoffs preserve sufficient context to resume work without re-explanation
- Operators report audit trails provide clarity into agent reasoning

### Long-Term Vision (Post-2.0)

**The ideal end state:**

Agents working on OpenClaw become smarter over time not because the model improves, but because the organizational memory improves. Teams accumulate patterns, workarounds, and decisions. Future agents inherit that wisdom. The agent collective gets better at the work.

That is the Northstar.

---

## IX. Strategic Decisions & Locks

### Decision 1: File-First, Not DB-First
- **Lock:** All canonical memory is files
- **Rationale:** Auditability, portability, version control, testability
- **Consequence:** No black-box migration disasters; operators can inspect and repair

### Decision 2: Three Lanes, Not One Monolithic Store
- **Lock:** L1 (hot), L2 (durable), L3 (continuity) remain separate
- **Rationale:** Different retrieval patterns, latencies, and access patterns
- **Consequence:** We don't build a "unified memory" in the monolithic sense

### Decision 3: Manual Promotion, Not Autonomous Promotion
- **Lock:** Operational patterns require human decision to promote
- **Rationale:** Safety, auditability, organizational alignment
- **Consequence:** Operators retain control; no silent behavior changes

### Decision 4: Integration Contracts Over Execution Ownership
- **Lock:** ClawText consumes manifests; it doesn't orchestrate
- **Rationale:** Clean boundaries, future-proof for new surfaces
- **Consequence:** Can't absorb execution or orchestration, even if useful

### Decision 5: Lightweight Relationships Today, Deep Graph Later
- **Lock:** v2.0 uses YAML relationships; graph-native retrieval is post-2.0
- **Rationale:** Graph complexity is high; lightweight support unblocks learning lane
- **Consequence:** Relationship features are curation support, not deep reasoning

---

## X. Scope & Constraints

### In Scope for 2.0

✅ Memory capture, retrieval, injection
✅ Operational learning loop
✅ Continuity artifacts and handoffs
✅ File-first state and auditability
✅ Clean integration boundaries
✅ Policy and trigger contracts

### Out of Scope for 2.0

❌ Graph-native relationship retrieval
❌ Full identity/secrets platform
❌ Autonomous self-healing
❌ Comprehensive multi-tenant governance
❌ Execution layer or orchestration
❌ Comprehensive public polish/marketing

---

## XI. Risks & Mitigations

### Risk 1: Boundary Creep (Platform Scope Expansion)

**Risk:** Customers ask for identity, orchestration, or full platform scope. Team attempts to deliver.

**Mitigation:**
- Decision rule: "Does this require ClawText to execute?" → if yes, it's post-2.0
- Integration boundary is sacred; do not absorb execution
- Reject PRs that attempt to solve adjacent problems

**Owner:** Project lead (approve/reject scope decisions)

### Risk 2: Retrieval Quality Misalignment

**Risk:** Operators' expectations about retrieval quality exceed what we deliver.

**Mitigation:**
- Tune defaults conservatively (high minConfidence, modest maxMemories)
- Show retrieval ranks and confidence scores transparently
- Document that retrieval quality improves with more context
- Collect feedback on false positives/negatives

**Owner:** Memory quality engineer (ranking, tuning, metrics)

### Risk 3: Operational Promotion Gets Out of Sync

**Risk:** Promoted patterns become stale, duplicated, or contradictory.

**Mitigation:**
- Review queue is active and visible
- Operators have demotion/archival workflows
- Pattern versioning and timestamps are clear
- Retrieval shows recency + promotion status

**Owner:** Operational learning lead (review process, promotion policy)

---

## XII. Future Extensibility

### How Future Surfaces Integrate

**Pattern:** Clawback apps, webhooks, or other surfaces can integrate via:

1. **Produce** → Surface generates normalized manifest (structured artifact with context, decisions, metadata)
2. **Consume** → ClawText imports manifest into memory
3. **Retrieve** → Agents retrieve learned patterns from prior surface work
4. **Handoff** → ClawText produces continuity artifact for surface to continue

This keeps ClawText extensible without rewriting core logic.

### How Deeper Retrieval Evolves

**Path:** Lightweight relationships today → graph layer post-2.0

- v2.0: YAML relationships, manual curation, lightweight entity linking
- v2.1+: Automated entity extraction, relationship inference, graph-aware ranking
- v3.0+: Neo4j-style relationship engine if value justifies complexity

**Guard:** Do not add graph complexity to v2.0. Prove lightweight relationships deliver value first.

---

## Done Criteria

✅ Mission, problem, and ICP are clear and distinct  
✅ Core promise and do-not-claim boundaries are explicit  
✅ Principles and strategic locks are immutable  
✅ Do-not-become guardrails are concrete  
✅ Boundary definitions between ClawText and external systems are clear  
✅ Center of gravity (core experience) is defined  
✅ Canonical language and anti-patterns are documented  
✅ Maturity state and post-2.0 deferral are locked  
✅ Success metrics and long-term vision are set  
✅ Risks and mitigations are identified  
✅ Future extensibility is architected  

---

**Approval & Lock**

This Northstar is frozen for v2.0 and serves as canonical truth for:
- Product positioning and messaging
- Feature scope decisions
- Integration boundaries
- Quality gates

Updates to this document require explicit project lead decision and timestamp.

**Last locked:** 2026-03-16 | **Locked by:** Project lead review
