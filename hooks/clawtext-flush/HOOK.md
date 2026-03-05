---
name: clawtext-flush
description: "Flushes unprocessed conversation buffer to memory on session reset (/new). Ensures no content is lost between 20-min extraction cron windows."
metadata: { "openclaw": { "emoji": "💾", "events": ["agent:reset"] } }
---

# ClawText Session-End Flush Hook

Fires when the agent session is reset (`/new`). Immediately writes any unprocessed
buffer records from `memory/extract-buffer.jsonl` into today's daily memory file as
a session snapshot, then triggers a background cluster rebuild.

This ensures content is never lost between 20-minute extraction cron windows.

## What It Does

1. Reads unprocessed records from the buffer (since last extraction watermark)
2. If 3+ records exist, writes a session snapshot to `memory/YYYY-MM-DD.md`
3. Updates the state watermark so the LLM extraction cron doesn't double-process
4. Fires a background cluster rebuild (non-blocking)

## What It Does NOT Do

- No LLM calls (stays fast/synchronous)
- Does not replace the 20-min LLM extraction cron (that handles quality extraction)
- Does not block the reset operation
