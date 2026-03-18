# Clawptimization v2 — Prompt Compositor Architecture

## Overview

Clawptimization v2 replaces the flat prompt composition model with a **named slot architecture** that intelligently manages what context enters the prompt, how much budget each source gets, and when to actively prune to avoid catastrophic compaction.

## Design Principles

1. **The agent should never know less, only store smarter** — pruning removes token cost, not knowledge. Everything pruned is recoverable from the journal.
2. **Preserve the why** — every inclusion/exclusion decision is logged with reasoning. No silent context changes.
3. **Rate-aware, not threshold-based** — pressure monitoring uses projected turns until compaction, not fixed token counts.
4. **Pluggable slots** — any context source can register as a slot provider. The compositor doesn't care where context comes from.
5. **Budget scales with model** — slot budgets are percentages of the context window, auto-adjusted on model switch.

## Slot Architecture

```
PromptCompositor
  ├── SlotRegistry           — named slots with providers
  ├── BudgetManager          — % of context window, overflow redistribution
  ├── ContextPressureMonitor — rate-aware pressure, continuous aggressiveness
  ├── ActivePruner           — per-turn pruning when pressure rises
  └── DecisionLog            — optimization-log.jsonl audit trail
```

### SlotProvider Interface

```typescript
interface SlotProvider {
  id: string;
  source: ContextSlotSource;
  
  // Can this provider contribute content right now?
  available(ctx: SlotContext): boolean;
  
  // Fill the slot with content up to the budget
  fill(ctx: SlotContext, budgetBytes: number): ContextSlot[];
  
  // Optional: can this slot be pruned under pressure?
  prunable?: boolean;
  
  // Optional: prune content from this slot to free bytes
  prune?(slots: ContextSlot[], targetFreeBytes: number, aggressiveness: number): ContextSlot[];
}
```

### Built-in Slot Providers

| Slot | Source | Policy | Default % | Prunable |
|------|--------|--------|-----------|----------|
| system | AGENTS.md | always-include | 5% | No |
| memory | RAG clusters | scored-select | 20% | Yes (evict unreferenced) |
| library | Library Lane | on-demand | 15% | Yes (evict stale) |
| clawbridge | Handoff packets | if-present + fresh | 8% | Yes |
| recent-history | Last N turns | always-include | 12% | No |
| mid-history | Turns N-M | scored-select (substance) | 15% | Yes (compress) |
| deep-history | Turns M+ | decision-only | 8% | Yes (summarize) |
| decision-tree | Operational guidance | pattern-match | 8% | Yes |
| journal | Cold-start restore | cold-start-only | 9% | Yes |

### Future Slot Providers (Phase 2 — ClawCanvas)

| Slot | Source | Policy | Notes |
|------|--------|--------|-------|
| cross-session | Other session journals/contexts | metadata-probe + selective-pull | Phase 1: journal scan. Phase 2: live session reads |
| situational-awareness | All active sessions | scan-and-summarize | "what's happening everywhere" |

### Phase 1 Cross-Session (buildable now)

Reads journal files for other active channels, extracts:
- Channel name / topic
- Last activity timestamp
- Most recent substantive message
- Key decisions from last N hours

Formats as compact awareness block (~200-500 bytes):
```
Active threads (last 2h):
  #clawdash: mobile responsive layout, 12min ago
  #clawdapter: OAuth2 adapter, waiting on API key
  #clawcanvas: blade integration architecture, active now
```

## Budget Management

### Auto-scaling

```
total_budget = context_window_tokens × budget_ratio (default 0.15)
slot_budget = total_budget × slot.ratio
```

Budget ratio: 0.15 default (15% of context window)
- 160K window → 24K tokens (~96KB) total
- 192K window → 28.8K tokens (~115KB) total
- 400K window → 60K tokens (~240KB) total

### Overflow Redistribution

When a slot doesn't use its full budget (e.g., no ClawBridge packet available), unused budget flows to the next hungriest slot. Priority order for overflow:
1. mid-history (usually the most token-hungry)
2. memory (more RAG coverage is always useful)
3. library (deeper reference docs)
4. deep-history (more decision coverage)

## Context Pressure & Active Pruning

### Pressure Model

```typescript
interface ContextPressure {
  remainingPct: number;        // 0-1
  burnRate: number;            // tokens/turn (rolling avg last 5 turns)
  projectedTurns: number;      // remaining / burnRate
  trend: 'growing' | 'stable' | 'shrinking';
}

// Continuous aggressiveness derived from projected turns
aggressiveness = clamp(1 - (projectedTurns / 20), 0, 1)
```

