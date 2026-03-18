# ClawText Agent-Assisted Setup

This guide is for **agents installing and configuring ClawText** in an OpenClaw workspace.

---

## Canonical install flows

ClawText has two canonical installation stories.

### 1) Published / user install

Use this for normal users and production workspaces:

```bash
openclaw plugins install github:PsiClawOps/clawtext
```

### 2) Local development install

Use this when working from a local checkout and you want OpenClaw to load the repo through the plugin manager:

```bash
openclaw plugins install --link /path/to/clawtext
```

Example:

```bash
git clone https://github.com/PsiClawOps/clawtext.git
cd clawtext
npm install
npm run build
openclaw plugins install --link .
```

### Non-canonical / recovery-only flows

- ⚠️ `~/.openclaw/workspace/skills/clawtext` may exist as a workspace alias or linked convenience path, but it is **not** the canonical install contract.
- 🚑 Manual `plugins.load.paths` editing in `~/.openclaw/openclaw.json` is **recovery/debug only**, not the primary install method.

The preferred live-good state is:
- ClawText managed by the OpenClaw plugin installer
- install provenance present in `plugins.installs`
- plugin enabled in `plugins.entries.clawtext`
- local repos linked via `openclaw plugins install --link ...` when doing development

---

## Migration Path: From Older Manual/Clone Install to Plugin System

If the user already has ClawText installed via an older git-clone or manual `plugins.load.paths` setup, migrate them to the installer-managed model.

### Agent migration flow

Agent tells user:

> "I detected an older ClawText install path. I can migrate you to the plugin system so updates and provenance are handled cleanly. Your memory stays intact."

If the user agrees:

```bash
# Step 1: Install via plugin system
openclaw plugins install github:PsiClawOps/clawtext

# Step 2: Back up config
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup.$(date +%s)

# Step 3: Remove stale manual load-path entries
# - delete old plugins.load.paths entries pointing at clawtext
# - keep plugins.entries.clawtext config
# - keep any existing memory tuning values

# Step 4: Restart gateway
openclaw gateway restart

# Step 5: Verify only one active install story remains
openclaw plugins info clawtext
openclaw plugins list

# Step 6: Validate runtime
openclaw status
```

If the old repo directory is still present after successful migration, treat it as optional cleanup and ask before deleting it.

---

## Phase 1: Install (Automatic)

For standard setup, agent runs:

```bash
openclaw plugins install github:PsiClawOps/clawtext
openclaw plugins list | grep clawtext
```

For local development setup, agent runs:

```bash
openclaw plugins install --link /path/to/clawtext
openclaw plugins list | grep clawtext
```

Agent reports to user:

> "ClawText is now installed and registered as an OpenClaw plugin. Ready to configure."

What happens automatically:
- ✅ plugin installed or linked through OpenClaw
- ✅ install record updated in plugin metadata
- ✅ dependency/install lifecycle handled by plugin manager
- ✅ plugin available for enablement and runtime loading

---

## Phase 2: Configure Plugin (Agent-Assisted)

Agent edits `~/.openclaw/openclaw.json` only for **plugin configuration**, not as the primary install mechanism.

### Step 2a: Installation interview (required)

Before writing runtime config, the agent should ask a short interview so ClawText doesn't silently assume the wrong operational model.

Agent asks:

> "Before I finalize ClawText, I want to confirm 4 things so the install matches how you actually work:
>
> 1. **Memory tuning** — keep defaults, or customize `maxMemories`, `minConfidence`, or token budget?
> 2. **Maintenance scheduler** — keep ClawText maintenance under OpenClaw agent-cron, or move deterministic jobs to system cron/systemd timers? I recommend **system cron** for deterministic script jobs.
> 3. **Extract freshness** — keep working-memory extraction at **30 minutes**, or tighten to **20 minutes**? I recommend **20 minutes** for better freshness without much extra churn.
> 4. **Discord history strategy** — if you use Discord, should I:
>    - run **prefetch** for recent cold-start context,
>    - run **backfill** for older thread/channel history,
>    - and wire **journal reindex** so backfilled history becomes searchable memory instead of journal-only history?
>
> If you don't have strong preferences, I'll use the recommended defaults: default memory tuning, system cron for deterministic maintenance, 20-minute extraction, and prefetch + optional backfill/reindex for Discord-heavy setups."

