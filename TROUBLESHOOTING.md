## Common Issues and Solutions

### 1. "Clusters directory not found"

**Symptom:**
```
[ClawText RAG] Loaded 0 clusters
[ClawText RAG] Injected 0 memories (0 tokens)
```

**Solution:**
```bash
# Create clusters directory
mkdir -p ~/.openclaw/workspace/memory/clusters/

# Rebuild clusters
cd ~/.openclaw/workspace/skills/clawtext-rag/scripts/
node build-clusters.js --force

# Restart gateway
openclaw gateway restart --note "Clusters rebuilt"
```

---

### 2. "Configuration file not found"

**Symptom:**
```
Error: ENOENT: no such file or directory,
  open '/home/user/.openclaw/openclaw.json'
```

**Solution:**
```bash
# Check OpenClaw installation
openclaw status

# If not found, reinstall OpenClaw:
npm install -g openclaw

# Verify config exists
ls ~/.openclaw/openclaw.json
```

---

### 3. "Memory file has invalid YAML header"

**Symptom:**
```
[ClawText RAG] Failed to parse YAML in memory file
```

**Solution:**

Check header syntax. Example valid header:
```yaml
---
date: 2026-03-03
project: moltmud
type: decision
area: game-mechanics
entities: [ZORTHAK, ragesaq]
pattern-key: game.rest_activation
keywords: [rest, meditate, regen]
---
```

**Common errors:**
- Missing closing `---`
- Inconsistent indentation
- Invalid date format (use YYYY-MM-DD)
- Quotes around values (not needed unless special chars)

**Fix:**
```bash
# Fix header manually
nano ~/.openclaw/workspace/memory/MEMORY.md

# Or rebuild clusters with clean headers
node build-clusters.js --force
```

---

### 4. "No memories being injected"

**Symptom:**
```
[ClawText] Injected 0 memories (0 tokens)
```

**Debug:**

```bash
# Step 1: Check if enabled
grep '"clawtext-rag"' ~/.openclaw/openclaw.json
# Should show: "clawtext-rag": { "enabled": true }

# Step 2: Check clusters exist
ls ~/.openclaw/workspace/memory/clusters/ | wc -l
# Should be >0

# Step 3: Check memories have keywords
grep -c "keywords:" ~/.openclaw/workspace/memory/MEMORY.md
# Should be >0

# Step 4: Enable debug and run prompt
export DEBUG_CLAWTEXT=1
# Then run a prompt in same shell

# Step 5: Check logs
grep ClawText ~/.openclaw/logs/*.log 2>/dev/null | tail -20
```

---

### 5. "Token budget exceeded"

**Symptom:**
```
[ClawText RAG] Injection would exceed budget: 5000 > 4000
[ClawText] Injected 0 memories (0 tokens)
```

**Solution:**

Option A: Reduce injection size
```javascript
// In plugin.js, change:
this.rag.config.maxMemories = 5;  // Was 7
this.rag.config.tokenBudget = 5000;  // Increase budget
```

Option B: Use snippets instead of full text
```javascript
// In plugin.js, change:
this.rag.config.injectMode = 'snippets';  // Was 'smart'
```

Then restart:
```bash
openclaw gateway restart --note "Reduced RAG memory injection"
```

---

### 6. "Cluster quality is poor (many false positives)"

**Symptom:**
```
Requesting MoltMUD memories but getting ClawText clustering info
Confidence scores are low (<0.70)
```

**Solution:**

Step 1: Check memory headers are correct
```bash
head -20 ~/.openclaw/workspace/memory/MEMORY.md
head -20 ~/.openclaw/workspace/memory/2026-03-03.md
```

Should show:
```yaml
---
date: YYYY-MM-DD
project: [project-name]
type: decision|fact|code|memory
entities: [ENTITY1, ENTITY2]
keywords: [keyword1, keyword2]
---
```

Step 2: Rebuild clusters with metadata
```bash
cd ~/.openclaw/workspace/skills/clawtext-rag/scripts/
node build-clusters.js --force

# Check confidence in output
grep '"confidence"' ~/.openclaw/workspace/memory/clusters/cluster-moltmud.json | head -5
```

