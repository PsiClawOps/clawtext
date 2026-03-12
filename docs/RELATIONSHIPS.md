# Lightweight Relationship Tracking

**Version:** v1.5 (proposed)  
**Status:** Lightweight structured relationships (YAML-based, not a full knowledge graph)  
**Last Updated:** 2026-03-12

---

## Overview

ClawText uses *implicit* relationships via semantic clustering. This document adds *explicit* lightweight relationship tracking for cases where you want to explicitly group and cross-reference related memories, patterns, and decisions.

**Key principle:** Relationships are optional annotations, not a required database. Pure YAML, human-readable, maintainable by agents or humans.

---

## When to Use Relationships

**Add a relationship when:**
- Multiple items are *semantically related* AND you want them grouped for discovery
- Cross-project impacts need to be tracked (e.g., RGCS changes affect Lumbot)
- Complex decision trees exist (e.g., "this decision depends on 3 other decisions")
- You want agent-readable cross-references without semantic search overhead

**Don't add relationships for:**
- Every related concept (that's what semantic clustering is for)
- Things that are already obvious from project scope
- Temporary or one-off connections

---

## Structure: `memory/clusters/relationships.yaml`

```yaml
# Lightweight relationship tracking
# Optional, human/agent-maintained
# No database required — just structured YAML

version: "1.0"
updated: "2026-03-12T18:00:00Z"

# Shortcut groups: logically connected concepts
shortcuts:
  - name: "RGCS Quaternion Issues"
    description: "All quaternion-related problems, fixes, and design decisions"
    connects:
      - "operational-learning:anti-pattern:quaternion-double-normalize"
      - "operational-learning:recovery-pattern:NaN-edge-case-fix"
      - "decision:RGCS-OneEuro-filter-params"
      - "code-ref:src/driver.cpp:487"
      - "doc-ref:docs/RGCS_Design.md#section-5"
    updated: "2026-03-12"
    maintainer: "agent"  # or "human"
  
  - name: "Lumbot Voice Latency"
    description: "Cross-project impact: RGCS VR tracking → Lumbot voice delays"
    connects:
      - "project:RGCS"
      - "project:Lumbot"
      - "infrastructure:Cerberus-streaming"
      - "decision:local-inference-strategy"
      - "anti-pattern:real-time-without-buffer"
    updated: "2026-03-10"
    maintainer: "human"

# Explicit relationship edges: for querying/traversal
edges:
  - type: "causes"
    from: "anti-pattern:quaternion-double-normalize"
    to: "error-pattern:NaN-in-quaternion-math"
    confidence: 0.92
    source: "operational-review"
    updated: "2026-03-12"
  
  - type: "depends-on"
    from: "decision:RGCS-filter-design"
    to: "library:OneEuro-filter"
    confidence: 0.88
    source: "MEMORY.md#RGCS-Development-Workflow"
    updated: "2026-03-10"
  
  - type: "affected-by"
    from: "project:Lumbot"
    to: "project:RGCS"
    reason: "VR controller latency affects voice command timing"
    confidence: 0.75
    updated: "2026-03-08"
  
  - type: "documents"
    from: "doc-ref:docs/RGCS_Design.md"
    to: "decision:OneEuro-filter-implementation"
    confidence: 0.95
    updated: "2026-03-12"

# Metadata for relationship maintenance
metadata:
  maintenance_schedule: "weekly"
  review_process: "agent-led with human approval"
  stale_threshold_days: 30
  validation_rules:
    - "shortcuts must have ≥2 connections"
    - "edges must have confidence ≥0.50"
    - "all references must be resolvable"
```

---

## Reference Formats

Use consistent reference formats for cross-linking:

| Type | Format | Example |
|------|--------|---------|
| **Operational Pattern** | `operational-learning:<category>:<name>` | `operational-learning:anti-pattern:quaternion-double-normalize` |
| **Memory Decision** | `decision:<topic>` | `decision:RGCS-OneEuro-filter-params` |
| **Code Location** | `code-ref:<path>:<line>` | `code-ref:src/driver.cpp:487` |
| **Documentation** | `doc-ref:<path>#<anchor>` | `doc-ref:docs/RGCS_Design.md#section-5` |
| **Project** | `project:<name>` | `project:RGCS` |
| **Infrastructure** | `infrastructure:<component>` | `infrastructure:Cerberus-streaming` |
| **Library/Tool** | `library:<name>` | `library:OneEuro-filter` |
| **Error Pattern** | `error-pattern:<name>` | `error-pattern:NaN-in-quaternion-math` |

---

## Relationship Types

| Type | Meaning | Example |
|------|---------|---------|
| **causes** | A causes B to happen | Error X causes crash in function Y |
| **depends-on** | A requires/depends on B | Filter design depends on library X |
| **affected-by** | A is impacted by B | Lumbot latency affected by RGCS timing |
| **related-to** | A is conceptually related to B | Quaternion math related to rigid-body physics |
| **documents** | A documents/describes B | Design doc describes implementation choice |
| **implements** | A implements decision B | Code implements design decision |
| **violates** | A violates principle B | Pattern X violates best practice Y |
| **resolves** | A resolves/fixes problem B | Workaround X resolves gotcha Y |

---

## Agent Workflows

### Pattern 1: Review & Update on Operational Learning Promotion

When an error pattern is promoted to durable guidance:

```javascript
// Pseudo-code for agent workflow
async function promoteOperationalPattern(pattern) {
  // 1. Pattern promoted ✓
  
  // 2. Check for related patterns
  const related = await clawtext.search(pattern.description);
  
  // 3. Suggest relationship updates
  if (related.length > 0) {
    const suggestions = related.map(r => ({
      from: `operational-learning:${pattern.type}:${pattern.name}`,
      to: `operational-learning:${r.type}:${r.name}`,
      type: "related-to",
      confidence: r.score
    }));
    
    // 4. Ask human or auto-add if high confidence
    if (suggestions.some(s => s.confidence > 0.85)) {
      await updateRelationships(suggestions);
    }
  }
}
```

### Pattern 2: Cross-Project Impact Detection

During daily memory flush (pre-compaction):

```javascript
async function checkCrossProjectImpacts() {
  // 1. Scan today's decisions
  const decisions = await memory.search("decision");
  
  // 2. For each decision, ask: does this affect other projects?
  for (const decision of decisions) {
    const impacts = await identifyExternalImpacts(decision);
    
    if (impacts.length > 0) {
      // 3. Create/update relationship edge
      impacts.forEach(impact => {
        addRelationshipEdge({
          type: "affected-by",
          from: impact.project,
          to: decision.project,
          reason: decision.summary,
          confidence: 0.70  // Human will verify
        });
      });
    }
  }
}
```

### Pattern 3: Shortcut Maintenance (Weekly)

```bash
# Weekly shortcut review (agent-led)
# 1. Check all shortcuts for staleness
# 2. Verify all connections are still valid
# 3. Merge redundant shortcuts
# 4. Archive unused shortcuts

clawtext relationships validate
# Output: "3 stale, 1 broken-link, 2 ready-to-merge"

clawtext relationships review
# Interactive: approve/reject changes
```

---

## Querying Relationships

### Agent Tools (Future)

```typescript
// Search for shortcut group
await clawtext.shortcut("RGCS Quaternion Issues");
// Returns: all connected items grouped

// Find related items
await clawtext.relatedTo("operational-learning:anti-pattern:quaternion-double-normalize");
// Returns: all connected edges (dependencies, causation, etc.)

// Traverse relationship chain
await clawtext.traverse("decision:RGCS-filter-design", maxDepth=3);
// Returns: dependency tree (3 levels deep)

// List all cross-project impacts
await clawtext.crossProjectEdges();
// Returns: only edges where projects differ
```

### CLI (Today)

```bash
# Show YAML directly
cat memory/clusters/relationships.yaml | grep -A20 "RGCS Quaternion"

# Validate structure
yaml-lint memory/clusters/relationships.yaml

# Agent-led review (via MCP)
mcp call clawtext.relationships validate
```

---

## Maintenance

### What Requires Maintenance

- **Shortcuts:** Update when new related items discovered or items archived
- **Edges:** Keep confidence scores realistic; update when relationships change
- **Staleness:** Archive edges >30 days old without active use

### What Doesn't

- **Semantic clustering:** Automatic, no manual work needed
- **Operational learning:** Driven by failure capture, not relationships
- **MEMORY.md:** Separate system, not driven by relationships

### Review Cadence

| Frequency | Task |
|-----------|------|
| **Daily** | Auto-detect cross-project impacts (during memory flush) |
| **Weekly** | Validate shortcuts, merge redundancy, archive stale edges |
| **Monthly** | Re-assess confidence scores, prune unused shortcuts |
| **Quarterly** | Review entire relationships.yaml structure, update docs |

---

## Integration with Operational Learning

Relationships can be extracted from operational patterns:

```yaml
# When operational learning lane captures a pattern:
operational-learning:
  - type: "anti-pattern"
    name: "quaternion-double-normalize"
    description: "Normalizing quaternion twice causes NaN edge cases"
    
    # Optional: auto-extract relationships
    relationships:
      - type: "causes"
        to: "error-pattern:NaN-in-quaternion-math"
      - type: "related-to"
        to: "decision:RGCS-OneEuro-filter-params"
```

These are automatically surfaced as relationship suggestions during operational learning review.

---

## Examples

### Example 1: RGCS Quaternion Bug

```yaml
shortcuts:
  - name: "RGCS Quaternion Issues"
    description: "Double-normalize bug and its fixes"
    connects:
      - "operational-learning:anti-pattern:quaternion-double-normalize"
      - "operational-learning:recovery-pattern:NaN-edge-case-fix"
      - "decision:RGCS-OneEuro-filter-params"
      - "code-ref:src/driver.cpp:487"
      - "doc-ref:docs/RGCS_Design.md#quaternion-normalization"
    updated: "2026-03-12"

edges:
  - type: "causes"
    from: "anti-pattern:quaternion-double-normalize"
    to: "error-pattern:NaN-in-quaternion-math"
    confidence: 0.92
  
  - type: "resolves"
    from: "recovery-pattern:NaN-edge-case-fix"
    to: "error-pattern:NaN-in-quaternion-math"
    confidence: 0.90
  
  - type: "documents"
    from: "doc-ref:docs/RGCS_Design.md#quaternion-normalization"
    to: "decision:RGCS-OneEuro-filter-params"
    confidence: 0.88
```

### Example 2: Cross-Project: Lumbot Voice Latency

```yaml
shortcuts:
  - name: "Lumbot Voice Latency"
    description: "RGCS tracking precision affects voice command response time"
    connects:
      - "project:RGCS"
      - "project:Lumbot"
      - "infrastructure:Cerberus-streaming"
      - "decision:local-inference-strategy"
      - "anti-pattern:real-time-without-buffering"
    updated: "2026-03-10"

edges:
  - type: "affected-by"
    from: "project:Lumbot"
    to: "project:RGCS"
    reason: "VR controller tracking latency cascades to voice commands"
    confidence: 0.75
  
  - type: "affects"
    from: "decision:RGCS-update-frequency"
    to: "performance:Lumbot-voice-latency"
    confidence: 0.78
```

---

## File Location & Schema

```
memory/clusters/
  ├── relationships.yaml       ← This file (lightweight relationships)
  ├── *.json                   ← Semantic clusters (auto-generated)
  └── entities.json            ← Entity index (auto-generated)
```

Schema validation:
- YAML must be valid (parseable by standard YAML libraries)
- All references must follow reference format conventions
- Edges must have confidence ≥0.50
- Shortcuts must have ≥2 connections

---

## What This Enables

✅ **Grouped discovery:** Find all related items for a topic  
✅ **Impact analysis:** Trace cross-project dependencies  
✅ **Agent-readable:** Easy for agents to parse and query  
✅ **Low overhead:** Just YAML, no database or complex maintenance  
✅ **Composable:** Works alongside semantic clustering (not instead of)  
✅ **Optional:** Pure bonus feature, doesn't break anything if unused

---

## When to Evolve to a Real Graph

**Consider upgrading to a proper knowledge graph if/when:**
- You regularly traverse 4+ levels of dependencies
- Relationship maintenance becomes a bottleneck (>30 edges per week)
- You need automated impact analysis across 10+ projects
- Stakeholders need visual graph exploration tools

For now: YAML relationships solve 90% of the use cases with 10% of the complexity.

---

See also: CURATION.md (memory lifecycle), OPERATIONAL_LEARNING.md (pattern capture), MEMORY_SCHEMA.md (memory format)