### Step 2b: Configure memory behavior

Agent asks the user about tuning:

> "ClawText automatically injects relevant memories into prompts. I can tune:
>
> 1. How many memories per query? (default: 5)
> 2. How strict on relevance? (default: 0.70)
> 3. Token budget? (default: 2000)
>
> The defaults work well for most workflows. Do you want to keep them or customize?"

If keeping defaults, agent adds or confirms:

```json
"plugins": {
  "entries": {
    "clawtext": {
      "enabled": true,
      "memorySearch": {
        "sync": { "onSessionStart": true },
        "maxMemories": 5,
        "minConfidence": 0.70
      },
      "clusters": {
        "rebuildInterval": "0 2 * * *",
        "validationThreshold": 0.70
      }
    }
  }
}
```

---

## Phase 3: Enable Journaling (Critical)

**Journaling is the foundation of ClawText's durability stack.** Without it, context is lost on compaction, session corruption, or restart. With it, everything is recoverable.

Agent tells user:

> "ClawText uses an append-only journal to capture every message in and out. This is what lets us restore context after crashes, avoid losing decisions during compaction, and provide cross-session awareness. I need to set this up now — it's a core feature, not optional."

### Step 3a: Create journal directory

```bash
mkdir -p ~/.openclaw/workspace/journal
```

### Step 3b: Verify journal hooks are registered

The ClawText plugin hooks handle journaling automatically. Verify they're loaded:

```bash
openclaw plugins info clawtext
# Should show hooks: clawtext-optimize, clawtext-prune, clawtext-prefetch
```

### Step 3c: Create state directories

```bash
mkdir -p ~/.openclaw/workspace/state/clawtext/prod/checkpoint
mkdir -p ~/.openclaw/workspace/state/clawtext/prod/ingest
```

### Step 3d: Configure restore preset

Agent asks the user:

> "How much context do you want restored on cold start? Options:
> - **minimal** — 10 messages, 4KB (fast boot, minimal context)
> - **default** — 20 messages, 8KB (balanced)
> - **deep** — 50 messages, 32KB (recommended — rich context recovery)
> - **full** — 200 messages, 128KB (large context windows only)
>
> I recommend **deep** for most setups. It gives you excellent recovery without bloating the prompt."

Agent writes the config:

```bash
cat > ~/.openclaw/workspace/state/clawtext/prod/restore-config.json << 'EOF'
{
  "enabled": true,
  "injectLimit": 50,
  "maxContextAgeHours": 12,
  "minMessages": 3,
  "lookbackDays": 3,
  "maxContentBytes": 32000,
  "previewCap": 500
}
EOF
```

### Step 3e: Configure Clawptimization

Agent explains:

> "ClawText includes a prompt compositor called Clawptimization. It scores every piece of context, allocates it into named slots, and drops low-value content so your context window stays clean. I'll enable it now with safe defaults."

