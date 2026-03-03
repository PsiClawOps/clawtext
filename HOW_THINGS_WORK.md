---
date: 2026-03-03
project: all
type: code-pattern
area: operations
entities: [OpenClaw, gateway, memory, discord, git]
pattern-key: operations.how_things_work
keywords: [procedures, operations, debugging, deployment, restart, workflow]
---

# HOW_THINGS_WORK.md — Operational Procedures

**Last Updated:** 2026-03-03 10:00 UTC

This file documents **how to do things** in the system. Read this when you need to perform an action.

---

## 🔧 Core Operations

### 1. Restart the Gateway (Requires User Confirmation)

**When:** After config changes, plugin updates, or crashes

**Process:**
```bash
# Step 1: Check active sessions
sessions_list --limit 20

# Step 2: Send confirmation message to user
message(action=send, channel=discord, 
  message="🔄 Ready to restart when you are.
Changes: [list what changed]
Active sessions: [list, or 'none']
Impact: [what gets interrupted]")

# Step 3: WAIT FOR USER TO SAY "go ahead" or "restart" or "do it"

# Step 4: Only then trigger restart
gateway(action=restart, note="[human-readable reason]")

# Step 5: System auto-pings last active session when back up
```

**Important:**
- ❌ NEVER restart without explicit user confirmation
- ❌ Always check sessions_list first (if agents running, user may want to wait)
- ✅ Include impact summary in confirmation message
- ✅ Use clear human language in `note` parameter

---

### 2. Deploy or Update a Skill

**Example: ClawText RAG Plugin**

```bash
# Step 1: Update source files
~/.openclaw/workspace/skills/clawtext-rag/plugin.js
~/.openclaw/workspace/skills/clawtext-rag/src/rag.js

# Step 2: Verify skill is registered in openclaw.json
cat ~/.openclaw/openclaw.json | grep -A5 "clawtext-rag"

# Step 3: Test locally (if applicable)
cd ~/.openclaw/workspace/skills/clawtext-rag
npm test (or node test.mjs)

# Step 4: Restart gateway
gateway(action=restart, note="Updated ClawText RAG plugin")

# Step 5: Verify with a test query
# (RAG injection should activate automatically)
```

---

### 3. Update Memory & Rebuild Clusters

**When:** After adding/modifying memory files

```bash
# Step 1: Add YAML headers to memory files (if new)
# Template: see DAILY_LOG_TEMPLATE.md

# Step 2: Rebuild clusters
cd ~/.openclaw/workspace/skills/clawtext
node scripts/build-clusters.js --force

# Step 3: Check output
# Should show: "15+ clusters produced, 700+ memories indexed"

# Step 4: No restart needed (clusters loaded dynamically)

# Step 5: Validate RAG injection quality
node scripts/validate-rag.js --verbose

# Step 6: Review recommendations from validation tool
# (Tool samples 9 queries, reports confidence, suggests tuning)
```

**Automating Cluster Rebuild (Optional):**

To keep clusters fresh automatically, create a weekly cron job:

```bash
cron(action=add, job={
  name: "Rebuild ClawText clusters (weekly)",
  schedule: { kind: "cron", expr: "0 2 * * 0", tz: "UTC" },
  payload: { 
    kind: "systemEvent", 
    text: "Rebuilding ClawText clusters to index new memories" 
  },
  sessionTarget: "main",
  enabled: false  # Agent/user enables during onboarding
})
```

**Agent Onboarding Question:**
When an agent joins and discovers the ClawText system, ask the user:

> "Would you like me to set up automatic cluster rebuilds every Sunday at 02:00 UTC? This keeps memory search fresh after you add new knowledge. I can enable it now, or you can configure it manually later."

If user agrees, set `enabled: true` in the cron job above.

---

### 4. Validate RAG Quality (Phase 2 Tool)

**When:** After rebuilding clusters, or to troubleshoot poor memory injection

```bash
cd ~/.openclaw/workspace/skills/clawtext
node scripts/validate-rag.js            # Concise report
node scripts/validate-rag.js --verbose  # Detailed results per query
node scripts/validate-rag.js --output json  # Machine-readable format
```

**Output Includes:**
- 9 sample queries across projects (MoltMUD, OpenClaw, Memory System)
- Per-query confidence scores (0.0–1.0)
- Memory count per query
- Overall quality score (0–100%)
- Tuning recommendations based on results

**When to Use:**
- After `build-clusters.js --force` (verify clusters were rebuilt correctly)
- If agents report missing context (check if injection is working)
- Before adjusting RAG tuning (baseline before/after comparison)
- During onboarding (verify system is operational)

---

### 5. Launch MoltMUD Phase 2 Streams

**When:** Ready to build Perception, Memory, Executor modules

**Process:**

