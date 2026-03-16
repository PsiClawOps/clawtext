# ClawText v2.0 Strategic Package — Index & Navigation

**Date:** 2026-03-16 | **Status:** Frozen for v2.0 Release | **Commit:** e0efdaf

---

## What This Is

This is the canonical **Northstar** package for ClawText v2.0. It defines what ClawText is, what it promises, what it delivers, and what it will never try to be. All publication, roadmap, and scope decisions should flow from these four documents.

---

## The Four Documents

### 1. **docs/NORTHSTAR.md** (Strategic Anchor)

**Use this when:**
- Making feature scope decisions ("Is this in scope?")
- Evaluating PRs ("Does this align with principles?")
- Defining product boundaries ("What belongs in/outside?")
- Explaining strategy to stakeholders ("Why are we focusing here?")

**Key sections:**
- Mission & core identity
- ICP + excluded users
- Core promise + do-not-claim
- Immutable principles & strategic locks
- Do-not-become guardrails
- Center of gravity
- Canonical language

**Frozen:** YES — This is decision truth for v2.0 and beyond (except explicit post-2.0 deferrals).

---

### 2. **docs/MILESTONES.md** (Value & Proof)

**Use this when:**
- Shipping or announcing features ("What did we deliver?")
- Validating work ("Where's the proof?")
- Measuring success ("Are we on track?")
- Explaining roadmap ("What's post-2.0?")

**Key sections:**
- 10 major milestones with value, proof, artifacts
- Release gates
- Success metrics (v2.0, v2.1+, long-term)
- Post-2.0 priorities (explicit deferral P1–P6)

**Frozen:** YES — v2.0 milestones are complete. Post-2.0 roadmap is explicit deferral.

---

### 3. **docs/POST_BRIEF.md** (Publication Template)

**Use this when:**
- Writing GitHub README (pull from this)
- Announcing on Discord (use messaging section)
- Creating marketing/positioning copy
- Responding to "what is ClawText?" questions

**Key sections:**
- Opening hook
- Problem statement
- Solution overview
- Product promise
- How it works
- Architecture & reliability
- Installation & setup
- Use cases
- Launch messaging templates (GitHub + Discord)

**Live:** Ready to use for v2.0 announcement now.

---

### 4. **docs/RETROFIT_REPORT.md** (Quality Assessment)

**Use this when:**
- Assessing whether v2.0 is ready
- Understanding risks and assumptions
- Resolving ambiguities before release
- Building confidence in product coherence
- Planning post-2.0 work

**Key sections:**
- Confidence assessment (HIGH overall)
- Assumptions (5 major, all documented)
- Contradictions (3 found, all resolved)
- Missing artifacts (4 identified, resolvable)
- Unresolved ambiguities (5 identified, owner/timeline)
- Pre-release checklist (must-fix, should-fix, optional)

**Status:** Assessment complete. Must-fix items before release.

---

## How These Documents Relate

```
NORTHSTAR (What We Are)
    ↓
    Defines mission, boundaries, principles
    ↓
    Guides all future decisions
    
MILESTONES (What We Shipped)
    ↓
    10 outcomes proven by code + docs
    ↓
    Evidence that Northstar is real
    
POST_BRIEF (What We Tell People)
    ↓
    Publication template for announcement
    ↓
    Derived from Northstar + Milestones
    ↓
    Ready to publish now
    
RETROFIT_REPORT (Quality Check)
    ↓
    Assessed coherence + risks
    ↓
    Confirmed Northstar is solid
    ↓
    Flagged pre-release items
```

---

## Quick Reference Tables

### Northstar Quick Decision Rule

**When evaluating a feature:**

- Does it improve memory capture/retrieval/continuity/operational learning? → likely in-scope
- Does it require ClawText to execute code / own identity / deep relationships? → likely post-2.0
- Does it expand beyond these four lanes? → reference NORTHSTAR "Do-Not-Become" section

**Decision owner:** Project lead (check Northstar first)

### Milestones Quick Status

| Milestone | Status | Proof |
|---|---|---|
| Memory cycle | ✅ Working | code + validation scripts |
| Operational learning | ✅ Working | review queue + promotion |
| Continuity artifacts | ✅ Working | bridge/ + backups/ |
| Integration boundaries | ✅ Clean | plugin.json + contracts |
| File-first state | ✅ Enforced | state/clawtext/prod/ |
| Policy controls | ✅ Documented | MEMORY_POLICY_TRIGGER_CONTRACT |
| Knowledge ingest | ✅ Working | src/ingest/ + 4 source types |
| Release boundary | ✅ Honest | README + boundary docs |
| Health tooling | ✅ Accessible | operational-cli + scripts |
| Northstar anchoring | ✅ Frozen | this package |

### Pre-Release Must-Fix Checklist

From RETROFIT_REPORT:

- [ ] Test: Promoted operational patterns are retrievable
- [ ] Test: Multi-agent memory isolation works
- [ ] Test: Continuity artifact can be consumed end-to-end
- [ ] Test: Invalid Discord thread fails explicitly
- [ ] Docs: Document promoted pattern retrieval
- [ ] Docs: Document artifact consumption format

