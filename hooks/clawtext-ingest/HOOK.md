---
name: clawtext-ingest
description: "Captures the last 5 raw messages before compaction fires, then writes a compaction marker so clawtext-restore can inject a notice and tail on next bootstrap."
metadata: { "openclaw": { "emoji": "🗜️", "events": ["compaction:before", "compaction:after"] } }
---

# ClawText Compaction Tail Injection Hook

Fires on:
- `before_compaction` — reads last 5 messages from sessionFile, writes to `clawtext-tail-pending.json`
- `after_compaction` — reads pending tail, writes `clawtext-compaction-marker.json` with timestamp, sessionKey, channelId, and tail snapshot

## What the marker contains

```json
{
  "ts": 1234567890,
  "iso": "2026-03-29T21:00:00Z",
  "sessionKey": "agent:pylon:webchat:pylon-main",
  "channelId": "pylon-main",
  "compactedCount": 42,
  "messageCount": 8,
  "tail": [
    { "role": "user", "preview": "last message before compaction...", "ts": 1234567880 },
    ...
  ]
}
```

## How it integrates

`clawtext-restore` checks for this marker on `agent:bootstrap`. If found and recent (< 24h), it:
1. Prepends a compaction notice to the injected context block
2. Appends the tail messages after the summary

The marker is cleared after injection to avoid re-injecting on subsequent bootstraps.