```bash
# Step 1: Create Discord forum post for Stream 1
message(action=thread-create,
  channel=1475021817168134144,  # ai-projects forum
  name="[gpt-5-mini] Perception Module — Parse LOOK/STAT to JSON",
  message="[Full specification from brief]")

# Step 2: Wait for lumbot (me) to respond with code
# (User then answers Q&A in-thread)

# Step 3: Repeat for Stream 2 (Memory) and Stream 3 (Executor)

# Step 4: Monitor for completions (~45 min total)

# Step 5: Extract Memory schema from Stream 2 result

# Step 6: Provide schema to Stream 4 (Decision Module)
```

---

## 🔍 Debugging & Diagnostics

### Diagnose 400 Error

**When:** Discord messages fail with `invalid_request_body`

```bash
# Step 1: Check gateway logs
openclaw status

# Step 2: Look for error pattern
# - If context overflow: reduce maxMemories in plugin.js
# - If tool formatting: check message() tool call structure

# Step 3: Test with minimal message
message(action=send, channel=discord, message="Test")
# If works, issue is with complex messages

# Step 4: Reduce RAG injection if needed
# Edit: ~/.openclaw/workspace/skills/clawtext-rag/plugin.js
# Change: maxMemories: 7 → 5 (reduce context)
# Restart gateway

# Step 5: Re-test
```

### Diagnose Cron Timeout

**When:** error-monitor or background-light-agent fails repeatedly

```bash
# Step 1: Check job logs
cron(action=runs, jobId=1984869e-de56-492d-a8b5-d3ef4b8e118c)

# Step 2: Look at last execution
# - Check: what LLM work was requested?
# - Check: how long did it take?
# - Check: did it timeout or fail?

# Step 3: Options to fix:
# A) Reduce work (simplify LLM prompt)
# B) Increase timeout (in cron job config)
# C) Switch to cheaper model (GitHub Copilot FREE)
# D) Reschedule (longer interval, less frequent)

# Step 4: Update job
cron(action=update, jobId=1984869e-de56-492d-a8b5-d3ef4b8e118c, 
  patch={timeoutSeconds: 60})  # increase timeout example

# Step 5: Monitor next run
```

### Check System Health

```bash
# Full status
openclaw status

# List active sessions
sessions_list --limit 20

# Check memory/cluster status
ls ~/.openclaw/workspace/memory/clusters/
wc -l ~/.openclaw/workspace/memory/clusters/*.json

# Check cron jobs
cron(action=list)

# Verify RAG is working
grep "clawtext-rag" ~/.openclaw/openclaw.json

# Validate RAG quality
node ~/.openclaw/workspace/skills/clawtext/scripts/validate-rag.js
```

---

## 📥 Data Ingestion & Deduplication

**When:** Importing memories from files, URLs, chat exports, or API responses

### Standard Ingestion Flow

```bash
# Step 1: Use ClawText Ingest for multi-source ingestion
cd ~/.openclaw/workspace/skills/clawtext-ingest

# Step 2: Write ingest script
node -e "
import ClawTextIngest from './src/index.js';
const ingest = new ClawTextIngest();

// Ingest from markdown files
await ingest.fromFiles(['docs/**/*.md'], { 
  project: 'docs', 
  type: 'fact' 
});

// Ingest from JSON (e.g., Discord export, API response)
await ingest.fromJSON(chatArray, 
  { project: 'team', type: 'decision' },
  { keyMap: { contentKey: 'message', dateKey: 'timestamp', authorKey: 'user' } }
);

// Ingest from raw text
await ingest.fromText(content, 
  { project: 'notes', type: 'learning', filename: 'custom-name.md' }
);

// Run all sources and persist hashes
const result = await ingest.ingestAll([...]);
console.log(\`Imported: \${result.totalImported}, Skipped: \${result.totalSkipped}\`);
"

# Step 3: Verify no duplicates
# - Check output: "Skipped: X" (means duplicates were detected & skipped)

# Step 4: Rebuild clusters
node ~/.openclaw/workspace/skills/clawtext/scripts/build-clusters.js --force

# Step 5: Validate injection
node ~/.openclaw/workspace/skills/clawtext/scripts/validate-rag.js

# Step 6: No restart needed (RAG reloads clusters automatically)
```

### Why Deduplication Matters

- **Problem:** Ingesting the same knowledge multiple times creates duplicate memories
- **Solution:** SHA1 hashing via `.ingest_hashes.json` prevents re-ingestion
- **Result:** Safe to run same ingest job 100x → zero duplicates

**Key:** Always call `.commit()` (or let `ingestAll()` handle it) to persist hashes to disk.

### Agent Ingestion Workflows

Agents can safely use ingestion in recurring tasks:

