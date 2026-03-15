# START_HERE — Choose Your Path

**Pick your role below. This guide shows you exactly where to start.**

---

## 🚀 I Just Want It Running (5 minutes)

→ Read: `AGENT_INSTALL.md` (copy-paste commands)

Then:
1. `openclaw plugins install @openclaw/clawtext`
2. Run your agent
3. ClawText works automatically

**Done.** Memory will start capturing on the next run. You don't need to do anything else.

---

## 🏗️ I Need to Understand How It Works (20 minutes)

→ Read: `README.md` (this will make sense now) → `docs/ARCHITECTURE.md`

This covers:
- How the three lanes work
- Why file-first state matters
- How hybrid retrieval avoids vendor lock-in
- Scheduled maintenance and why it helps

**Then decide:** Do I need to tune it? (see below)

---

## ⚙️ I Need to Tune It for My Setup (30 minutes)

→ Read: `docs/CONFIGURATION.md` → `README.md` section "Tuning for Your Situation"

**Find your scenario:**
- Token budget is tight → use `minConfidence: 0.8`, fewer memories
- Knowledge-rich project → use ingest, daily rebuilds
- Production default → use recommended config

Then copy the config snippet and update your `~/.openclaw/config.yaml`.

**Verify:** `openclaw plugins list` should show clawtext active.

---

## 📚 I Need to Import My Existing Knowledge (15 minutes)

→ Read: `docs/INGEST.md`

This covers:
- GitHub repos (docs, decision logs)
- Markdown files and directories
- Discord forum archives
- JSON exports

```bash
# Example: import your docs repo
clawtext ingest \
  --source=github:https://github.com/yourorg/docs \
  --type=repo \
  --priority=high
```

**Verify:** Next agent run should reference docs automatically.

---

## 🎯 I Want to Set Up Operational Learning (20 minutes)

→ Read: `docs/OPERATIONAL_LEARNING.md`

This covers:
- Capture failures automatically
- Review queue (what should become organizational wisdom?)
- Promotion (mark as "known issue + workaround")
- Retrieval (agents get wisdom automatically)

```bash
clawtext operational-learning enable \
  --review-queue=true \
  --promotion-threshold=3
```

**Then:** Wait for 3 recurrences of a failure. ClawText flags it. You review and promote if it's a real pattern.

---

## 🔧 Something Isn't Working (10 minutes)

→ Read: `TROUBLESHOOTING.md`

If that doesn't help:
1. Check `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` (what's actually supported?)
2. Check `docs/CLAWTEXT_GAP_MATRIX_2026-03-14.md` (known issues)
3. Check agent logs: `openclaw logs --plugin=clawtext`

**Debug command:**
```bash
clawtext debug --show-state --show-retrieval --last-run
```

---

## 🏛️ I'm a Tech Lead / DevOps (40 minutes)

→ Read in order:
1. `README.md` (value prop + architecture)
2. `docs/ARCHITECTURE.md` (technical details)
3. `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` (what ClawText promises)
4. `docs/INTERACTION_OPS_MEMORY_CONTRACT.md` (how it integrates with ops)
5. `RISK.md` (what are the failure modes?)

**Key decisions:**
- Storage location: `state/clawtext/prod/` (canonical)
- Maintenance: weekly cluster rebuilds (tunable)
- Backups: stored in `state/clawtext/prod/backups/`
- Logs: `openclaw logs --plugin=clawtext`

---

## 👷 I'm Building on Top of ClawText (60 minutes)

→ Read in order:
1. `docs/ARCHITECTURE.md` (understand the layers)
2. `docs/INTERACTION_OPS_MEMORY_CONTRACT.md` (integration points)
3. `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` (what it guarantees)
4. `SKILL.md` (formal definition)

**Extension points:**
- Custom ingest sources (implement the `IngestAdapter` interface)
- Custom retrieval ranking (add to hybrid ranking pipeline)
- Custom operational capture (hook into failure capture)
- Custom storage backends (must implement file export)

See `docs/EXTENDING_CLAWTEXT.md` for details.

---

## 📖 I Want the Complete Picture (2 hours)

→ Read everything in order:

1. `README.md` — Get the story
2. `AGENT_INSTALL.md` — Install it
3. `docs/ARCHITECTURE.md` — Understand the design
4. `docs/INGEST.md` — Import knowledge
5. `docs/OPERATIONAL_LEARNING.md` — Set up learning
6. `docs/CONFIGURATION.md` — Tune everything
7. `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` — What it promises
8. `docs/CLAWTEXT_2_0_RELEASE_DEFINITION.md` — What's in v2.0?
9. `RISK.md` — What can go wrong?
10. `SECURITY.md` — Privacy / data handling

---

## Quick Links

| I Want To... | Read This |
|---|---|
| Install | `AGENT_INSTALL.md` |
| Understand the value prop | `README.md` |
| Understand the architecture | `docs/ARCHITECTURE.md` |
| Import my docs | `docs/INGEST.md` |
| Set up learning | `docs/OPERATIONAL_LEARNING.md` |
| Tune for my use case | `docs/CONFIGURATION.md` |
| Fix a problem | `TROUBLESHOOTING.md` |
| Understand the contracts | `docs/MEMORY_POLICY_TRIGGER_CONTRACT.md` |
| Know the limitations | `docs/CLAWTEXT_2_0_SUPPORTED_BEHAVIOR_AND_LIMITATIONS.md` |
| Understand the risks | `RISK.md` |
| Extend it | `docs/EXTENDING_CLAWTEXT.md` |

---

**Pick your path above. Come back here if you get lost.**
