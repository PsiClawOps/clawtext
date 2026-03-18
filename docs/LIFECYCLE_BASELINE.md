---
doc: LIFECYCLE_BASELINE
version: 0.2.0
status: active
owner: PsiClawOps
last_updated: 2026-03-17
---

# Lifecycle Baseline — ClawText

## Repo identity
- Ancestors (if child): none
- Project name: clawtext
- GitHub identity profile: psiclawops
- Repo state: attach
- Project structure: standalone
- Ancestors: none (root standalone)
- Blade path: none

## ClawTomation baseline status
- Framework version: 2026-03-18.b
- Baseline version: 2026-03-17.a
- Last sync date: 2026-03-18
- Sync result: partially-synced-needs-github-settings

## Installed modules
- Core lifecycle docs: yes
- Enforcement stack: yes
- Output artifact discipline: yes
- Workstream clearinghouse: no
- Master/child coordination: no
- Private stealth hooks: yes
- Model policy: yes
  - policy doc: docs/MODEL_POLICY.md (inherited from ClawTomation framework)
  - model_policy_version: 1.0.0
  - tuning telemetry: heartbeat model_used + role_invoked fields

## GitHub settings status
- Conversation resolution required: no
- Workflow installed: yes
- PR template installed: yes
- Labels configured: yes
- Branch protection/rulesets configured: no (GitHub plan limit — private-stealth hooks active instead)
- Required status checks configured: no
- Direct push restrictions configured: no (private-stealth)

## Pending upgrades
- None

## Notes / exceptions
- ClawText is the sole public PsiClawOps repo.
- Pre-existing governance docs (NORTHSTAR, PRD, MILESTONES, FLIGHT_CONTROL, POST_BRIEF) retained as-is — rich pre-ClawTomation content.
- NORTHSTAR.md does not yet have ClawTomation YAML front matter (project_structure field) — retained in original format, no breaking change.
- Enforcement mode: private-stealth (github-hard blocked by GitHub plan).
