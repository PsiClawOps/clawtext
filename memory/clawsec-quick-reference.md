# ClawSec — Quick Reference Card

**Print this. Pin this. Use this.**

---

## The 5 Enhancements (What, Why, When)

### 🔴 P1: Middleware (Automatic Integration)
**Why:** Wrapper is optional; agents can bypass  
**What:** Intercept ALL `web_search` calls  
**When:** First (blocks all others if not working)  
**Time:** 2 hours  
**File:** `src/openclaw_middleware.py`  

### 🔴 P2: Typoglycemia Detector
**Why:** "ignroe" passes regex filters  
**What:** Fuzzy match scrambled-letter attacks  
**When:** After P1  
**Time:** 3 hours  
**File:** `src/typoglycemia_detector.py`  

### 🟠 P3: Output Guard
**Why:** Agent response can leak system prompt  
**What:** Monitor responses before sending  
**When:** After P2  
**Time:** 2 hours  
**File:** `src/output_guard.py`  

### 🟠 P4: Structured Prompts
**Why:** Results can bleed into instructions  
**What:** Wrap results in `USER_DATA_TO_PROCESS` boundaries  
**When:** After P3  
**Time:** 2 hours  
**File:** `src/structured_prompt_enforcer.py`  

### 🟠 P5: Best-of-N Defense
**Why:** 10 variations = 78% success  
**What:** Rate-limit systematic variation attacks  
**When:** After P4  
**Time:** 2 hours  
**File:** `src/best_of_n_defense.py`  

---

## Testing Checklist

```
After Phase 1:
✅ pytest tests/test_middleware.py
✅ Verify web_search calls routed
✅ Check audit logs populated

After Phase 2:
✅ pytest tests/test_typoglycemia.py
✅ Run with OWASP test cases
✅ Check >95% detection

After Phase 3:
✅ pytest tests/test_output_guard.py
✅ Verify no prompt leakage

After Phase 4:
✅ pytest tests/test_structured_prompts.py
✅ Verify boundary markers

After Phase 5:
✅ pytest tests/test_best_of_n.py
✅ Verify rate limiting

Final:
✅ pytest tests/adversarial_tests.py -v
✅ Target: <1% attack success
✅ pytest tests/canary_tests.py
✅ Target: <0.5% false positives
```

---

## File Structure

**To Add:**
```
src/
├─ openclaw_middleware.py
├─ typoglycemia_detector.py
├─ output_guard.py
├─ structured_prompt_enforcer.py
└─ best_of_n_defense.py

tests/
├─ test_middleware.py
├─ test_typoglycemia.py
├─ test_output_guard.py
├─ test_structured_prompts.py
├─ test_best_of_n.py
├─ adversarial_tests.py
└─ canary_tests.py

docs/
├─ OPENCLAW_INTEGRATION.md
├─ OUTPUT_MONITORING.md
├─ STRUCTURED_PROMPTS.md
└─ TESTING_RESULTS.md
```

---

## Git Commits (Suggested)

```bash
git commit -m "feat: Middleware auto-integration (P1)"
git tag v1.3.0-middleware

git commit -m "feat: Typoglycemia detection (P2)"
git tag v1.3.1-typoglycemia

git commit -m "feat: Output guard + structured prompts (P3-P4)"
git commit -m "feat: Best-of-N defense rate limiting (P5)"
git tag v1.4.0

git commit -m "test: Adversarial + canary test suites (P6)"
git tag v2.0.0-ready
```

---

## Success Indicators

