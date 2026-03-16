# Decision Record

- **Date:** 2026-03-16
- **Decision:** Reclassify the Lane C continuity concern as strong generation/transport support with an end-to-end consumption proof gap
- **Context:** Earlier continuity language in ClawText docs is strong. Hardening inspection found substantial support for continuity artifact generation, bounded transport safety, invalid-target failure behavior, and an ingest-based consumption path in `bridge/cli.cjs`, but did not identify one clean release-grade artifact proving generation → transfer → downstream consumption → resumed work end-to-end.
- **Why this choice:**
  - continuity is more than an aspirational feature in current source/docs
  - the remaining uncertainty is narrower than "continuity is unproven"\n  - the missing piece is stronger end-to-end continuation proof and sharper consumption-spec wording
- **What changed:**
  - Lane C is now treated as partially advanced
  - docs were updated to separate strong generation/transport support from remaining resume-proof gaps
- **Follow-up required:**
  - create a documented end-to-end continuity consumption run or validation artifact
  - tighten public wording if needed until that proof exists
