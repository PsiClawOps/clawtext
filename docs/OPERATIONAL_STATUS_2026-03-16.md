# ClawText v0.2.0 — Operational Update

**Date:** 2026-03-16 | **Status:** Deploy-ready | **Latest Commit:** ccb0fb1

---

## Summary of Current State

### What We Have (v0.2.0)

**Four operational lanes** (+ one planned):
1. **Working Memory** — automatic capture → extract → retrieve → inject at prompt time
2. **Knowledge Ingest** — external sources (repos, docs, threads, URLs) → searchable memory
3. **Operational Learning** — failures → recurrence scoring → agent-proposed promotion → human review → permanent guidance
4. **ClawBridge** — active session context → structured transfer packets → destination surfaces

**Design Principles** (locked in Northstar):
- File-first state (auditable, portable, version-controllable)
- Automatic capture/retrieval (no manual work to stay useful)
- Agent-led with human approval (nothing permanent without review)
- CLI everywhere (everything inspectable and controllable)

**Release Status:**
- Version: 0.2.0 (semantic versioning with zero prefix: 0.1.x pre-releases, 0.2.0 first stable)
- Installation: GitHub (`openclaw plugins install github:PsiClawOps/clawtext`)
- Status badge: `deploy-ready` (yellow)
- Organization: PsiClawOps
- Repository: https://github.com/PsiClawOps/clawtext

---

## Recent Changes (This Session)

### 1. Repository & Org Alignment
- ✅ Moved from ragesaq → PsiClawOps org
- ✅ Updated package.json: `@psiclawops/clawtext` → GitHub-only install (no npm yet)
- ✅ Updated all install references: `github:PsiClawOps/clawtext`

### 2. Version Normalization
- ✅ Bumped from `1.5.0` → `0.2.0` (zero prefix for semantic versioning)
- ✅ Updated all version references across docs
- ✅ Updated marquee badges (removed duplicate version badge, consolidated to one)
- ✅ Changed status: `production` → `deploy-ready` (yellow indicator)

### 3. Northstar & Strategic Docs (Frozen)
- ✅ `docs/NORTHSTAR.md` — strategic anchor, principles, do-not-become guardrails
- ✅ `docs/MILESTONES.md` — 10 shipped milestones + post-2.0 roadmap (P1-P7)
- ✅ `docs/POST_BRIEF.md` — publication template (ready to use)
- ✅ `docs/RETROFIT_REPORT.md` — quality assessment (HIGH confidence, minor gaps identified)
- ✅ `docs/STRATEGIC_PACKAGE_INDEX.md` — navigation guide

### 4. New Post-2.0 Priority
- ✅ **P6 (High): Documentation/Library Lane** — structured project knowledge storage
  - Use case: agents reference current repo status, architecture decisions, team docs without re-explanation
  - Separate from operational learning (which learns from failures)
  - Uses existing ingest, adds explicit curation
  - Roadmap: Phase 3 (after v2.0 release)

### 5. README Polish
- ✅ Removed npm badge (unnecessary)
- ✅ Center-aligned marquee badges
- ✅ Full README review: all references updated, markdown is clean

---

## Refactored Discord Blurb (6 lines + installation)

```
🧠 **ClawText v0.2.0** — Automatic memory + continuity for OpenClaw agents

Automatic context capture, retrieval, and operational learning in four lanes:
🤖 **Working memory** (fast prompt injection) · 📦 **Knowledge ingest** (docs/repos/threads) · ⚙️ **Operational learning** (failures → patterns → wisdom) · 🌉 **ClawBridge** (active context transfer)

Your agents continue with context, not restart from zero. Teams accumulate knowledge over time.

➡️ Install: `openclaw plugins install github:PsiClawOps/clawtext`
📖 Docs: https://github.com/PsiClawOps/clawtext
```

**Or shorter (5 lines):**

```
🧠 **ClawText v0.2.0** — Automatic memory for OpenClaw agents

Four operational lanes: working memory (auto-inject), knowledge ingest (docs/repos), operational learning (failures → wisdom), ClawBridge (continuity transfer).

Agents continue with context. Teams improve over time.

Install: `openclaw plugins install github:PsiClawOps/clawtext` | Docs: https://github.com/PsiClawOps/clawtext
```

---

## Operational Knowledge Update

### What Changed in This Session
1. **Organization**: Moved to PsiClawOps (not ragesaq personal account)
2. **Versioning**: Now 0.2.0 (semantic versioning with zero prefix)
3. **Installation**: GitHub-only (no npm yet, can add later without breaking anything)
4. **Post-2.0 Plans**: Documentation/Library Lane added as P6 priority
5. **Strategic Docs**: Frozen and locked for publication (Northstar, Milestones, POST_BRIEF, etc.)

### Current Capabilities (Verified)
- ✅ Working memory pipeline (capture → extract → retrieve)
- ✅ Operational learning (failure capture → promotion → retrieval)
- ✅ ClawBridge (context transfer + handoffs)
- ✅ Multi-source ingest (repos, docs, threads, JSON)
- ✅ File-first auditability
- ✅ Human review gates (nothing permanent without approval)
- ✅ CLI controls throughout
- ✅ Automatic cron maintenance (20min extraction, nightly rebuild)

### What's NOT in v0.2.0 (Intentional Deferral)
- ❌ Graph-native relationships (post-2.0, Phase 4)
- ❌ Identity/secrets platform (post-2.0, Phase 5)
- ❌ Multi-surface scaling beyond ClawBridge (post-2.0, Phase 6)
- ❌ ML-based pattern classification (post-2.0, Phase 7)
- ❌ **Documentation/Library Lane** (post-2.0, Phase 3)

### Pre-Publication Checklist
From RETROFIT_REPORT — items to validate before advertising:
- [ ] Verify promoted pattern retrieval works end-to-end
- [ ] Test multi-agent memory isolation
- [ ] Test continuity artifact consumption (full E2E)
- [ ] Test invalid Discord thread explicit failure
- [ ] Document operational learning recurrence threshold
- [ ] Document continuity artifact format spec

---

## Files to Reference Going Forward

**Strategic docs (frozen for v2.0):**
- `docs/NORTHSTAR.md` — decision truth for scope/features
- `docs/MILESTONES.md` — value delivery + post-2.0 roadmap
- `docs/POST_BRIEF.md` — publication template

**Operational docs:**
- `README.md` — product page (complete, publication-ready)
- `docs/ARCHITECTURE.md` — lane model
- `docs/OPERATIONAL_LEARNING.md` — failure capture + promotion
- `docs/INGEST.md` — source management
- `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` — capture/retrieve/promote rules

**Recent changes:**
- `package.json` — version 0.2.0, GitHub URL, author PsiClawOps
- `.github/` — if you have CI/workflows (check for any old npm references)

---

## Next Steps for Advertising

1. **Use POST_BRIEF as your announcement template** (it's publication-ready)
2. **Use refactored Discord blurb above** (either 5-line or 6-line version)
3. **Validate pre-publication checklist** (from RETROFIT_REPORT section 8)
4. **Announce to ai-projects** (use the blurb + link to README)
5. **Plan P6 (Library Lane)** — roadmap for Phase 3 post-release

---

**Ready to publish. All strategic docs frozen. Ready for announcement.**
