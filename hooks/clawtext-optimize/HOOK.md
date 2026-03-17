---
name: clawtext-optimize
description: "Before prompt build, score/select context sections within budget. Defaults to passthrough unless explicitly enabled."
metadata: { "openclaw": { "emoji": "🧠", "events": ["plugin:before_prompt_build"] } }
---

# Clawptimization Hook

Clawptimization runs at `before_prompt_build` and evaluates context sections using scoring + byte budget constraints.

## Passthrough-by-default guarantee

No behavior changes occur unless you explicitly enable it.

Default config (`~/.openclaw/workspace/state/clawtext/prod/optimize-config.json`):

```json
{
  "enabled": false,
  "budgetBytes": 32000,
  "minScore": 0.25,
  "preserveReasons": true,
  "strategy": "passthrough",
  "logDecisions": true
}
```

If `enabled` is `false` **or** `strategy` is `"passthrough"`, the hook returns nothing.

## Strategies

- `passthrough`: include everything, no mutation.
- `scored-select`: sort by score and include highest value sections within budget.
- `budget-trim`: keep order, include while it fits and meets minimum score.

## What gets logged

Append-only JSONL log file:

`~/.openclaw/workspace/state/clawtext/prod/optimization-log.jsonl`

Each entry includes session key, channel hint, budget, included/dropped counts, byte usage, token estimate, per-slot reasons, and drop reasons.

## Reading reports

Use:

```bash
npm run optimize:report
npm run optimize:report:last
```

Optional flags:

```bash
node scripts/optimization-report.mjs --last 25 --channel C123 --verbose
```