**Owner:** Engineering lead + QA lead | **Timeline:** Before v2.0 announcement

---

## For Different Audiences

### If you're a **Product Manager / Leader**
1. Read **NORTHSTAR** (sections: Mission, ICP, Promise, Do-Not-Become)
2. Use **MILESTONES** for status updates
3. Use **POST_BRIEF** for announcement/positioning
4. Reference **RETROFIT_REPORT** if evaluating release readiness

### If you're an **Engineer**
1. Read **NORTHSTAR** (sections: Immutable Principles, Strategic Locks, Boundaries)
2. Read **RETROFIT_REPORT** (section: Pre-Release Checklist) for work items
3. Reference **MILESTONES** to understand what each lane delivers
4. Check **NORTHSTAR** when reviewing PRs ("Does this fit the architecture?")

### If you're an **Operator / User**
1. Read **POST_BRIEF** (sections: Problem, Solution, How It Works, Installation)
2. Reference **NORTHSTAR** (section: Center of Gravity) to understand what you'll use it for
3. Check **MILESTONES** to see what's shipped
4. Deep dives: architecture docs linked in POST_BRIEF

### If you're **Evaluating Scope / Feature Requests**
1. Go to **NORTHSTAR** section: "Decision Practical Rule" (decision rule for scope)
2. Check "Immutable Principles" (is this feature aligned?)
3. Check "Do-Not-Become" (does this risk scope creep?)
4. Check "Adjacent Boundaries" (is this the right owner?)
5. If still unclear: flag for project lead with NORTHSTAR context

---

## Using This Package for Publication

### For GitHub README
- Start with POST_BRIEF opening hook
- Use POST_BRIEF sections in order
- Link to full NORTHSTAR for "why did we do this?"
- Link to MILESTONES for "what's shipped?"

### For Discord / ai-projects Announcement
- Use POST_BRIEF "Launch Messaging" section for Discord
- Link to README
- Emphasize MILESTONES value (30-50% reduction in repetition, etc.)

### For Roadmap / Comms
- Reference MILESTONES v2.0 completion
- Explicitly list post-2.0 deferrals from MILESTONES (P1–P6)
- Use NORTHSTAR "Explicit Deferral" section to explain why

---

## Handling Common Questions

### "Why does ClawText do X but not Y?"
→ Check NORTHSTAR "Do-Not-Become" + "Adjacent Boundaries"

### "Is Z in scope for this release?"
→ Use NORTHSTAR "Decision Practical Rule" + "Immutable Principles"

### "What's the proof that memory retrieval works?"
→ See MILESTONES Milestone 1 "Proof & Evidence" section

### "What are we not claiming?"
→ See NORTHSTAR "What We Do NOT Claim" section

### "When will we support X?"
→ Check MILESTONES "Post-2.0 Priorities" (P1–P6 roadmap)

### "Is the product coherent / ready?"
→ See RETROFIT_REPORT "Final Assessment" (HIGH confidence, PROCEED)

---

## Version History & Locking

**This package is frozen for v2.0:**

- **NORTHSTAR:** Strategic truth for v2.0 and beyond (explicit deferrals post-2.0)
- **MILESTONES:** v2.0 is complete; post-2.0 priorities are explicit deferral
- **POST_BRIEF:** Ready for v2.0 publication now
- **RETROFIT_REPORT:** Quality assessment complete; pre-release items flagged

**Updates after v2.0:**
- Minor clarifications allowed (fix ambiguities, improve language)
- Major changes require explicit project lead decision + timestamp
- Post-2.0 deferrals can be revisited per roadmap (v2.1+)

---

## Success Criteria

This package is succeeding when:

✅ **Product coherence:** All decisions refer back to NORTHSTAR; no contradictions  
✅ **Communication alignment:** GitHub/Discord/docs all tell same story (sourced from POST_BRIEF)  
✅ **Scope discipline:** PRs evaluated against NORTHSTAR; scope creep is visible and rejected  
✅ **Roadmap clarity:** Post-2.0 work is explicit deferral from MILESTONES; no surprises  
✅ **Risk visibility:** RETROFIT_REPORT ambiguities are resolved or tracked  

---

## Navigation

**Links to strategic docs:**

| Document | Path | Purpose |
|---|---|---|
| **Northstar** | `docs/NORTHSTAR.md` | Strategic anchor; decision truth |
| **Milestones** | `docs/MILESTONES.md` | Value + proof; release gates |
| **Publication Brief** | `docs/POST_BRIEF.md` | Announcement template |
| **Retrofit Report** | `docs/RETROFIT_REPORT.md` | Quality assessment + pre-release checklist |
| **README** | `README.md` | Product page (pull from POST_BRIEF) |
| **Release Definition** | `docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md` | v2.0 scope (historical reference) |
| **Supported Behavior** | `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` | Behavior boundary (internal use) |

---

## Final Word

**ClawText v2.0 is now anchored to canonical truth.**

The Northstar is frozen. Milestones are validated. Publication is ready. Quality assessment is complete. 

**Use this package for all publication, roadmap, and scope decisions. The goal is met: ClawText comms now come from strategic Northstar truth, not feature velocity.**

---

**Frozen & locked: 2026-03-16 | Commit: e0efdaf**
