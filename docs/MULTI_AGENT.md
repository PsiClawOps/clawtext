# ClawText Multi-Agent Memory Architecture

## Overview

ClawText supports multi-agent OpenClaw workflows by providing memory lanes that can be:
- **Shared** (team memory, visible to all agents)
- **Agent-private** (specific to one agent's context)
- **Cross-agent** (one agent writes, another reads)

## Memory Fields for Multi-Agent Support

```json
{
  "agentId": "agent-123",        // Which agent created this
  "agentName": "coding-agent",   // Human-readable agent name
  "visibility": "shared",        // shared | private | cross-agent
  "targetAgent": "agent-456",    // For cross-agent: intended recipient
  "originSession": "session-x",  // Original session ID
  "relatesToAgent": ["agent-789"] // Related agent IDs
}
```

## Visibility Levels

### `shared`
- Visible to all agents in the workspace
- Team decisions, shared protocols, project context
- Default for most memories

### `private` 
- Visible only to the creating agent
- Sensitive credentials, personal notes, agent-specific context
- Filtered out of cross-agent retrieval

### `cross-agent`
- Written by one agent for another
- Task handoffs, instructions, context passing
- Includes `targetAgent` field

## Retrieval with Agent Context

When an agent queries memory, it can specify:
- Include only my memories (`agentId == current`)
- Include shared memories
- Include cross-agent messages to me
- Exclude private memories from other agents

## Multi-Agent API Usage

```javascript
// Agent A creates a shared memory
memory.add('Decision: use Qwen for coding tasks', { 
  visibility: 'shared',
  agentId: 'agent-coder',
  agentName: 'coder-agent'
});

// Agent B retrieves, sees shared memories
memory.search('coding decisions', { 
  includeShared: true,
  excludePrivate: true 
});

// Agent A sends instruction to Agent B
memory.add('Check RGCS config before building', {
  visibility: 'cross-agent',
  agentId: 'agent-coder',
  targetAgent: 'agent-builder',
  type: 'instruction'
});
```

## Multi-Agent Configuration

In `openclaw.json`:

```json
{
  "clawtext": {
    "multiAgent": {
      "defaultVisibility": "shared",
      "allowPrivate": true,
      "allowCrossAgent": true,
      "agentIdHeader": "X-Agent-ID"
    }
  }
}
```

## Design Principles

1. **Default to shared** — Most memory should be team-accessible
2. **Opt-in privacy** — Agents choose private only when needed
3. **Explicit cross-agent** — Clear signal when memory is for another agent
4. **Agent-aware retrieval** — Query filters respect agent context
5. **No secret leakage** — Private memories never appear in shared retrieval