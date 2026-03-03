# ClawText Agent Onboarding Guide

This file guides agents through setting up ClawText for optimal memory system configuration.

## Pre-Onboarding Checks

Agent should verify these are already deployed:

- ✅ ClawText RAG plugin installed at `~/.openclaw/workspace/skills/clawtext-rag/`
- ✅ Memory files exist at `~/.openclaw/workspace/memory/`
- ✅ Clusters built at `~/.openclaw/workspace/memory/clusters/`

If any are missing, ask user to deploy from GitHub before proceeding.

---

## Onboarding Flow

### Phase 1: Verify Current Setup (5 min)

Run diagnostic:

```bash
echo "Checking ClawText status..."
echo "Skill location:" $(ls -d ~/.openclaw/workspace/skills/clawtext-rag 2>/dev/null && echo "✅" || echo "❌")
echo "Memory files:" $(ls -1 ~/.openclaw/workspace/memory/*.md 2>/dev/null | wc -l) "files"
echo "Clusters:" $(ls -1 ~/.openclaw/workspace/memory/clusters/*.json 2>/dev/null | wc -l) "clusters"
echo "RAG config:" $(grep -c "clawtext-rag" ~/.openclaw/openclaw.json) "matches"
```

**Report to user:** "ClawText RAG system is [active/needs setup]. Current: X memories, Y clusters."

---

### Phase 2: Ask About Deduplication (2 min)

**Question to user:**

> "ClawText Ingest includes automatic deduplication via SHA1 hashing. When you add new knowledge (docs, chats, API responses), duplicates are automatically skipped.
>
> Would you like me to document the deduplication best practices for your team? (Recommended if you'll be doing recurring ingestion tasks)"

**If Yes:**
- Point user to `~/.openclaw/workspace/skills/clawtext-ingest/README.md`
- Note: Always call `.commit()` after ingest to persist hash file

**If No:**
- Continue to Phase 3

---

### Phase 3: Ask About Cluster Rebuild Automation (3 min)

**Question to user:**

> "ClawText clusters need to be rebuilt when new memories are added to keep your search index fresh. This can happen:
>
> **Option A (Manual):** You manually run `node build-clusters.js --force` when you add knowledge
>
> **Option B (Automatic):** I set up a weekly cron job (Sundays 02:00 UTC) to rebuild automatically
>
> Which works better for your workflow?"

**If Option A (Manual):**
- Document the manual rebuild command in their onboarding notes
- Suggest: Add to `CURRENT_WORK.md` as a reminder if memory updates happen

**If Option B (Automatic):**
- Create the cron job:

```bash
cron(action=add, job={
  name: "Rebuild ClawText clusters (weekly)",
  schedule: { kind: "cron", expr: "0 2 * * 0", tz: "UTC" },
  payload: { 
    kind: "systemEvent", 
    text: "Rebuilding ClawText clusters to index new memories"
  },
  sessionTarget: "main",
  enabled: true
})
```

- Verify it's created:
```bash
cron(action=list)
```

- Report: "✅ Automatic cluster rebuild enabled for Sundays 02:00 UTC"

---

### Phase 4: Verify RAG Injection (2 min)

Test that RAG injection is working:

```javascript
// Simulate a query to verify memory injection
const testQuery = "test memory system";
// This would show injected memories in the next agent response
```

**Report to user:** "RAG injection is [active/inactive]. Next agent queries will automatically include relevant memories."

---

### Phase 5: Document Settings (1 min)

Ask user if they want custom RAG tuning:

**Default config:**
- maxMemories: 7
- minConfidence: 0.70
- tokenBudget: 4,000

**Question to user:**

> "Your RAG system is configured with defaults (7 memories, 0.70 confidence threshold, 4k token budget). These work for most workflows.
>
> Do you want to customize these settings, or keep defaults?"

**If Keep Defaults:**
- No action needed. Document: "Using default ClawText RAG settings"

**If Customize:**
- Ask specific questions:
  - "How many memories should be injected per query?" (suggest 5-10)
  - "How strict should relevance filtering be?" (0.50-0.85)
  - "How many tokens max for memory injection?" (2000-8000)
- Edit file: `~/.openclaw/workspace/skills/clawtext-rag/plugin.js`
- Require gateway restart (get confirmation first)

---

## Onboarding Completion Checklist

Agent should confirm completion:

- [ ] ClawText RAG plugin verified installed
- [ ] Deduplication practices documented (if applicable)
- [ ] Cluster rebuild strategy decided (manual or automatic)
- [ ] RAG injection confirmed working
- [ ] RAG configuration finalized (defaults or custom)
- [ ] All settings documented in user's local notes

---

## Post-Onboarding: Agent Responsibilities

Once configured, agents should:

1. **After bulk memory imports:** Run `build-clusters.js --force` (if manual mode) or wait for weekly cron (if automatic)
2. **Before major queries:** Verify RAG injection is active by checking plugin.js
3. **When tuning:** Test with `node scripts/validate-rag.js` (if implemented) to measure injection quality
4. **Report issues:** If RAG injection seems stale or irrelevant, run cluster rebuild manually

---

## Troubleshooting

### "RAG injection doesn't seem to be working"

Check:
```bash
# Verify plugin is enabled
grep -A5 "clawtext-rag" ~/.openclaw/openclaw.json

# Verify clusters exist
ls ~/.openclaw/workspace/memory/clusters/ | wc -l

# Rebuild clusters
node ~/.openclaw/workspace/skills/clawtext/scripts/build-clusters.js --force

# Restart gateway
openclaw gateway restart
```

### "Clusters are stale"

Run:
```bash
node ~/.openclaw/workspace/skills/clawtext/scripts/build-clusters.js --force
```

### "Too many/too few memories being injected"

Adjust in `~/.openclaw/workspace/skills/clawtext-rag/plugin.js`:
```javascript
maxMemories: 7  // Change to 5 (fewer) or 10 (more)
```

Then restart gateway.

---

## Questions for Agent to Ask User

If any step is unclear, agent should ask:

1. "Should I enable automatic cluster rebuild?"
2. "Do you want custom RAG tuning or should I use defaults?"
3. "Would you like me to document deduplication practices for your workflows?"
4. "Should I verify RAG injection by running a test query?"

---

**Last Updated:** 2026-03-03  
**Agent Author:** lumbot  
**Scope:** ClawText system onboarding only
