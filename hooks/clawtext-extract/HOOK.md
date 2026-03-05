---
name: clawtext-extract
description: "Buffers inbound/outbound messages to a file for periodic LLM-based memory extraction"
metadata: { "openclaw": { "emoji": "🧠", "events": ["message:preprocessed", "message:sent"] } }
---

# ClawText Auto-Extract Hook

This hook fires on every message (received or sent) and appends it to a rolling
buffer file at `memory/extract-buffer.jsonl`. A separate cron job reads that
buffer every 20 minutes, uses an LLM to extract meaningful facts, decisions, and
learnings, and writes them into the daily memory file — fully automatically.

## What It Captures

- Every inbound message (after full media/link processing)
- Every outbound agent response

## What It Does NOT Do

- It does not call LLMs inline (stays fast / non-blocking)
- It does not write memory directly (the cron job does that)

## Buffer File

`~/.openclaw/workspace/memory/extract-buffer.jsonl` — one JSON record per line.
Records older than 24 hours are pruned by the cron job.
