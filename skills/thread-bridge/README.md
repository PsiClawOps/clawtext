thread-bridge OpenClaw Skill

Overview

thread-bridge (v0.2) provides controlled cross-thread operations for Discord.
It supports both Forum posts (top-level posts in forum channels, type 15) and
Channel threads (threads spun off messages in regular text channels, type 0).

Primary functions:
- refreshThread(sourceThreadId, options, ctx)
- splitThread(sourceThreadId, newTitle, forumChannelId, options, ctx)
- freshThread(forumChannelId, title, seedText, options, ctx)
- getCallerContext(inboundMeta)

Key features
- Auto-context detection: pass the inbound metadata object injected by OpenClaw
  into getCallerContext() or provide it as the third parameter (ctx) to the
  primary functions. If absent, the skill defaults to the single-guild
  deployment guild id (1474997926919929927) with a logged warning.

- Effort levels for summarization (affects messageCount defaults, model selection, and style):
  - low: extractive bullets, fast/cheap (no LLM)
  - medium: short LLM summarization (model=main) — default
  - high: detailed LLM summarization (model=prd)
  - max: thorough LLM summarization (model=prd) with extra structure

Effort -> messageCount defaults (unless messageCount explicitly provided):
- refresh: low=50, medium=150, high=300, max=500
- split:   low=5,  medium=15,  high=30,  max=50
- fresh:   all -> 0

Usage examples (called by agent code):

const tb = require('skills/thread-bridge');

// Auto-context detection: inside an inbound message handler the agent can do:
const ctx = tb.getCallerContext(inboundMeta);
await tb.refreshThread('1234567890', { effort: 'medium' }, ctx);

// Natural language mappings the skill understands (documented for agent authors):
// "refresh this thread, low effort" -> { effort: 'low' }
// "split this, be thorough" -> { effort: 'max' }
// "fresh thread, just copy the title" -> { effort: 'low', messageCount: 0 }
// "refresh with full history" -> { effort: 'max' }

Notes
- Only allowed to create posts in the configured ALLOWED_FORUMS list.
- When targeting a forum channel the skill creates a Forum Post (top-level post).
- When targeting a regular text channel the skill creates a Channel Thread.
- Archiving requires confirmArchive:true to avoid accidental closures.
- All operations are logged to memory/thread-bridge-log.jsonl
