# AGENT_INSTALL.md — Install ClawText in OpenClaw

This file is for agents or operators installing ClawText into an OpenClaw workspace.

## Canonical location

```bash
~/.openclaw/workspace/skills/clawtext
```

## Install

```bash
git clone https://github.com/ragesaq/clawtext.git ~/.openclaw/workspace/skills/clawtext
cd ~/.openclaw/workspace/skills/clawtext
npm install
npm run build
```

## Enable plugin

Edit `~/.openclaw/openclaw.json` so ClawText is loaded and enabled:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "~/.openclaw/workspace/skills/clawtext"
      ]
    },
    "allow": ["clawtext"],
    "entries": {
      "clawtext": {
        "enabled": true
      }
    }
  }
}
```

Restart the gateway after configuration changes.

## Validate

```bash
cd ~/.openclaw/workspace/skills/clawtext
node scripts/build-clusters.js --force
node scripts/validate-rag.js
node scripts/operational-cli.mjs status
```

Expected outcomes:

- cluster files exist in `memory/clusters/`
- validation script runs without load errors
- operational CLI reports lane status

## If plugin does not load

Check:

```bash
openclaw status
cat ~/.openclaw/openclaw.json
ls ~/.openclaw/workspace/skills/clawtext/dist/
```

Common causes:

- plugin path missing from `plugins.load.paths`
- `clawtext` missing from `plugins.allow`
- `plugins.entries.clawtext.enabled` not set to true
- `npm install` or `npm run build` not run yet

## Safety notes

- validate retrieval after major ingest changes
- avoid promoting raw logs into clusters
- use hygiene tooling to test sensitive-data redaction patterns

## Read next

- [README.md](./README.md)
- [SKILL.md](./SKILL.md)
- [SECURITY.md](./SECURITY.md)
- [RISK.md](./RISK.md)
