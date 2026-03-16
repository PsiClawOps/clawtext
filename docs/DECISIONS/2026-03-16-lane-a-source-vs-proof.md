# Decision Record

- **Date:** 2026-03-16
- **Decision:** Reclassify the Lane A retrieval concern from likely logic contradiction to evidence-gap / proof-gap
- **Context:** Earlier documentation suggested uncertainty about whether promoted operational patterns were actually retrievable. Source inspection during the ClawTomation hardening pass found that retrieval code includes both `reviewed` and `promoted` statuses and gives promoted patterns a stronger ranking bonus.
- **Why this choice:**
  - the available code path is more supportive than the earlier contradiction wording implied
  - the remaining issue is not clearly a source-level exclusion bug
  - the remaining issue is lack of durable fixture/live proof demonstrating promotion → retrieval end-to-end
- **What changed:**
  - Lane A is now treated as partially advanced
  - hardening docs were updated to reflect that source support exists but proof is still missing
- **Follow-up required:**
  - create a fixture-backed or live-state validation artifact proving promoted pattern retrieval end-to-end
