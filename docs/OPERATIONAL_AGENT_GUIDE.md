# ClawText Operational Learning — Agent Guide

**For agents using the operational memory system.**

This guide explains when and how to use operational memory CLI commands during agent workflows.

---

## When to Use Operational Memory

Operational memory is **not for normal chat**. Use it when you're:

✅ **Debugging** — "I got an error", "this isn't working", "fix this bug"  
✅ **Using tools** — Tool calls, API calls, function invocations  
✅ **Running commands** — Shell commands, npm, yarn, build scripts  
✅ **Changing config** — Configuration updates, settings changes  
✅ **Deploying** — Deployment, release, publish, push to production  
✅ **Gateway work** — OpenClaw gateway, plugins, skills, extensions  
✅ **Plugin work** — Installing, enabling, disabling plugins

❌ **Normal chat** — "hello", "thanks", "what is X", "explain Y"

---

## CLI Commands for Agents

### 1. Check Review Queue

```bash
npm run operational:review
```

**When to use:** Before starting debugging or tool work, check if there are known patterns.

**What it shows:**
- Candidates awaiting review
- Issues (TBD rootCause, TBD fix, low confidence)
- Suggestions for improvement

**Agent workflow:**
1. Start debugging task
2. Run `npm run operational:review`
3. Look for patterns matching current error
4. Apply known fixes if found

---

### 2. Search Operational Patterns

```bash
npm run operational:search -- "error message keyword"
```

**When to use:** When you encounter an error or issue.

**What it shows:**
- Matching operational patterns
- Recurrence count (higher = more reliable)
- Status (reviewed patterns are safe to use)

**Agent workflow:**
1. Encounter error: "exec tool failed with ENOENT"
2. Run: `npm run operational:search -- "exec ENOENT"`
3. Find pattern with fix
4. Apply fix to current task

---

### 3. Capture New Pattern

```bash
npm run operational:capture:error
npm run operational:capture:success
```

**When to use:**
- **capture:error** — After debugging an error, capture the pattern
- **capture:success** — After finding a solution that works

**What it does:**
- Creates new pattern entry
- Sets up for future aggregation
- Helps other agents avoid same issue

**Agent workflow (error):**
1. Debug error successfully
2. Identify root cause
3. Document fix
4. Run: `npm run operational:capture:error`
5. Fill in: summary, symptom, trigger, rootCause, fix, evidence

**Agent workflow (success):**
1. Complete complex task successfully
2. Document what worked
3. Run: `npm run operational:capture:success`
4. Fill in: summary, whatWorked, context

---

### 4. Approve Pattern (After Review)

```bash
npm run operational:review approve <patternKey> "notes"
```

**When to use:** After you've verified a pattern is correct and useful.

**What it does:**
- Changes status from `candidate` to `reviewed`
- Makes pattern available for retrieval
- Logs review action

**Agent workflow:**
1. Review candidate pattern
2. Verify rootCause and fix are correct
3. Run: `npm run operational:review approve "<patternKey>" "Verified working"`
4. Pattern now available for other agents

---

### 5. Reject Pattern

```bash
npm run operational:review reject <patternKey> "reason"
```

**When to use:** When a pattern is incorrect, false positive, or not useful.

**What it does:**
- Archives the pattern
- Records rejection reason
- Prevents future use

**Agent workflow:**
1. Review candidate pattern
2. Determine it's incorrect or misleading
3. Run: `npm run operational:review reject "<patternKey>" "False positive - different root cause"`
4. Pattern archived

---

### 6. Merge Duplicate Patterns

```bash
npm run operational:merge:find
npm run operational:merge <primary> <duplicate>
```

**When to use:** When you find two patterns describing the same issue.

**What it does:**
- `merge:find` — Shows potential duplicates
- `merge` — Combines recurrence and evidence, archives duplicate

**Agent workflow:**
1. Run: `npm run operational:merge:find`
2. Review suggestions
3. Run: `npm run operational:merge "<primaryKey>" "<duplicateKey>"`
4. Recurrence summed, evidence merged

---

### 7. Synthesize Candidates

```bash
npm run operational:synthesize
```

**When to use:** Periodically, to auto-improve candidate quality.

**What it does:**
- Boosts confidence for high recurrence (≥3)
- Boosts confidence for multiple evidence items (≥3)
- Flags TBD fields for review

**Agent workflow:**
1. Run periodically (e.g., daily)
2. Review synthesized patterns
3. Approve high-confidence patterns

---

### 8. Check Aggregation Stats

```bash
npm run operational:aggregation:stats
```

**When to use:** To understand system state.

**What it shows:**
- Total unique signatures
- Patterns with recurrence
- Candidates awaiting review

---

### 9. Full Report

```bash
npm run operational:report
```

**When to use:** Comprehensive system overview.

**What it shows:**
- Total candidates
- Synthesized patterns
- Merge suggestions
- High recurrence patterns
- Patterns needing review

---

## Example Agent Workflows

### Workflow 1: Debugging an Error

