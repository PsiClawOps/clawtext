# ClawText GitHub README + Gold Standard Post Refinement Plan

**Owner:** ClawText project team
**Current target:** v2.0 claim-safe publication
**Status:** Active

This plan closes the loop from README rewrite into the reusable Gold Standard Post skill so future products/postings keep a consistent, defensible structure.

---

## 0) Baseline references used
From current search, the following technical GitHub READMEs were selected for structure benchmarking:

1. [Prometheus](https://github.com/prometheus/prometheus/blob/main/README.md)
2. [Temporal](https://github.com/temporalio/temporal/blob/main/README.md)
3. [Ollama](https://github.com/ollama/ollama/blob/main/README.md)
4. [Terraform](https://github.com/hashicorp/terraform/blob/main/README.md)
5. [LangGraph](https://github.com/langchain-ai/langgraph/blob/main/README.md)

Primary signals taken from these posts:
- consistent opening framing (problem + positioning)
- explicit install + quickstart path up front
- clear component/architecture summary section
- explicit scope/limitations and what not to expect
- concise doc map and version/signature information

---

## 1) Immediate deliverable (already completed)
- ✅ Reviewed Gold Standard Post patterns and existing README strategy:
  - `docs/GOLD_STANDARD_POST_PATTERNS.md`
  - `docs/handoffs/GOLD_STANDARD_POST_SHORT_2026-03-12_0356.md`
  - `docs/handoffs/GOLD_STANDARD_POST_FULL_2026-03-12_0356.md`
- ✅ Rewrote `README.md` with:
  - explicit 2.0 claim boundary
  - safe behavior section
  - three-lane architecture explanation
  - install/verification + config path
  - docs role map and version table

---

## 2) Continuous tightening cycles (next 2-3 passes)

### Pass A — Claim accuracy + evidence lock
- Audit every “Can do” statement in README against:
  - `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md`
  - `docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md`
- Replace ambiguous wording with outcome-based phrasing (e.g., “supports” / “does not support”).
- Add or remove bullets so README remains review-safe.
- Validate commands/docs links against existing files.

### Pass B — Readability + structure
- Run a section-by-section pass against `docs/GOLD_STANDARD_POST_PATTERNS.md`:
  - Problem statement clarity (≤5 sentences)
  - architecture clarity (table + concise flow)
  - installation path and troubleshooting first-run checks
  - role-based docs map
- Simplify any section over 250 words unless it adds direct operator value.

### Pass C — Technical depth calibration
- Rebalance detail from “everything” to “right overview + linked detail”:
  - keep core concepts, move deep internals to docs links
  - keep 2.0 boundary and security constraints highly visible
- Add one practical one-line example for each major lane:
  - working memory,
  - ingest,
  - operational learning.

### Pass D — Productization polish
- Confirm README opens with value proposition and a concrete use case.
- Confirm release versioning language is consistent with package/openclaw plugin versions.
- Add small badges/metadata if CI/release metadata is available and verifiable.

---

## 3) Integration into Gold Standard Post skill

### Build/update “Gold Standard Post” reusable template from this README
- Create a versioned template block with required sections:
  1) problem, 2) architecture, 3) install/first-run, 4) claims boundary, 5) docs map, 6) changelog
- Add an explicit “belongs/doesn’t belong” checklist used for every future posting.
- Add output modes (README, Discord status update, release post) so content can be repurposed without drift.

### Reuse for future products
- Store the template in a shared `docs/GOLD_STANDARD_POST_TEMPLATE.md`.
- Link this template into repo docs and future onboarding notes.
- Update this plan with lessons learned after each product posting cycle.

---

## 4) Review cadence and ownership

### Recurrence
- **Weekly:** quick lint-like pass on README for broken links and claim drift.
- **Bi-weekly:** full section pass against release boundary docs after any behavioral change.
- **Release:** mandatory “claim boundary review” checkpoint before any public post.

### Responsibility
- **Primary maintainer:** project lead / release owner
- **Reviewer:** 1 agent reviewer not involved in current release
- **Owner of final publication:** release steward for ai-projects channel + GitHub

### Exit criteria (for next publication)
- All claims in README are mapped to explicit evidence docs.
- Limitation section is unchanged for 2 weeks after merge (stability check).
- Docs links are verifiably valid from GitHub UI.
- First-run README + install flow validated on clean workspace.

---

## 5) Suggested next milestone
- Use this pass output as the authoritative Gold Standard Post draft.
- After the next functional 2.0 milestone, generate the public Discord/GitHub announcement directly from this structure.
- Keep README as the canonical source and treat the Gold Standard Post draft as a surface-specific derivative, not the source.


## 6) Upcoming v2.0 GitHub positioning iteration (new pass)

### Objectives
- Keep the README strictly product-page oriented (no deep implementation details).
- Lead with problem + context model + ClawText extension.
- Preserve 2.0 claim safety without turning the page into an engineering changelog.

### Pass checklist
1. **Narrative fit**
   - Problem statement is under 6 sentences.
   - LLM-memory explanation is understandable to a technical manager.
   - OpenClaw baseline is explained in one paragraph.
2. **Philosophy fit**
   - Simple / automatic / agent-assisted / CLI controls appears once in a single concise block.
3. **Feature architecture fit**
   - Three-lane architecture is clear and non-duplicative.
   - Technology summary highlights tradeoffs and boundaries.
4. **Positioning fit**
   - Comparative table is present and neutral.
5. **Actionability fit**
   - Installation is copy/paste and includes a separate agent-assisted path.
   - Tuning section is concise + links to detailed knobs.
6. **Evidence fit**
   - All claims map to `CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` and `CLAWTEXT_2_0_RELEASE_DEFINITION.md`.

### Exit criteria
- No reader should need command snippets before deciding whether ClawText solves their continuity problem.
- Claims remain consistent with v2.0 boundary docs.
- Supplementary docs links are all valid and intentional.
- Readme is suitable for both GitHub and downstream Gold Standard Post adaptation.