### Pruning at each aggressiveness level

- **0.0-0.2**: No pruning
- **0.2-0.4**: Drop acks/noise older than 20 turns (score < 0.25)
- **0.4-0.6**: Truncate old tool results, thin unreferenced memory slots
- **0.6-0.8**: Compress mid-history to decisions + key statements
- **0.8-0.9**: Deep-history summary, library eviction, pre-compaction checkpoint to journal
- **0.9-1.0**: Aggressive slot budget cuts, attempt to cancel compaction

### Key property: pruning is reversible
The journal has full content for everything pruned. The agent can recover any pruned content on demand.

## Content-Type Half-Lives

Journal records get a `content_type` classification:

| Type | Half-life | Examples |
|------|-----------|---------|
| decision | ∞ (never decays) | "we decided to use X", "the approach is Y" |
| spec | 180 days | Architecture docs, API specs, interface definitions |
| preference | 180 days | "I prefer architecture-first", "default to Sonnet" |
| skill | 120 days | "I can debug this", "we're experienced with TypeScript" |
| attribute | 30 days | "my timezone is MST", "hard stop is 2am" |
| discussion | 60 days | Back-and-forth exploration, pros/cons |
| ack | 0 (immediate decay) | "ok", "sounds good", "lets do it" |
| noise | 0 (immediate decay) | Raw logs, heartbeats, system messages |

Half-lives are used by:
- deep-history slot: only includes messages above half-life threshold
- journal-context-scorer: freshness decay rate varies by content type
- active pruning: acks/noise pruned first regardless of position

## Contradiction Detection

Before including deep-history content, check against recent turns:
- If a message in deep-history contradicts a more recent message → drop it
- If a decision was superseded → mark as superseded, don't inject
- Detection method: keyword overlap + semantic similarity check (lightweight)

## Decision Tree Memory

A new data structure for operational guidance patterns:

```yaml
id: deploy-clawtext
trigger: "deploying ClawText changes"
steps:
  - "npm run build — verify clean compile"
  - "check hooks are registered in openclaw.json"
  - "git commit with descriptive feat: prefix"
  - "git push origin main"
learned_from:
  - "2026-03-17: forgot to register hooks, had to fix"
  - "2026-03-16: build failed silently, caught by validate-rag"
confidence: 0.85
last_used: "2026-03-17T07:32:00Z"
```

Sources for building decision trees:
- Explicit: user says "remember this workflow"
- Extracted: repeated patterns in journal (same sequence 3+ times)
- ClawBridge: handoff "next steps" sections

## Build Plan

### Build A: PromptCompositor Core (foundation)
- SlotProvider interface
- SlotRegistry
- BudgetManager (% based, auto-scale, overflow)
- ContextPressureMonitor
- Replace existing Clawptimizer.optimize()
- Fix typo crash in current hook handler

### Build B: Conversation History Tiering (needs A)
- Split history into recent/mid/deep slot providers
- Per-tier scoring with JournalContextScorer
- Content-type half-lives
- Contradiction detection for deep-history

### Build C: Active Pruning (needs A)
- Rate-aware pressure monitoring
- Continuous aggressiveness scoring
- Per-turn pruning evaluation
- Pre-compaction checkpoint
- Compaction avoidance (cancel if enough freed)

### Build D: Decision Tree Memory (needs A for slot)
- Data structure and storage
- Pattern matching against current context
- Extraction from journal patterns
- New slot provider

### Build E: ClawBridge Slot + Library Manifests (needs A for slot)
- ClawBridge handoff packet discovery
- Freshness scoring for handoffs
- OpenClaw system config library manifest
- OpenClaw docs library manifest
- First library ingest run

### Build F: Cross-Session Awareness Phase 1 (needs A for slot)
- Journal scanner across all channels
- Topic extraction + activity detection
- Compact awareness block formatter
- New slot provider (lightweight, journal-based)

## Integration with ClawCanvas (future)

ClawCanvas rooms will:
- Each be a session with its own context window
- Write structured metadata to a shared location
- Allow direct session-to-session context reads
- Replace Discord as the primary interaction surface

The slot provider interface is designed to be the same across phases:
- Phase 1: journal files → SlotProvider.fill()
- Phase 2: ClawCanvas metadata → SlotProvider.fill()  
- Phase 3: live session queries → SlotProvider.fill()

The compositor doesn't know or care about the source. It gets ContextSlot[] and scores them.