```bash
cat > ~/.openclaw/workspace/state/clawtext/prod/optimize-config.json << 'EOF'
{
  "enabled": true,
  "strategy": "scored-select",
  "minScore": 0.25,
  "preserveReasons": true,
  "logDecisions": true,
  "budget": {
    "budgetRatio": 0.15,
    "contextWindowTokens": 160000,
    "overflowMode": "redistribute",
    "slots": {
      "system": { "ratio": 0.05, "policy": "always-include", "enabled": true },
      "memory": { "ratio": 0.2, "policy": "scored-select", "enabled": true },
      "library": { "ratio": 0.15, "policy": "on-demand", "enabled": true },
      "clawbridge": { "ratio": 0.08, "policy": "if-present", "enabled": true },
      "recent-history": { "ratio": 0.12, "policy": "always-include", "enabled": true },
      "mid-history": { "ratio": 0.15, "policy": "scored-select", "enabled": true },
      "deep-history": { "ratio": 0.08, "policy": "decision-only", "enabled": true },
      "decision-tree": { "ratio": 0.08, "policy": "pattern-match", "enabled": true },
      "journal": { "ratio": 0.09, "policy": "cold-start-only", "enabled": true },
      "cross-session": { "ratio": 0.05, "policy": "if-present", "enabled": true },
      "situational-awareness": { "ratio": 0, "policy": "disabled", "enabled": false },
      "custom": { "ratio": 0, "policy": "disabled", "enabled": false }
    }
  }
}
EOF
```

Agent notes:

> "The `contextWindowTokens` should match your model. Common values: 160,000 (Claude Sonnet/Haiku), 192,000 (Opus 4.6), 400,000 (GPT-5.4). I can adjust this when you switch models."

### Step 3f: Run initial Discord prefetch (optional, if using Discord)

> "If you're using Discord, I can pull recent message history into the journal right now so you have context from day one."

```bash
cd /path/to/clawtext
node scripts/discord-prefetch.mjs --force
```

### Step 3g: Choose maintenance scheduler explicitly

Agent should not silently assume that all maintenance belongs inside OpenClaw agent-cron.

Agent asks:

> "ClawText has 3 recurring maintenance jobs:
> - extract working memory from the buffer
> - nightly cluster rebuild + validation
> - operational maintenance sweep
>
> These are deterministic script jobs, so I usually recommend **system cron/systemd timers** for cost and reliability, and reserving OpenClaw agent-cron for jobs that genuinely need model reasoning. Do you want that recommendation, or do you want everything to stay under OpenClaw cron?"

**Recommended default:**
- move deterministic maintenance jobs to **system cron / systemd timers**
- keep any truly agent/LLM-owned jobs in OpenClaw cron
- when an OpenClaw agent-turn cron is still needed, prefer model **`gpt-5.4-mini`** unless the job needs a heavier model

### Step 3h: Set maintenance cadence and Discord history strategy

Agent asks:

> "For memory freshness, I recommend **20-minute** extract-buffer runs instead of 30 minutes. It's still cheap and reduces stale-memory windows.
>
> If you're using Discord heavily, I also recommend deciding up front how aggressive to be about history:
> - **prefetch** for recent/cold-start history
> - **backfill** for older thread/channel history
> - **journal reindex** after backfill so old Discord history becomes searchable memory, not just journal coverage
>
> Do you want the recommended setup, or something more conservative?"

The nightly maintenance stack should still include:
- `build-clusters.js --force` — rebuild memory clusters
- `validate-rag.js` — verify retrieval quality
- `journal-maintenance.mjs --verbose` — compress old journal files, report health

Agent reports:

> "✅ Journaling is live. Every message will be captured to the journal. On restart, ClawText will restore your last session context automatically. On compaction, a rich checkpoint is saved first so nothing is lost."

Agent tells user:

> "I need to restart the OpenClaw gateway to load the updated ClawText configuration."

Agent runs:

```bash
openclaw gateway restart
```

Then reports:

> "✅ Gateway restarted. ClawText is now active."

---

## Phase 5: Validate Installation

Agent validates runtime state:

```bash
openclaw plugins info clawtext
openclaw plugins list
openclaw status
```

If validating from the repo as part of dev/local work:

```bash
node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs maintenance:run
```

If all pass, agent reports:

> "✅ All systems green. ClawText is installed, loaded, and operational."

If anything fails, agent should troubleshoot before continuing.

---

## Phase 6: Onboarding Conversation

