# ClawText Production Monitoring

**Version:** v1.4.1  
**Status:** Production Edition  
**Last Updated:** 2026-03-12

---

## Overview

ClawText includes built-in health monitoring for cache, clusters, and operational learning. This guide covers:

- Key metrics to observe
- Tuning thresholds
- Troubleshooting patterns
- Health check workflows

## Cache Metrics

### Primary Indicators

**Admission Rate**
- **What:** Items entering hot cache per day
- **Target:** 5–20 items/day (Balanced preset)
- **Too low (<3):** May indicate aggressive confidence thresholds or low-value memories
- **Too high (>50):** Cache churn; consider stricter admission rules
- **Check:** `state/clawtext/prod/cache/stats.json` → `admissions.total`

**Hit Rate**
- **What:** % of cache queries finding matches
- **Target:** 40–70% (depends on workload)
- **Too low (<20%):** Cache not providing value; consider increasing `maxItems` or lowering admission thresholds
- **Too high (>80%):** Cache may be too permissive; verify confidence thresholds
- **Check:** `stats.json` → `hits.total / (hits.total + misses.total)`

**Eviction Rate**
- **What:** Items leaving cache per day (natural expiry vs. overflow)
- **Target:** Roughly equal to admission rate (steady state)
- **Rising suddenly:** May indicate memory pressure or project switching
- **Check:** `stats.json` → `evictions.total` and `evictions.by_reason`

**Age Distribution**
- **What:** How old are items currently in cache?
- **Healthy:** Mix of recent (days old) and sticky (weeks old)
- **Problem:** All items >30 days old → cache stale, admission not working
- **Problem:** All items <1 day old → high churn, cache not retaining value
- **Check:** `state/clawtext/prod/cache/hot.json` → inspect `added_at` timestamps

### Operational Metrics

**Per-Project Coverage**
- **What:** Which projects dominate the cache?
- **Healthy:** Reflects active work focus
- **Problem:** One project at 90%+ → other projects underrepresented, may need per-project tuning
- **Check:** `stats.json` → `by_project`

**Confidence Distribution**
- **What:** Are admission thresholds appropriate?
- **Healthy:** Cluster around 0.75–0.90 (biased toward high confidence)
- **Problem:** All items >0.95 → thresholds too strict, missing valuable context
- **Problem:** Items <0.65 → admission rules not enforced correctly
- **Check:** `hot.json` → histogram of `confidence` values

## Cluster Health

### Key Metrics

**Cluster Count**
- **What:** Number of semantic clusters built
- **Target:** 5–15 clusters (Balanced) or 3–8 (Conservative)
- **Check:** `ls memory/clusters/ | wc -l`
- **If too few:** Rebuild with `--force` or lower clustering threshold
- **If too many:** Memory set growing; may need archival

**Memory Index Size**
- **What:** Total memories indexed across all clusters
- **Target:** 100–500 memories (Balanced)
- **Check:** `jq 'length' memory/clusters/*.json | awk '{s+=$1} END {print s}'`
- **Growing fast:** Normal during ingest phase; monitor after stabilization

**Cluster Rebuild Frequency**
- **What:** How often are clusters rebuilt?
- **Default:** Daily 2am UTC (Balanced)
- **Tuning:** See AGENT_SETUP.md preset schedules
- **Check:** `grep "cluster rebuild" /var/log/openclaw/*.log | tail -20`

## Operational Learning Lane

### Failure Capture

**Capture Rate**
- **What:** Tool failures or errors detected per day
- **Target:** 0–5 per day (operational systems should be stable)
- **Too high (>20):** Active failures; review error patterns immediately
- **Check:** `state/clawtext/prod/operational/failures.jsonl` → line count

**Pattern Recognition**
- **What:** Errors clustered into repeated patterns?
- **Healthy:** Related errors grouped (same tool, related symptoms)
- **Problem:** All 1-off errors → random noise, low signal
- **Check:** Review `operational-review.ts` clustering logic

### Promotion Pipeline

**Pending Review Queue**
- **What:** Candidates awaiting agent/user review
- **Target:** <10 items (cleared weekly)
- **Too many (>50):** Backlog building; schedule review session
- **Check:** `state/clawtext/prod/operational/candidates.jsonl` → count pending entries

**Promotion Success Rate**
- **What:** % of reviewed candidates promoted to durable guidance
- **Target:** 30–60% promotion rate
- **Too low (<20%):** Review process too strict or candidates low-quality
- **Too high (>80%):** Insufficient filtering; may reduce guidance quality
- **Check:** `stats.json` → `operational.promoted / operational.reviewed`

## Health Checks

### Daily Checklist (Automated via Cron)