```
Phase 1 ✅ when:
  ✓ All web_search calls intercepted
  ✓ Blocked queries rejected
  ✓ Audit log has entries
  ✓ <5ms overhead

Phase 2 ✅ when:
  ✓ Tests pass (pytest)
  ✓ Typo cases blocked
  ✓ Legitimate queries pass
  ✓ >95% detection rate

Phase 3 ✅ when:
  ✓ No response leakage
  ✓ System prompts redacted
  ✓ Tests pass

Phase 4 ✅ when:
  ✓ All results wrapped
  ✓ Boundaries validated
  ✓ Tests pass

Phase 5 ✅ when:
  ✓ Rate limiting triggers
  ✓ Sessions escalate
  ✓ Tests pass

P6 ✅ when:
  ✓ <1% attack success
  ✓ <0.5% false positives
  ✓ <20ms latency
  ✓ All tests pass
```

---

## Troubleshooting (Quick Fixes)

**Middleware won't install?**
→ Check OpenClaw tools module structure  
→ See `docs/OPENCLAW_INTEGRATION.md`

**Typoglycemia too strict?**
→ Adjust threshold in detector  
→ Test with legitimate words

**Output guard over-redacting?**
→ Update WHITELIST_PATTERNS  
→ Add legitimate phrases

**Performance degrading?**
→ Profile: `python -m cProfile`  
→ Check regex complexity (use compiled patterns)

**Tests failing?**
→ Check file paths  
→ Verify imports  
→ Run with `-vv` for details

---

## Memory Files Reference

```
~/workspace/memory/

📋 Planning
├─ clawsec-implementation-index.md   ← NAVIGATION (start here)
├─ clawsec-visual-summary.md         ← DIAGRAMS
├─ clawsec-hardening-plan.md         ← FULL GUIDE (37KB)
└─ clawsec-quickstart.md             ← CODE READY (copy/paste P1)

🔍 Analysis
├─ clawsec-security-audit-report.md  ← FINDINGS
└─ clawsec-web-search-analysis.md    ← SYSTEM OVERVIEW

📊 Summary
├─ clawsec-delivery-summary.md       ← WHAT YOU GOT
└─ MEMORY.md                         ← QUICK LINKS (updated)
```

---

## Timeline at a Glance

```
Day 1: P1 + P2 + P3 start
  ├─ 09:00-11:00  Middleware (2h)
  ├─ 11:00-14:30  Typoglycemia (3.5h)
  └─ 14:30-17:00  Output Guard start (2.5h)

Day 2: P3 finish + P4 + P5
  ├─ 09:00-11:00  Output Guard finish (2h)
  ├─ 11:00-13:30  Structured Prompts (2.5h)
  └─ 13:30-17:00  Best-of-N Defense (3.5h)

Day 3: Testing + Deploy
  ├─ 09:00-12:00  Adversarial testing (3h)
  ├─ 12:00-13:00  Code review (1h)
  └─ 13:00-14:00  Deploy prep (1h)
```

---

## Quick Stats

```
📊 Code
├─ Lines to add: ~1,220
├─ Files to create: 11 new files
├─ Time to implement: ~17 hours
└─ Complexity: Medium (all code provided)

📈 Metrics
├─ Attack success: 10-15% → <1%
├─ Validation latency: <10ms
├─ Code coverage: >90%
└─ False positive rate: <0.5%

✅ Tests
├─ Unit tests: Per component
├─ Adversarial tests: 50+ attacks
├─ Canary tests: Continuous
└─ Coverage: >90%
```

---

## Copy This Command

```bash
# Clone quickstart and start Phase 1
cat ~/workspace/memory/clawsec-quickstart.md | grep -A 100 "Step 1:"
```

---

## When You're Done

```
Version: v2.0.0 (ClawSec with full hardening)
Release: 2026-03-05 (estimated)
Status: Enterprise-grade
Attack success rate: <1% ✅
Performance: <10ms latency ✅
Coverage: >90% ✅
Docs: Complete ✅
Ready for prod: YES ✅
```

---

**Keep this handy. It's your reference during implementation.**

**Questions? → Check the detailed documents in memory/**  
**Stuck? → Refer to troubleshooting above**  
**Ready? → Start with clawsec-quickstart.md**

---

*Last updated: 2026-03-03*  
*Status: Ready for implementation*  
*Questions: Ask me anytime*
