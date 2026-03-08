# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Thread Bridge Skill

Skill location: `~/.openclaw/workspace/skills/thread-bridge/`
Version: v0.2

### When to invoke
Trigger this skill whenever the user asks to:
- "refresh this thread" / "this thread is getting long, start a new one"
- "split this into a new thread/forum post" / "spin this off"
- "fresh start" / "new forum post for this idea" / "clean thread"
- "summarize and continue in a new post"
- Anything about context getting stale, thread too long, starting over, or continuing elsewhere

### Natural language → function mapping

| What user says | Function | Default effort |
|---|---|---|
| "refresh this thread" | `refreshThread(sourceThreadId)` | medium |
| "this thread is too long, start a new one" | `refreshThread(sourceThreadId)` | high |
| "do a full refresh" / "refresh with full history" | `refreshThread(sourceThreadId, {effort:'max'})` | max |
| "split this into [topic] in [forum]" | `splitThread(sourceThreadId, title, forumId)` | medium |
| "spin off a new thread about X" | `splitThread(...)` | medium |
| "be thorough" / "detailed split" | `splitThread(..., {effort:'high'})` | high |
| "fresh thread" / "new post in [forum]" | `freshThread(forumId, title, seedText)` | low |
| "clean start" / "just copy the title" | `freshThread(..., {effort:'low', messageCount:0})` | low |

### Effort levels

| Level | Messages | Model | Style |
|---|---|---|---|
| low | 50/5/0 | extractive (no LLM) | bullets |
| medium | 150/15/0 | gpt-5-mini | brief |
| high | 300/30/0 | claude-sonnet | detailed |
| max | 500/50/0 | claude-sonnet | full structure |

### Key defaults
- Target forum: same forum as source thread (auto-detected)
- Posts handoff link back to original: true (refresh/split), false (fresh)
- Archives original: false (always require explicit confirmation)

### Forum channel IDs
- ai-projects: 1475021817168134144
- vr-projects: 1475021931446272151
- coding-projects: 1475021987628712029
- work-misc-projects: 1475022122861461606
- current-architecture: 1475373158260277298
- rgcs-projects: 1476018965284261908
- moltmud-projects: 1477543809905721365
- misc-projects: 1478859644633088064
- 3d-printing-projects: 1475021875024494612

### Guild ID
1474997926919929927

### Notes
- Forum post (type 15 parent) vs channel thread (type 0 parent) — auto-detected by target channel type
- Context auto-detected from inbound metadata (guildId, channelId, threadId) — no need to pass manually
- All operations logged to `memory/thread-bridge-log.jsonl`

---

Add whatever helps you do your job. This is your cheat sheet.