```bash
# Runs nightly 2am UTC as part of cluster rebuild cron

1. Verify cluster rebuild completed ✓
2. Check for stale hot cache entries ✓
3. Audit operational learning capture rate ✓
4. Validate RAG injection quality (sample 5 queries) ✓
5. Report any anomalies to Discord channel
```

### Manual Verification

```bash
# Cache health
node ~/.openclaw/workspace/skills/clawtext/scripts/validate-rag.js --cache

# Cluster integrity
node ~/.openclaw/workspace/skills/clawtext/scripts/build-clusters.js --validate

# Operational learning status
node ~/.openclaw/workspace/skills/clawtext/scripts/operational-cli.mjs status

# Full health report
node ~/.openclaw/workspace/skills/clawtext/scripts/operational-cli.mjs report
```

## Tuning Guide

### When to Adjust Admission Confidence

**Symptom:** Cache has many low-value items  
**Action:** Increase `admissionConfidence` by 0.05 (e.g., 0.70 → 0.75)  
**Effect:** Fewer admissions, higher quality, longer search time

**Symptom:** Cache is empty or too small  
**Action:** Decrease `admissionConfidence` by 0.05 (e.g., 0.70 → 0.65)  
**Effect:** More admissions, potential noise, faster retrieval

### When to Adjust Max Items

**Symptom:** High eviction rate, memory thrashing  
**Action:** Increase `maxItems` (e.g., 300 → 400)  
**Effect:** Larger cache, slower scans, more retention

**Symptom:** Cache takes too long to query (>10ms), token budget exceeded  
**Action:** Decrease `maxItems` (e.g., 300 → 200)  
**Effect:** Smaller cache, faster queries, more evictions

### When to Adjust TTL

**Symptom:** Items disappearing too fast, constant re-learning  
**Action:** Increase `defaultTtlDays` (e.g., 14 → 21)  
**Effect:** Longer retention, stale items accumulate

**Symptom:** Cache dominated by old items, fresh context not admitted  
**Action:** Decrease `defaultTtlDays` (e.g., 14 → 7)  
**Effect:** Shorter retention, bias toward recent

## Troubleshooting

### "Cache hit rate is 0%"

**Possible causes:**
1. Cache is empty or not loading
2. Query patterns don't match cached items
3. Admission thresholds too strict

**Fix:**
```bash
# Check if cache exists and has items
ls -lh state/clawtext/prod/cache/hot.json
jq 'length' state/clawtext/prod/cache/hot.json

# If empty, rebuild manually
node scripts/build-clusters.js --force
# Wait for next query cycle; cache admission should trigger
```

### "Cache grows indefinitely"

**Possible causes:**
1. Eviction policy broken
2. `maxItems` not being enforced
3. Sticky items accumulating without cleanup

**Fix:**
```bash
# Check eviction stats
jq '.evictions' state/clawtext/prod/cache/stats.json

# Manual cleanup: trim to maxItems
node scripts/validate-rag.js --trim-cache

# Verify sticky items aren't orphaned
jq '[.[] | select(.sticky == true)] | length' state/clawtext/prod/cache/hot.json
# Compare to expected sticky item count
```

### "Cluster rebuild is slow"

**Possible causes:**
1. Too many memories to index (>1000)
2. Semantic similarity scoring expensive
3. System resource constraints

**Fix:**
```bash
# Check memory count
find memory/ -name "*.md" -o -name "*.jsonl" | xargs wc -l | tail -1

# Run rebuild with progress
node scripts/build-clusters.js --verbose --force

# If very slow, consider archiving old memories
# See CURATION.md for archival strategy
```

### "Operational learning queue growing"

**Possible causes:**
1. Agents not reviewing candidates
2. Auto-promotion disabled
3. Too many errors being captured (underlying issue)

**Fix:**
```bash
# Check queue size
wc -l state/clawtext/prod/operational/candidates.jsonl

# Review pending candidates
node scripts/operational-cli.mjs candidates --pending

# Trigger manual review session
node scripts/operational-cli.mjs review --interactive
```

## Production Checklist

Before deploying changes to ClawText config or thresholds:

- [ ] Baseline current metrics (hit rate, admission rate, eviction rate)
- [ ] Make one tuning change only
- [ ] Wait 24–48 hours for data
- [ ] Measure impact on metrics
- [ ] If improvement, keep change; if worse, revert
- [ ] Document tuning decision in DECISION_LOG or memory

## Alerting

Configure alerts for:

1. **Hit rate drops below 20%** → Cache not providing value
2. **Eviction rate >2x admission rate** → Memory pressure
3. **Cluster rebuild fails 2x** → Data integrity issue
4. **Operational learning queue >50** → Review backlog
5. **Cache size >90% of maxItems** → Near capacity

Send alerts to Discord channel configured in gateway (or print to logs).

---

**See also:** HOT_CACHE.md (cache design), OPERATIONAL_LEARNING.md (operational lane), ARCHITECTURE.md (system overview)
