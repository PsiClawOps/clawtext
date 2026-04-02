---
name: clawtext-si-shadow
description: "Shadow feeds every message into the Session Intelligence SQLite DB while the legacy context engine remains active. Builds warm per-workspace DBs for a controlled switchover to clawtext-session-intelligence without cold-start risk."
metadata: { "openclaw": { "emoji": "👥", "events": ["message:received", "message:preprocessed", "message:sent"] } }
---

# ClawText Session Intelligence Shadow Feed

Fires on inbound/outbound message lifecycle events while the legacy context engine is active.

## What it does

1. Subscribes to `message:received`, `message:preprocessed`, and `message:sent` so it can observe both raw inbound delivery and later normalized message stages
2. Reads runtime context from `event.context` (or a second `ctx` arg when available) and resolves the session's workspace directory from sessionKey for diagnostics
3. Calls the registered workspace-aware SI engine router with the session key
4. Router opens (or reuses) the SI SQLite DB for that workspace at `{workspace}/.clawtext/session-intelligence.db`
5. Zero impact on legacy context assembly — this is purely additive

## Runtime contract note

For managed OpenClaw message hooks, the safe assumption is **event-first** invocation: message/session data may arrive on the single event object under `event.context`, not as a guaranteed second positional `ctx` argument. Shadow handlers should support both forms defensively; otherwise they can fail silently and appear "registered but idle."

## Why it exists

Switching from `plugins.slots.contextEngine: "legacy"` to `"clawtext-session-intelligence"` on a live session
risks a cold SQLite DB — `assemble()` falls back to runtime filtering which may drop messages. This hook
builds the DB warm so the switchover is a config change + restart, not a cold start.

## Workspace resolution

Uses the same sessionKey-based resolution as the SI engine:
1. Parse `agent:<agentId>:...` from sessionKey
2. Look up agentId in openclaw.json agents config to find workspace dir
3. Fall back to DEFAULT_WORKSPACE if anything fails

Forge note: `agent-session-state.json` may be stale for sessions inactive since last restart —
pre-switchover validation must verify per-session DB existence and content, not just hook success.
