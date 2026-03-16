# Decision Record

- **Date:** 2026-03-16
- **Decision:** Document dual-version semantics explicitly during ClawText release hardening
- **Context:** ClawText public/product framing uses a 2.0 release boundary, while `package.json` still reports `@openclaw/clawtext` version `1.5.0`. Without explicit wording, README and publication material can drift into overstating the published package state.
- **Why this choice:**
  - release truth should be cleaned up before deeper validation and final publication work
  - honest version semantics are better than silent inconsistency
  - this preserves flexibility: either keep dual-version framing temporarily or bump the package later
- **What changed:**
  - README now distinguishes product release vs package version
  - POST_BRIEF now includes version/release framing guidance
  - release-definition docs now define the distinction explicitly
  - milestones/retrofit notes record the current state and remaining decision
- **Follow-up required:**
  - decide whether to retain dual-version framing temporarily or bump `package.json` to match the 2.0 product release before external launch
