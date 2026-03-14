# ClawText Agent-Assisted Setup

This guide is for **agents installing and configuring ClawText** in an OpenClaw workspace.

---

## Canonical install flows

ClawText has two canonical installation stories.

### 1) Published / user install

Use this for normal users and production workspaces:

```bash
openclaw plugins install @openclaw/clawtext
```

### 2) Local development install

Use this when working from a local checkout and you want OpenClaw to load the repo through the plugin manager:

```bash
openclaw plugins install --link /path/to/clawtext
```

Example:

```bash
git clone https://github.com/ragesaq/clawtext.git
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
openclaw plugins install @openclaw/clawtext

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
openclaw plugins install @openclaw/clawtext
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

### Step 2a: Configure memory behavior

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

## Phase 3: Gateway Restart

Agent tells user:

> "I need to restart the OpenClaw gateway to load the updated ClawText configuration."

Agent runs:

```bash
openclaw gateway restart
```

Then reports:

> "✅ Gateway restarted. ClawText is now active."

---

## Phase 4: Validate Installation

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

## Phase 5: Onboarding Conversation

After install, the agent should talk through:

### Question 1: Cluster rebuild strategy

> "ClawText can rebuild automatically or on-demand. Nightly rebuilds are the default. If you expect heavy ingest activity, I can help set a more active maintenance cadence."

### Question 2: What knowledge should we ingest?

> "ClawText can ingest repos, docs, Discord history, and structured exports. Do you want me to ingest anything now to bootstrap memory?"

### Question 3: What should we remember?

> "ClawText will capture decisions and patterns automatically, but I can also record any important project facts or gotchas you want preserved immediately."

---

## Phase 6: Document Setup

Agent may create a local setup summary such as `memory/clawtext-setup.md` including:
- install method used (`published` or `--link`)
- current version
- RAG tuning values
- rebuild strategy
- ingested sources
- any local notes or gotchas

---

## Phase 7: Next Steps

Agent explains what happens automatically now:
- messages can be captured to memory
- extraction/clustering/validation can run on schedule
- relevant memories can be injected into prompts automatically
- operational learning can surface recurring failures and recoveries

Agent also explains likely next actions:
- ingest docs/repos/Discord sources
- review memory quality
- tune thresholds if retrieval is too broad or too narrow
- archive stale material if needed

---

## Setup Completion Checklist

- [ ] ClawText installed via `openclaw plugins install @openclaw/clawtext` **or** `openclaw plugins install --link /path/to/clawtext`
- [ ] Plugin appears in `openclaw plugins info clawtext`
- [ ] `plugins.entries.clawtext.enabled` is true
- [ ] Gateway restarted if needed
- [ ] Validation checks passed
- [ ] Cluster/maintenance strategy discussed
- [ ] Initial ingest discussed or completed
- [ ] Setup documented if appropriate
- [ ] User understands next steps

---

## Troubleshooting During Setup

### If plugin fails to install

```bash
npm view @openclaw/clawtext
openclaw plugins install @openclaw/clawtext --force
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

**Last Updated:** 2026-03-14  
**Status:** Agent-assisted setup flow aligned to installer-managed and installer-linked installs  
**Scope:** From new install or old manual install to operational ClawText