Step 3: Lower confidence threshold temporarily
```javascript
// In plugin.js, temporarily:
this.rag.config.minConfidence = 0.60;  // From 0.70
```

Then investigate why confidence is low.

---

### 7. "Installation script fails with permission error"

**Symptom:**
```
Error: EACCES: permission denied,
  open '/home/user/.openclaw/openclaw.json'
```

**Solution:**

```bash
# Check permissions
ls -l ~/.openclaw/openclaw.json

# Fix permissions (your user should own the file)
sudo chown $(whoami):$(whoami) ~/.openclaw/openclaw.json
chmod 644 ~/.openclaw/openclaw.json

# Retry installation
node install.js --auto-config
```

---

### 8. "Gateway restart fails"

**Symptom:**
```
Error: Gateway restart timed out
Gateway is not responding
```

**Solution:**

```bash
# Check if gateway is running
openclaw status

# Force restart
openclaw gateway restart --note "Forced restart"

# If still stuck, restart manually
openclaw gateway stop
sleep 2
openclaw gateway start

# Verify
openclaw status
```

---

### 9. "Test suite fails"

**Symptom:**
```
❌ RAG layer test failed
Tests: 3, Failures: 1
```

**Solution:**

```bash
# Run tests with verbose output
node test.mjs --verbose

# Check specific issue
cd ~/.openclaw/workspace/skills/clawtext-rag

# Verify rag.js is readable
node -c src/rag.js  # Syntax check

# Verify test.mjs is readable
node -c test.mjs

# Run with debug
DEBUG=* node test.mjs
```

---

### 10. "Memory file is corrupt"

**Symptom:**
```
SyntaxError: Unexpected token in JSON at position 0
Failed to load cluster: SyntaxError
```

**Solution:**

```bash
# Backup the file
cp ~/.openclaw/workspace/memory/MEMORY.md \
   ~/.openclaw/workspace/memory/MEMORY.md.bak

# Check for parsing errors
node -e "console.log(JSON.parse(fs.readFileSync('MEMORY.md')))" 2>&1

# If JSON (some memories are JSON), validate
cat ~/.openclaw/workspace/memory/MEMORY.md | jq . > /dev/null 2>&1
# If it fails, the JSON is corrupt

# Restore from backup
cp ~/.openclaw/workspace/memory/MEMORY.md.bak \
   ~/.openclaw/workspace/memory/MEMORY.md

# Or rebuild from daily logs
cd ~/.openclaw/workspace/skills/clawtext-rag/scripts/
node build-clusters.js --recent  # Last 30 days only
```

---

## How to Report Issues

If you encounter a problem not listed here:

1. **Capture the error message**
   ```bash
   export DEBUG_CLAWTEXT=1
   # Run the command that fails
   # Copy full output
   ```

2. **Check the logs**
   ```bash
   tail -50 ~/.openclaw/logs/gateway.log
   tail -50 ~/.openclaw/logs/memory-core.log
   ```

3. **Gather system info**
   ```bash
   openclaw status
   node --version
   npm --version
   ```

4. **Test in isolation**
   ```bash
   cd ~/.openclaw/workspace/skills/clawtext-rag
   node test.mjs --verbose
   ```

5. **Report with:**
   - Error message (full stack trace)
   - Debug logs
   - System info
   - Steps to reproduce

---

## Performance Diagnostics

If RAG is slow or memory-hungry:

```bash
# Monitor memory usage
watch -n 1 'ps aux | grep openclaw'

# Check injection latency
export DEBUG_CLAWTEXT=1
# Run 10 prompts and check timing

# Profile cluster loading
node -e "
  const start = Date.now();
  require('./src/rag.js');
  console.log('Loaded in', Date.now() - start, 'ms');
"

# Check cluster file sizes
du -sh ~/.openclaw/workspace/memory/clusters/*
```

---

**Still stuck? Enable DEBUG_CLAWTEXT=1 and watch the logs carefully. Most issues are configuration-related, not bugs.**
