# ClawText Pre-Publication Testing Checklist

## ✅ Already Verified

| Test | Command | Status |
|------|---------|--------|
| Build passes | `npm run build` | ✅ Pass |
| Unit tests | `npm test` | ✅ Pass |
| Memory CLI works | `npm run memory -- stats` | ✅ Pass |
| Health check | `npm run health` | ✅ Healthy |
| Cache stats | `npm run cache:stats` | ✅ Working |
| Curation stats | `npm run curation:stats` | ✅ Working |

---

## 🔬 Integration Tests to Run

### 1. Full Install Flow (Fresh Clone)
```bash
# Test the install script
cd /tmp && rm -rf test-clawtext
git clone https://github.com/ragesaq/clawtext.git /tmp/test-clawtext
cd /tmp/test-clawtext && npm install && npm run build && npm test
```

### 2. Memory API End-to-End
```bash
# Add memory
npm run memory -- add "Test memory from CLI" --type fact --project test

# Search memory
npm run memory -- search "Test memory" --shared

# List memories
npm run memory -- list --project test

# Check stats
npm run memory -- stats
```

### 3. Multi-Agent Features
```bash
# Create agent-specific memory
npm run memory -- add "Agent coder note" --agent coder --visibility private

# Search with agent filter
npm run memory -- search "Agent coder" --agent coder --private
```

### 4. Session Continuity
```bash
# Add memory with session tracking
npm run memory -- add "Continuing work from session A" --session session-123 --related-sessions session-456
```

### 5. Ingest Dedupe
```bash
# Test deduplication (create test file first)
echo "# Errors" > memory/staging/test1.md
echo "# Errors" > memory/staging/test2.md  
npm run ingest:dedupe  # Should show duplicates
npm run ingest:dedupe --apply  # Should archive
```

### 6. Health Report
```bash
# Verify health check provides recommendations
npm run health
# Expected: status: "healthy", no issues
```

---

## 🧪 Functional Tests

### Test: Hot Cache Warming
1. Query the memory system multiple times
2. Check cache hit rate increases
3. Verify cache stats show hits

### Test: Token Budget Handling
1. Inject very large query results
2. Verify injection respects tokenBudget
3. Check graceful degradation (smaller results)

### Test: Multi-Agent Isolation
1. Create memory as agent-A (private)
2. Search as agent-B
3. Verify agent-B cannot see agent-A's private memory

### Test: Session Continuity
1. Create memory with sessionId: "session-1"
2. Create memory with relatesToSession: ["session-1"]
3. Search with includeRelatedSessions: true
4. Verify both are returned

---

## 🚀 Publication Checklist

- [ ] All integration tests pass
- [ ] Fresh clone + install works
- [ ] README is clear and accurate
- [ ] SKILL.md is complete
- [ ] clawhub.json has correct version
- [ ] No breaking changes since last release
- [ ] Changelog updated (if applicable)

---

## 🐛 Known Limitations (Document for Users)

1. **Hot cache is small** — Max 300 items, designed for speed not storage
2. **No vector DB by default** — File-based clusters, optional Chroma later
3. **Dedupe is template-aware only** — May need tuning for other duplicate types
4. **Multi-agent requires agentId** — Must be passed explicitly in API calls

---

## 📋 Quick Test Commands

```bash
# Full test suite
npm run build && npm test

# All observability
npm run health
npm run cache:stats  
npm run curation:stats
npm run memory -- stats

# Smoke test
npm run memory -- add "Smoke test" --type test
npm run memory -- search "Smoke"
npm run memory -- list --type test
```