---
name: clawtext-graft
description: "Detects cross-provider session transitions and grafts tool call pairs into plain text for continuity. Runs on gateway startup (proactive sweep) and message:preprocessed (runtime guard)."
metadata: { "openclaw": { "emoji": "🔗", "events": ["gateway:startup", "message:preprocessed"], "requires": { "bins": ["node"] } } }
---

# ClawText Session Grafter

Detects when a session transcript contains tool call IDs from multiple incompatible
providers (e.g., copilot-local `tooluse_*` IDs hitting Anthropic's Messages API, or
mixed Chat Completions / Responses API histories). When mismatch is found, the hook
grafts tool call + result pairs into readable plain text, removing the structured
tool blocks that the new provider would reject.

## When It Fires

- **`gateway:startup`**: Proactive sweep — scans all active session transcripts on
  gateway boot. This catches contaminated transcripts before they're replayed,
  preventing the 400-rejection → compaction-loop crash that occurs when a provider
  encounters foreign tool call IDs during session load.

- **`message:preprocessed`**: Runtime guard — fires on each incoming message to catch
  provider switches that happen mid-session (e.g., rate-limit failover). Uses the
  session entry's `sessionFile` to locate the transcript.

## What It Does

1. Reads the session JSONL transcript
2. Detects all API types from tool call ID prefixes (`toolu_*`, `call_*`, `tooluse_*`, `oc_*`)
3. If incompatible APIs are mixed (stateful + stateless), grafts the transcript:
   - Flattens tool call blocks into `📎 **toolName** args → result` text blocks
   - Removes consumed `toolResult` entries
   - Strips orphaned tool results
   - Removes error-stub assistant messages
4. Writes the grafted transcript back (original preserved as `.pre-graft.bak`)
5. Logs all graft events to `state/clawtext/prod/graft-log.jsonl`

## Compatibility Rules

- **Stateless APIs** (Chat Completions variants: `anthropic-messages`, `openai`, `copilot-local`):
  Compatible with each other. Tool call IDs just need internal call↔result consistency.
- **Stateful APIs** (`openai-codex-responses`, `openai-responses`): NOT compatible with
  anything else — they track `call_id`s server-side and reject IDs they didn't issue.

Grafting only triggers when a stateful API is mixed with a non-stateful one.

## Requirements

- Node.js must be installed
- Session transcript must exist at the path in session entry's `sessionFile`
