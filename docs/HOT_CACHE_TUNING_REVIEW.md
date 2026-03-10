# Hot Cache Admission Thresholds — Tuning Review

## Issue Found (2026-03-09 01:33 UTC)

Hot cache was not admitting cluster memories due to overly strict gates.

## Root Cause

Admission thresholds in `src/hot-cache.js`:
- `admissionConfidence: 0.78` — Cluster memories at 0.70 were rejected ❌
- `admissionScore: 1.5` — Most BM25 matches scored < 1.5, rejected ❌

## Fix Applied

Updated thresholds to:
- `admissionConfidence: 0.60` — Lowers gate to accept 0.70+ cluster results
- `admissionScore: 0.8` — Lowers gate to accept more BM25 matches

**Test Result:** Hot cache now admits 12 items from cluster warmup ✅

## Tuning Strategy

Current settings prioritize **admitting good cluster results over being overly selective**. This is appropriate for early production (more coverage, less latency penalty).

### Tuning Knobs (in order of impact)

1. **admissionConfidence** (currently 0.60)
   - Higher = stricter (only highest-confidence memories)
   - Lower = more inclusive (admit marginal memories)
   - Recommendation: 0.55–0.70 for v1.3.0; revisit after production data

2. **admissionScore** (currently 0.8)
   - Higher = only strong BM25 matches
   - Lower = admit more results (but possibly noise)
   - Recommendation: 0.6–1.0 for v1.3.0; monitor hit-to-noise ratio

3. **maxItems** (currently 300)
   - Memory pressure: if cache grows unbounded, lower this
   - Currently stable; no tuning needed

4. **persistEveryAdmissions** (currently 5)
   - Tradeoff: save frequency vs. IO overhead
   - Currently good; save every 5 admissions balances durability + perf

### Observational Metrics (for future tuning)

Track these in production and adjust accordingly:

- **Cache hit rate** (current: 98.9%)
  - If < 95%: admission gates too strict, lower thresholds
  - If > 99%: gates too loose, raise thresholds (or accept it)

- **Admission rate** (memories/hour into hot cache)
  - Current: TBD (first production run)
  - Target: 5-20 admissions per hour (sustainable for 300-item cache)

- **Eviction rate** (when cache hits maxItems)
  - Current: none yet (warmup phase)
  - Target: < 2 evictions per hour (indicates healthy turnover)

- **Mean cache item age**
  - Current: TBD
  - Target: 3-7 days (reflects good balance of fresh + sticky)

## Next Steps

1. **Commit & Push:** Changes deployed (commit pending)
2. **Monitor Production:** Track cache stats in `npm run health` output
3. **Schedule Review:** After 48 hours production data, revisit:
   - Do admission gates feel right?
   - Are high-value memories being admitted?
   - Is any noise getting through?
4. **Adjust if Needed:** Tuning is reversible; values can be dialed based on observed behavior

## Files Changed

- `src/hot-cache.js` — Updated admissionConfidence + admissionScore with comments

## Build Status

✅ `npm run build` — TypeScript compiled  
✅ `npm test` — 12 items now warming to hot cache

---

**Status:** Ready for production monitoring  
**Owner:** Review team  
**Timeline:** Monitor 48h, adjust if needed