```bash
# 1. Encounter error
# "Tool exec failed with ENOENT: no such file or directory"

# 2. Search for known patterns
npm run operational:search -- "exec ENOENT"

# 3. If pattern found, apply fix
# Pattern says: "Validate workdir exists before exec"

# 4. If no pattern found, debug and capture
# After fixing:
npm run operational:capture:error
# Fill in:
# - summary: "Tool exec fails with invalid workdir"
# - symptom: "ENOENT: no such file or directory"
# - trigger: "Running exec with non-existent workdir"
# - rootCause: "workdir not validated before exec"
# - fix: "Validate workdir exists before exec"
# - evidence: ["Session 12345", "Error log"]
```

### Workflow 2: Successful Complex Task

```bash
# 1. Complete complex deployment successfully

# 2. Capture success pattern
npm run operational:capture:success
# Fill in:
# - summary: "Successful gateway deployment workflow"
# - whatWorked: "1. Pull latest 2. npm install 3. npm run build 4. npm run deploy"
# - context: "Deploying OpenClaw gateway"
# - scope: "gateway"

# 3. Other agents can now retrieve this pattern
```

### Workflow 3: Pattern Review

```bash
# 1. Check review queue
npm run operational:review

# 2. Review candidate: error-pattern.tool.tool-exec-failed
# - Recurrence: 3 (high confidence)
# - Root cause: TBD (needs investigation)
# - Fix: TBD (needs resolution)

# 3. Investigate and update YAML file manually:
# Edit: ~/.openclaw/workspace/memory/operational/candidates/*.yaml
# Set: rootCause: "workdir not validated"
# Set: fix: "Validate workdir before exec"

# 4. Approve pattern
npm run operational:review approve "error-pattern.tool.tool-exec-failed" "Investigated and verified"
```

### Workflow 4: Merge Duplicates

```bash
# 1. Find duplicates
npm run operational:merge:find

# 2. Review suggestions
# Found: pattern1 ← pattern2 (85% similarity)

# 3. Merge
npm run operational:merge "pattern1" "pattern2"

# 4. Result:
# - pattern1 recurrence increased
# - pattern2 archived
# - Evidence merged
```

---

## Best Practices for Agents

### Do:
✅ Capture patterns after debugging errors  
✅ Capture success patterns after complex workflows  
✅ Review candidates before approving  
✅ Merge duplicate patterns  
✅ Search before starting debugging  
✅ Use `reviewed` status patterns (not `candidate`)

### Don't:
❌ Capture patterns for one-off issues  
❌ Approve patterns without verifying  
❌ Inject operational patterns into normal chat  
❌ Create patterns without evidence  
❌ Ignore TBD rootCause/fix flags

---

## Pattern Quality Indicators

### High Quality (Safe to Use):
- Status: `reviewed` or `promoted`
- Recurrence: ≥3
- Confidence: ≥0.7
- Root cause: Not TBD
- Fix: Not TBD
- Evidence: ≥3 items

### Low Quality (Needs Review):
- Status: `candidate` or `raw`
- Recurrence: 1-2
- Confidence: <0.7
- Root cause: TBD
- Fix: TBD
- Evidence: 0-2 items

---

## Integration with Normal Memory

Operational memory is **separate** from normal ClawText memory:

- **Normal memory:** Project context, decisions, user preferences
- **Operational memory:** Error patterns, fixes, workflows, self-improvement

**When to query operational memory:**
- Debugging tasks
- Tool use
- Command execution
- Config changes
- Deployment
- Gateway/plugin work

**When NOT to query:**
- Normal chat
- General questions
- Creative work
- Unrelated planning

---

## Health Monitoring

Agents should periodically check system health:

```bash
# Check operational memory health
npm run operational:review:stats

# Check retrieval health
npm run operational:retrieval:health

# Check aggregation stats
npm run operational:aggregation:stats
```

**Alert thresholds:**
- Candidates > 10 → Review backlog growing
- High recurrence patterns with TBD fields → Need investigation
- Low confidence patterns → Need more evidence

---

## File Locations

```
~/.openclaw/workspace/memory/operational/
├── raw/2026-03-09/       # Captured events (unprocessed)
├── candidates/            # Awaiting review
├── patterns/              # Reviewed patterns
├── archive/               # Deprecated
├── index.json             # PatternKey → file lookup
├── signatures.json        # Signature → patternKey mapping
└── review-log.json        # Review history
```

---

## Quick Reference

| Command | When to Use |
|---------|-------------|
| `operational:review` | Before debugging, check known patterns |
| `operational:search -- <query>` | When encountering error |
| `operational:capture:error` | After debugging error |
| `operational:capture:success` | After successful complex task |
| `operational:review approve <key>` | After verifying pattern |
| `operational:review reject <key> <reason>` | Pattern is incorrect |
| `operational:merge:find` | Find duplicate patterns |
| `operational:merge <primary> <dup>` | Merge duplicates |
| `operational:synthesize` | Auto-improve candidates |
| `operational:report` | Full system overview |

---

**Version:** 1.4.0  
**Last Updated:** 2026-03-09  
**Status:** Production Ready
