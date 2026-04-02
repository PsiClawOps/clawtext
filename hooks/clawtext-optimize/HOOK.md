---
name: clawtext-optimize
description: "Context pressure management hook. Monitors token usage and applies graduated relevance-weighted pruning before OpenClaw core's oldest-first eviction fires. Prevents context overflow crashes."
metadata: { "openclaw": { "emoji": "⚡", "events": ["message:preprocessed"], "requires": { "bins": ["node"] } } }
---

# ClawText Context Optimizer

Monitors context pressure on every `message:preprocessed` event and applies graduated
relevance-weighted pruning when pressure exceeds thresholds — before OpenClaw core's
`tool-result-context-guard` fires its blunt oldest-first eviction.

## When It Fires

- **`message:preprocessed`**: Runs on every incoming message. No-ops when pressure is
  below the trigger threshold (0.60). Invisible until needed.

## Pruning Passes

- **Pass 1 (60–70%)**: Tool result compression. Truncates large tool outputs, aggressively
  compresses outputs from completed WORKQUEUE items.
- **Pass 2 (70–80%)**: Mid-history de-duplication. Collapses repeated file reads, repeated
  status commands, and removes compaction marker stubs.
- **Pass 3 (80–85%)**: Deep scored pruning. Scores messages by recency, content type, and
  WORKQUEUE relevance. Writes checkpoint before shedding. Removes lowest-scoring messages
  to bring pressure below 75%.

## Protected Content (never pruned)

- System messages
- Last 20 messages (recent window)
- Checkpoint markers
- Messages from active WORKQUEUE item creation forward

## Config

Reads `optimize-config.json` from `{workspace}/state/clawtext/prod/optimize-config.json`.
Falls back to hardcoded defaults if missing.

## Observability

Logs all pruning decisions to `state/clawtext/prod/optimize-log.jsonl`.
