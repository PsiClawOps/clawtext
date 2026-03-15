# AGENT_INSTALL.md — Install ClawText in OpenClaw

This file is for agents or operators installing ClawText into an OpenClaw workspace.

## Canonical install flows

ClawText has **two** canonical install paths.

### 1) Published / user install

Use this for normal users, production workspaces, and standard deployment:

```bash
openclaw plugins install @openclaw/clawtext
```

### 2) Local development install

Use this when working from a local repo checkout and you want OpenClaw to load the repo through the plugin manager:

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

## What is canonical vs non-canonical?

- ✅ **Canonical:** `openclaw plugins install @openclaw/clawtext`
- ✅ **Canonical:** `openclaw plugins install --link /path/to/clawtext`
- ⚠️ **Non-canonical alias:** `~/.openclaw/workspace/skills/clawtext` if it exists as a linked workspace path
- 🚑 **Recovery-only:** manual `plugins.load.paths` editing in `~/.openclaw/openclaw.json`

If `~/.openclaw/workspace/skills/clawtext` exists, do **not** present it as the primary install instruction. It may reflect a linked workspace alias or older layout, but the real source of truth should still be the plugin installer and its install record.

## Expected live-good state

A healthy modern setup should look like this:

- ClawText installed by the OpenClaw plugin manager
- install provenance present in `plugins.installs`
- plugin enabled in `plugins.entries.clawtext`
- if local dev is in use, the repo is linked via `openclaw plugins install --link ...`

## Verify installation

```bash
openclaw plugins info clawtext
openclaw plugins list
openclaw status
```

Expected outcomes:

- ClawText appears in the plugin list
- status is `loaded` or `enabled/loaded`
- OpenClaw does not report plugin registration errors
- install provenance is tracked by the plugin system

## Validate runtime behavior

From the repo root, run:

```bash
node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs maintenance:run
```

Expected outcomes:

- cluster artifacts rebuild cleanly
- RAG validation completes without load/runtime errors
- operational maintenance commands run without plugin-resolution failures

## Recovery-only manual path editing

Manual `plugins.load.paths` editing should **not** be used as the primary installation story.

Only use it if you are:
- recovering from broken installer metadata,
- repairing a damaged workspace,
- or debugging plugin resolution itself.

If recovery is required, keep the manual path minimal, restore service, then migrate back to an installer-managed or installer-linked setup.

Example recovery-only shape:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/absolute/path/to/clawtext"
      ]
    },
    "entries": {
      "clawtext": {
        "enabled": true
      }
    }
  }
}
```

After recovery, prefer one of these again:

```bash
openclaw plugins install @openclaw/clawtext
# or
openclaw plugins install --link /path/to/clawtext
```

## If plugin does not load

Check:

```bash
openclaw plugins info clawtext
openclaw status
openclaw plugins list
```

Then verify:

- the plugin was installed through the plugin manager
- the link target still exists if using `--link`
- the repo has been built if local development requires build artifacts
- `plugins.entries.clawtext.enabled` is true
- you are not relying on stale manual `plugins.load.paths` config from an older install story

## Safety notes

- validate retrieval after major ingest changes
- avoid promoting raw logs into clusters
- use hygiene tooling to test sensitive-data redaction patterns
- prefer installer-managed installs so OpenClaw can track trust/provenance cleanly

## Read next

- [README.md](./README.md)
- [AGENT_SETUP.md](./AGENT_SETUP.md)
- [SKILL.md](./SKILL.md)
- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)
