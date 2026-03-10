# ClawText Research: Competitive Analysis

## Compared Systems

### mem0 (mem0.ai)
**Type:** Memory layer for AI assistants/agents  
**License:** Apache 2.0  
**Position:** Leading open-source memory system

**Key Features:**
- Multi-level memory (User, Session, Agent state)
- Adaptive personalization
- Simple API: `add()`, `search()`, `get_all()`, `delete()`
- Supports multiple LLMs (OpenAI, Anthropic, local, etc.)
- Multiple vector store backends (Qdrant, Pinecone, Chroma, etc.)
- Self-hosted or managed service option

**Performance Claims:**
- +26% accuracy vs OpenAI Memory on LOCOMO benchmark
- 91% faster than full-context approaches
- 90% lower token usage

**Architecture Pattern:**
```
User Message → LLM → Extract memories → Store in vector DB
Query → Semantic search → Retrieve memories → Inject into prompt
```

---

## ClawText Design Principles (Derived from Research)

### 1. Simple API First
mem0 shows that a simple `add()`/`search()` API is sufficient. ClawText should expose:
- `add()` - add memory (from capture, ingest, or curation)
- `search()` - retrieve relevant memories
- `query()` - natural language memory query

### 2. Multi-Level Memory
mem0 uses User/Session/Agent levels. ClawText maps to:
- **Hot Cache** (Session-like, very fast, recent)
- **Curated Memory** (User-level, high-signal)
- **Archive** (Agent-level, historical/searchable)
- **Staging** (pending curation)

### 3. LLM-Native Operations
mem0 uses LLMs to:
- Extract important facts from conversations
- Summarize and compress memories
- Decide what to remember

ClawText already does this via:
- Extraction hooks (capture)
- Summarizer (curation)
- Could add: LLM classifier for ambiguous cases

### 4. Multiple Backends
mem0 supports multiple vector stores. ClawText could:
- Start with file-based (current clusters)
- Add optional vector DB backend (Chroma, Qdrant)
- Keep file-based as default for simplicity

### 5. Self-Hosting Priority
mem0 offers both managed and self-hosted. ClawText should:
- Remain self-hosted by default (no external service)
- Be agent-installable (simple `npm install` or clone)
- Support local models for privacy-sensitive deployments

---

## Feature Gap Analysis

| Feature | mem0 | ClawText (Current) | Gap |
|---------|------|-------------------|-----|
| Simple add/search API | ✅ | Partial (via hooks) | Need explicit API layer |
| Multi-level memory | ✅ | ✅ (lanes) | N/A - already implemented |
| LLM-based extraction | ✅ | ✅ (extraction hook) | N/A |
| Multiple vector backends | ✅ | ❌ (files only) | Optional future |
| User preferences storage | ✅ | ❌ | Could add |
| Session memory | ✅ | Partial (hot cache) | Expand |
| Agent memory | ✅ | Archive | N/A |
| Quantified benchmarks | ✅ | ❌ | Need to add |

---

## Recommendations from Research

### 1. Add Explicit Memory API
Add `memory.js` module with:
```javascript
memory.add(content, options)
memory.search(query, options)
memory.getAll(filters)
memory.delete(id)
```

### 2. User Preferences Storage
Add special memory type for user preferences:
- Explicit `preference` type
- High priority in retrieval
- Persist across sessions

### 3. Benchmarking
Add metrics similar to mem0's:
- Retrieval accuracy (relevance scoring)
- Latency per query
- Token usage comparison

### 4. Optional Vector Backend
Consider adding Chroma as optional backend for:
- Better semantic search
- More scalable than file-based
- Still self-hostable

---

## What ClawText Does Better

- **Discord-native**: Built for Discord forums/threads from day 1
- **Curation emphasis**: Explicit staging/review/promotion workflow
- **OpenClaw integration**: Tight hooks with OpenClaw gateway
- **Report-driven**: Health reports, tuning recommendations
- **Small footprint**: JSON-backed hot cache, not heavyweight

---

## References
- mem0 GitHub: https://github.com/mem0ai/mem0
- mem0 Docs: https://docs.mem0.ai
- LOCOMO Benchmark: referenced in mem0 research paper