# RISK.md — ClawText Risk Register

This file tracks the main operational and security risks for ClawText, along with mitigations and monitoring guidance.

## Scale

- **Severity:** low / medium / high / critical
- **Likelihood:** low / medium / high

---

## Risk register

| Risk | Severity | Likelihood | Why it matters | Mitigations | Monitor |
|---|---|---:|---|---|---|
| Secret leakage into memory | critical | medium | Durable memory should never store API keys, passwords, or tokens | hygiene patterns, audit tooling, named redactions, operator review | hygiene audit, memory review |
| Prompt injection via ingest | critical | medium | External content could try to become instruction flow | treat external content as data, review-based ingest, future injection detectors, no automatic trust escalation | suspicious ingest review, operational learnings |
| Raw log / tool dump pollution | high | high | Large logs bury real knowledge and wreck retrieval quality | `_raw_log` tagging, cluster noise filtering, operational lane separation | validation runs, cluster diff review |
| Cross-project contamination | high | medium | Wrong memories can steer the agent badly | project-aware retrieval, anti-pattern walls, confidence thresholds | graph review, retrieval validation |
| Oversized prompt injection | high | medium | Too much context harms model performance and increases cost | token budgeting, max memories, validation scripts, noise filtering | validate-rag, prompt inspections |
| False promotions into durable guidance | high | medium | Weak or wrong patterns can permanently bias future behavior | review queue, approval-gated promotion, explicit promotion targets | operational review stats |
| Hidden state / poor auditability | medium | low | Hard-to-debug systems drift over time | file-based storage, explicit artifacts, visible cluster outputs | git diffs, file inspection |
| Browser/operator misuse | medium | medium | UI could expose too much or encourage careless changes | local/Tailscale deployment, operator awareness, safe defaults | deployment review |
| Ingest dedupe failure | medium | low | Duplicate data bloats clusters and retrieval quality | persistent hash store, repeatable ingest checks | `.ingest_hashes.json`, ingest reports |
| Hot-cache drift / stale clusters | medium | medium | Retrieval quality degrades if clusters lag reality | scheduled rebuilds, validation, maintenance review | cluster rebuild cadence, validation score |

---

## Highest-priority items

### 1. Secret leakage into memory
The worst failure mode. If ClawText stores secrets, later prompt injection or retrieval can amplify the damage.

### 2. Prompt injection via ingest
The most adversarial failure mode. External data must never be allowed to redefine system behavior.

### 3. Raw log pollution
The most common practical failure mode. Even without a hostile actor, giant logs can poison retrieval and blow up token usage.

---

## Current mitigation status

- **Implemented:** hygiene patterns, raw-log tagging, cluster noise filtering, anti-pattern walls, validation tooling
- **Partially implemented:** full ingest-path sanitization, stronger injection-pattern detection
- **Ongoing:** review flow maturity, operator tooling, retrieval quality tuning

---

## Review cadence

Review this file when:

- new ingest sources are added
- new secret types appear in memory audits
- retrieval quality drops after architecture changes
- operator tooling changes the attack surface
- a real failure or near-miss happens

---

## Ownership

Primary owner: repository maintainer / operator  
Secondary owner: agent team working on ClawText review and maintenance