After install, the agent should talk through:

### Question 1: Scheduler ownership

> "Do you want deterministic ClawText maintenance jobs under OpenClaw agent-cron, or do you want them moved to system cron/systemd timers? I recommend system timers for extract-buffer, nightly rebuild, and operational maintenance because they don't need model reasoning."

### Question 2: Freshness vs churn

> "Do you want the extract-buffer cadence left at 30 minutes, or tightened to 20 minutes for fresher memory promotion? I recommend 20 minutes."

### Question 3: What knowledge should we ingest?

> "ClawText can ingest repos, docs, Discord history, and structured exports. If you're using Discord, should I only prefetch recent history, or should I also backfill older channels/threads and run journal reindex so that history becomes searchable memory?"

### Question 4: What should we remember?

> "ClawText will capture decisions and patterns automatically, but I can also record any important project facts or gotchas you want preserved immediately."

---

## Phase 7: Document Setup

Agent may create a local setup summary such as `memory/clawtext-setup.md` including:
- install method used (`published` or `--link`)
- current version
- RAG tuning values
- rebuild strategy
- ingested sources
- any local notes or gotchas

---

## Phase 8: Next Steps

Agent explains what happens automatically now:
- messages can be captured to memory
- extraction/clustering/validation can run on schedule (OpenClaw cron or system timers, depending on the install interview)
- relevant memories can be injected into prompts automatically
- operational learning can surface recurring failures and recoveries

Agent also explains likely next actions:
- ingest docs/repos/Discord sources
- review memory quality
- tune thresholds if retrieval is too broad or too narrow
- archive stale material if needed

---

## Setup Completion Checklist

- [ ] ClawText installed via `openclaw plugins install github:PsiClawOps/clawtext` **or** `openclaw plugins install --link /path/to/clawtext`
- [ ] Plugin appears in `openclaw plugins info clawtext`
- [ ] `plugins.entries.clawtext.enabled` is true
- [ ] Journal directory created (`~/.openclaw/workspace/journal/`)
- [ ] State directories created (`~/.openclaw/workspace/state/clawtext/prod/`)
- [ ] Restore config written (`restore-config.json`)
- [ ] Optimize config written (`optimize-config.json`) with correct `contextWindowTokens` for model
- [ ] Discord prefetch run (if using Discord)
- [ ] Nightly maintenance cron configured
- [ ] Gateway restarted
- [ ] Validation checks passed
- [ ] Cluster/maintenance strategy discussed
- [ ] Initial ingest discussed or completed
- [ ] Setup documented if appropriate
- [ ] User understands next steps

---

## Troubleshooting During Setup

### If plugin fails to install

```bash
npm view github:PsiClawOps/clawtext
openclaw plugins install github:PsiClawOps/clawtext --force
```

### If linked local dev install fails

- verify the repo path exists
- run `npm install` and `npm run build` in the repo if required
- re-run:

```bash
openclaw plugins install --link /path/to/clawtext
```

### If plugin fails to load

```bash
openclaw plugins info clawtext
openclaw plugins list
openclaw status
```

Check for:
- stale manual `plugins.load.paths` entries from older installs
- broken link target in local dev mode
- missing build artifacts in local repo workflows
- config syntax errors

### Recovery-only fallback

If installer metadata is damaged and service must be restored quickly, use manual `plugins.load.paths` as a temporary repair step only, then migrate back to installer-managed or installer-linked state.

---

## Agent responsibilities after setup

1. Respond naturally to memory requests
2. Offer ingestion when the user mentions docs/repos/channels
3. Surface operational learning patterns when they recur
4. Tune ClawText configuration if retrieval quality feels off
5. Keep the install story canonical when giving future instructions

---

**Last Updated:** 2026-03-17
**Status:** Agent-assisted setup flow with journaling, Clawptimization, and Discord prefetch
**Scope:** From new install or old manual install to operational ClawText v0.3.0+
