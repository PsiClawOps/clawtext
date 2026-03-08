# DECISION_LOG.md

_Key decisions and rationale._

## 2026-03-07: Slowness Diagnosis & Config Tuning

**Problem:** OpenClaw responses taking 10-30 minutes in some cases; Discord listener timeouts.

**Root cause:** Context overflow cascades. Sessions balloons to 80-82k tokens (exceeds GPT-4o 64k limit), compaction fails 3x, timeouts pile up.

**Decision:** Lower `reserveTokensFloor` from 25000 → 15000 (force earlier compaction). Disable `memorySearch.sync.onSessionStart` (disable automatic RAG injection, causing context bloat).

**Rationale:** 25k floor was too high — sessions grew unchecked. Memory injection on every session start added needless overhead and context waste.

**Expected outcome:** Faster responses, fewer context overflow errors. RAG still available on-demand.

**Monitoring:** Watch for response time improvements over next 24-48h. If compaction becomes too aggressive (breaking coherence), we'll dial it back.

---

## 2026-03-05: Thinking Mode Strategy

**Decision:** Keep global `thinkingDefault: "medium"`. Use per-session `/think:adaptive` directives for Sonnet 4.6/Opus 4.6 deep work.

**Rationale:** OpenClaw doesn't support per-model config overrides yet (GitHub #20612). `adaptive` is recommended for Claude 4.6+.

---

## 2026-03-03: Plugin Allowlist

**Decision:** Set `plugins.allow: ["discord", "memory-core"]`.

**Rationale:** Explicit allowlisting. Filter plugin reports to suppress disabled non-allowlisted noise.
