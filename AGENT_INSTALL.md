## Quick Start for Agents

If you're an agent installing ClawText RAG, follow this checklist:

### Step 1: Verify Installation Environment

```bash
# Check OpenClaw is installed
openclaw status
# Expected: Shows gateway status, version

# Check workspace exists
ls -la ~/.openclaw/workspace/
# Expected: Shows memory/, skills/, config files
```

### Step 2: Run Installation Script

```bash
cd ~/.openclaw/workspace/skills/clawtext-rag
node install.js --auto-config
```

This automatically:
- ✅ Verifies OpenClaw installation
- ✅ Checks workspace structure
- ✅ Validates memory files
- ✅ Enables ClawText RAG in openclaw.json
- ✅ Builds initial clusters
- ✅ Runs tests
- ✅ Reports status

### Step 3: Restart Gateway

```bash
openclaw gateway restart --note "ClawText RAG installation complete"
```

### Step 4: Verify Installation

```bash
# Enable debug logging
export DEBUG_CLAWTEXT=1

# Run a test prompt in the same shell
# You should see:
# [ClawText] Injected 7 memories (483 tokens, projects: moltmud,openclaw)
```

---

## What Gets Installed

```
~/.openclaw/workspace/skills/clawtext-rag/
├── README.md              ← Full documentation
├── AGENT_INSTALL.md       ← This file
├── TROUBLESHOOTING.md     ← Common issues
├── LICENSE                ← MIT License
├── package.json           ← Dependencies
├── install.js             ← Installation script
├── plugin.js              ← OpenClaw hook
├── test.mjs               ← Validation tests
├── src/
│   ├── rag.js            ← BM25 search engine
│   └── rag.ts            ← TypeScript source (optional)
├── scripts/
│   └── build-clusters.js ← Cluster builder
└── .gitignore            ← Git configuration
```

## Configuration Options

Edit `~/.openclaw/workspace/skills/clawtext-rag/plugin.js` to tune:

```javascript
// Memory injection per query
this.rag.config.maxMemories = 7;

// Quality threshold (0.0-1.0)
this.rag.config.minConfidence = 0.70;

// Max tokens to inject
this.rag.config.tokenBudget = 4000;

// Injection mode: 'smart' (full text) or 'snippets' (summaries)
this.rag.config.injectMode = 'smart';
```

Then restart:
```bash
openclaw gateway restart --note "Updated ClawText RAG configuration"
```

## Verifying Setup

### Check if RAG is enabled
```bash
grep -A 2 '"clawtext-rag"' ~/.openclaw/openclaw.json
# Should show: "enabled": true
```

### Check if clusters are built
```bash
ls -la ~/.openclaw/workspace/memory/clusters/
# Should show: cluster-*.json files
```

### Check memory count
```bash
grep -c "^##" ~/.openclaw/workspace/memory/MEMORY.md
# Shows number of memory entries
```

### Run full validation
```bash
cd ~/.openclaw/workspace/skills/clawtext-rag
node test.mjs
# Should see: ✅ RAG layer test complete
```

## Troubleshooting

### RAG not injecting memories

```bash
# Check 1: Is it enabled?
grep 'clawtext-rag.*enabled' ~/.openclaw/openclaw.json

# Check 2: Enable debug logging
export DEBUG_CLAWTEXT=1
# (Run a prompt and watch logs)

# Check 3: Are there clusters?
ls ~/.openclaw/workspace/memory/clusters/ | wc -l
# Should be >0
```

### "Clusters directory not found"

```bash
# Create it
mkdir -p ~/.openclaw/workspace/memory/clusters/

# Rebuild clusters
cd ~/.openclaw/workspace/skills/clawtext-rag/scripts/
node build-clusters.js --force
```

### Low quality memories (confidence <0.70)

```bash
# Check that MEMORY.md has proper headers:
head -15 ~/.openclaw/workspace/memory/MEMORY.md
# Should show YAML frontmatter with date, project, type, etc.

# Rebuild with force:
node build-clusters.js --force
```

### Token budget exceeded

```bash
# Reduce injection size
# In plugin.js, change:
this.rag.config.tokenBudget = 3000;  // Was 4000
this.rag.config.maxMemories = 5;      // Was 7
```

## Performance Tuning

### If memories aren't relevant enough

```javascript
// Lower confidence threshold (more results)
this.rag.config.minConfidence = 0.65;
this.rag.config.maxMemories = 10;
```

### If injection is slow (>150ms)

```javascript
// Use snippets instead of full text
this.rag.config.injectMode = 'snippets';
this.rag.config.maxMemories = 5;
```

### If you're running out of memory

```bash
# Reduce cluster count (only load relevant projects)
# This requires cluster builder modification
# See scripts/build-clusters.js
```

## Next Steps

1. **Read README.md** for full documentation
2. **Check TROUBLESHOOTING.md** if issues arise
3. **Enable DEBUG_CLAWTEXT=1** to watch memory injection live
4. **Review OPTIMIZATION_ROADMAP.md** for future enhancements

---

**ClawText RAG is now installed and ready to inject memories into every prompt.**
