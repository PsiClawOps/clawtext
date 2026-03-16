# ClawText Memory Policy & Trigger Contract

**Status:** Active behavior policy  
**Intent:** Keep ClawText strongly automatic without turning it into uncontrolled memory spam.

---

## Core philosophy

ClawText should behave with this default posture:

- **Capture automatically**
- **Recall automatically**
- **Review regularly**
- **Promote selectively**
- **Ask only when judgment or boundary-setting is needed**

This is the operating policy for ClawText as a memory system.

The point is not to make the user micromanage memory. The point is to make memory reliable, low-friction, and increasingly useful over time.

---

## Memory priority chain

ClawText is a layered memory system. Different lanes answer different questions.

### Default priority order

1. **Operational memory**
   - failures, fixes, workflows, guardrails, successful procedures
   - use for debugging, tool use, commands, config/gateway/plugin/bridge work

2. **Curated / clustered knowledge memory**
   - stable project context, durable decisions, structured context
   - use for broader project recall and continuity

3. **Daily extracted memory / raw working traces**
   - fallback, audit trail, extraction source material
   - use when higher-signal memory does not answer the question

4. **Current conversation context**
   - immediate context only
   - not a substitute for durable memory

### Rule of thumb

If the task is about **how the system works or fails**, prefer the operational lane.

If the task is about **what we decided, built, or learned**, prefer curated/clustered memory.

If neither yields enough context, fall back to daily extracted material.

---

## Automatic capture policy

ClawText should automatically capture durable memory candidates when the user states any of the following:

### Always capture automatically

- user preferences
- standing instructions
- corrections to previous behavior
- durable workflow expectations
- project decisions
- recurring constraints
- durable environment / setup facts
- operational failures and recoveries
- successful workflows worth repeating

### Usually do not capture automatically

- greetings / social filler
- one-off phrasing with no durable value
- transient speculative thoughts
- raw log spam as durable memory
- secrets / credentials / sensitive material

### Important nuance

Automatic capture does **not** mean automatic promotion.

Capture is cheap and broad.
Promotion is selective and reviewed.

---

## Automatic retrieval policy

ClawText should automatically retrieve memory when the task indicates memory would materially help.

### Auto-query operational memory for

- debugging
- tool use
- command execution
- config changes
- deployment / recovery
- gateway work
- plugin work
- bridge / transfer / thread migration work
- repeated failure contexts

### Auto-query curated / clustered memory for

- prior decisions
- prior implementation context
- project continuity
- design rationale
- user workflow preferences
- “what did we decide before?” style questions
- new-session continuity bootstrap

### Usually do not inject memory for

- normal greetings
- purely social chat
- unrelated general explanation
- creative output with no continuity need

---

## Review and promotion policy

The system should remain automatic, but not reckless.

### Automatic

- capture
- extraction
- clustering
- retrieval gating
- maintenance scheduling
- candidate surfacing
- relationship suggestion surfacing

### Agent-led

- candidate review
- promotion proposals
- relationship confirmation
- memory quality triage
- backlog cleanup

### User / boundary gated

- privacy boundaries
- memory policy exceptions
- promotions that materially change durable workspace guidance
- destructive forgetting outside routine hygiene policy

---

## Memory policy bootstrap

ClawText should support a lightweight one-time memory policy setup.

### When to ask

Ask only when:
- no prior memory policy exists, and
- the interaction is substantive enough to justify memory, and
- policy is actually needed to avoid ambiguity

### Policy questions

1. What should ClawText remember automatically?
2. What should it avoid storing?
3. Should it capture proactively, or only on explicit memory-worthy signals?
4. Any privacy boundaries or protected categories?
5. Should critical items be mirrored into curated file memory when appropriate?

### Default policy if the user skips

Use sensible defaults:
- remember preferences, decisions, corrections, workflow expectations, durable project context
- do not store secrets, credentials, or clearly sensitive personal data
- proactive capture is on
- reviewed durable guidance may be mirrored where appropriate

This keeps the system automatic while still respecting user boundaries.

---

## Trigger matrix

| Situation | Primary lane | Default action |
|---|---|---|
| User states a preference | Curated / working memory | Capture automatically |
| User states a standing instruction | Curated / working memory | Capture automatically |
| User corrects prior behavior | Curated + operational if relevant | Capture automatically |
| Tool/command fails | Operational | Capture automatically |
| Same failure repeats | Operational | Aggregate to candidate |
| Successful multi-step workflow | Operational | Capture automatically |
| User asks what was previously decided | Curated / clustered | Retrieve automatically |
| User asks how to avoid a known failure | Operational | Retrieve automatically |
| New session on active project | Curated / clustered | Retrieve automatically |
| Raw logs / dumps | Working trace only | Buffer/extract, do not directly promote |

---

## Guardrails for automatic behavior

To preserve trust and signal quality, automatic behavior must respect these rules:

1. **No silent destructive cleanup** of important source material
2. **No raw-log promotion** into durable guidance without review
3. **No noisy universal injection** into every prompt
4. **No silent thread / target fallback** in bridge workflows when it changes destination semantics
5. **No assumption that capture = truth**
6. **No assumption that promotion = always retrievable**, unless retrieval policy explicitly includes promoted items

---

## Relationship to existing ClawText lanes

For interaction-surface execution events (Discord ops, future Clawback-native app ops, etc.), see [`INTERACTION_OPS_MEMORY_CONTRACT.md`](./INTERACTION_OPS_MEMORY_CONTRACT.md). That document defines how ClawText should observe and route external operation manifests without owning execution itself.

This policy maps cleanly to the current architecture:

- **Working lane** handles broad automatic capture and extraction source material
- **Knowledge / cluster lane** handles durable context retrieval
- **Operational lane** handles self-improvement, failure memory, and workflow patterns
- **Curation / promotion** turns noisy capture into reviewed durable guidance

The policy does not replace the architecture. It explains how the architecture should behave.

---

## Non-goals

This policy does **not** mean:
- every message becomes durable memory
- every retrieval lane is queried every time
- the system promotes without review
- the user must approve every capture event
- operational memory replaces project memory
- clustered memory replaces operational learning

The goal is **automatic, bounded, high-signal memory behavior**.

---

## Practical summary

If ClawText follows this policy, the expected user experience is:

- I do **not** have to keep telling it the same things
- it remembers my durable preferences and decisions automatically
- it recalls prior implementation context when that context matters
- it learns from failures and successful workflows over time
- it does not spam me with memory management chores
- it only asks me when a real boundary or judgment call exists

That is the desired ClawText behavior.