```javascript
// Example: Daily memory sync (safe to run every day)
import ClawTextIngest from './src/index.js';

async function dailyMemorySync() {
  const ingest = new ClawTextIngest();
  
  // This runs daily, but deduplication prevents duplicate entries
  await ingest.fromFiles(['data/**/*.md'], { project: 'daily' });
  const result = await ingest.ingestAll([...]);
  
  // Report: some new (imported), some skipped (duplicates)
  return result;
}
```

---

## 📝 Workflow Patterns

### Pattern 1: Add New Memory Section (MEMORY.md)

```markdown
---
date: YYYY-MM-DD
project: [moltmud|openclaw|rgcs|clawtext|memory-system]
type: [fact|decision|protocol|error-pattern|code-pattern|identity|learning]
area: [optional, e.g., game-mechanics|config|operations]
entities: [ENTITY1, ENTITY2, ENTITY3]
pattern-key: [section.topic_key] # for error patterns
keywords: [keyword1, keyword2, keyword3]
---

## Section Title

Content here.
```

### Pattern 2: Update Daily Log (memory/YYYY-MM-DD.md)

**Use DAILY_LOG_TEMPLATE.md as copy-paste base**

Structure:
```
---
date: 2026-03-03
project: [primary project name]
type: [fact|decision|code-pattern|error-pattern|learning]
entities: [entities discovered/worked with]
keywords: [relevant keywords]
---

## Session Summary

What happened, decisions made, issues resolved.

### Key Points
- Bullet 1
- Bullet 2
```

### Pattern 3: Create Discord Forum Post (MoltMUD Streams)

**Format:**

```
🤖 [gpt-5-mini] Stream 1: Perception Module

## Specification
[Detailed spec from brief]

## Input/Output Examples
[Show what the module receives and produces]

## Key Challenges
[Any known complexity]

## Questions for ragesaq
[If any decisions needed]
```

---

## 🚀 Deployment Checklist

### Before Deploying MoltMUD to Production

- [ ] All 6 streams completed (Perception, Memory, Executor, Decision, Integration, Test)
- [ ] Test suite passing (150+ test cases)
- [ ] ZORTHAK verified alive in-game
- [ ] Bridge health checks passing
- [ ] Docker image built and tested locally
- [ ] CrustServ game server reachable (telnet 10.122.0.111:23)
- [ ] Sysop account verified (mud-admin SSH working)

### Before Deploying RGCS Update

- [ ] Version bumped in: RGCSDriver.h, version.rc, overlaycontroller.h, RGCS.rc
- [ ] CHANGELOG.md updated
- [ ] Build tested in VS Code
- [ ] All 3 exe files generated (driver, overlay, cli)
- [ ] Test case provided (e.g., "calibrate, move slider, offsets persist")
- [ ] GitHub tag created with version

---

## 📊 Quick Config Reference

### RAG Layer Configuration
```javascript
// File: ~/.openclaw/workspace/skills/clawtext-rag/plugin.js
maxMemories: 7              // Memories per query
minConfidence: 0.70         // Quality threshold
tokenBudget: 4000           // Max injection size
injectMode: 'smart'         // Full text mode
```

### Gateway Config Location
```
~/.openclaw/openclaw.json
```

### Memory File Locations
```
~/.openclaw/workspace/MEMORY.md                  # Long-term knowledge
~/.openclaw/workspace/DAILY_LOG_TEMPLATE.md      # Daily log template
~/.openclaw/workspace/memory/YYYY-MM-DD.md       # Daily logs
~/.openclaw/workspace/memory/clusters/           # Cluster files
~/.openclaw/workspace/memory/entities.json       # Entity index
```

### Key Git Repos
```
~/.openclaw/workspace/moltmud/                   # Game project
~/.openclaw/workspace/rgcs/                      # VR driver
~/.openclaw/workspace/                           # This workspace
```

---

## ✅ Common Tasks (Copy-Paste Ready)

### "I want to check if RAG is working"
```bash
grep -A10 "clawtext-rag" ~/.openclaw/openclaw.json
ls -lh ~/.openclaw/workspace/memory/clusters/*.json
node ~/.openclaw/workspace/skills/clawtext/scripts/validate-rag.js
```

### "I want to see recent errors"
```bash
cat ~/.openclaw/workspace/.learnings/ERRORS.md | head -50
```

### "I want to test a memory search manually"
```bash
cd ~/.openclaw/workspace/skills/clawtext
node test.mjs
```

### "I want to update a cron job timeout"
```bash
cron(action=update, jobId=[JOB_ID], patch={timeoutSeconds: 120})
```

### "I want to see what's blocking"
```bash
# Read this file:
cat ~/.openclaw/workspace/CURRENT_WORK.md | grep -A20 "OPERATIONAL ISSUES"
```

---

**When in doubt about "how to do X", check this file first.**
