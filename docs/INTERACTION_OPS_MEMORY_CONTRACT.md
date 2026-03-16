# ClawText Interaction Ops Memory Contract

**Status:** Active integration spec  
**Purpose:** Define how ClawText should observe, classify, and ingest operation events from interaction surfaces without owning execution semantics.

---

## Why this exists

ClawText should learn from interaction-surface operations such as:
- creating a new forum post
- splitting a thread
- recreating content in a new location
- refreshing a thread or surface artifact
- appending to an existing thread or conversation surface

But ClawText should **not** be the execution backend for those operations.

That execution layer may be:
- Discord ops
- Clawback-native UI operations
- CLI tools
- future surface adapters

ClawText's role is to:
1. observe operation outcomes
2. preserve continuity artifacts
3. route artifacts into the correct memory lanes
4. learn from recurring successes/failures

---

## Scope

This contract is intentionally **surface-agnostic**.

Discord is the first major implementation surface, but the spec must also work for:
- Clawback-native app surfaces
- future web UI operations
- CLI-driven interaction movement
- other forum/thread/task-like environments later

The spec should therefore be expressed in **normalized interaction-op manifests**, not Discord-only terms.

---

## Non-goals

ClawText does **not** own:
- forum registry management
- raw Discord API semantics
- target resolution logic
- permission probing logic
- create/split/recreate execution itself
- source deletion policy enforcement at execution time

Those belong to the interaction-ops / surface-ops backend.

ClawText only consumes the resulting operation manifest and artifacts.

---

## Core model

An external interaction-ops backend performs execution.
ClawText consumes a structured manifest and classifies the outputs into memory lanes.

### Separation of responsibility

#### Interaction-ops backend owns
- operation planning
- target resolution
- permission checks
- preflight
- execution
- source deletion semantics
- linkback behavior
- backup generation
- operation result manifest

#### ClawText owns
- observing manifests and artifacts
- operational memory capture
- continuity packet ingestion
- archival routing
- pattern detection across repeated outcomes
- retrieval of learned practices later

---

## Normalized manifest schema

Every interaction operation should be representable as a normalized manifest.

### Required top-level fields

```json
{
  "surface": "discord",
  "operationFamily": "interaction-transfer",
  "operationType": "split",
  "status": "success",
  "sourceRef": "discord:thread:1480315446694641664",
  "destinationRef": "discord:forum:1482170879550033990",
  "performedAt": "2026-03-15T03:14:00Z",
  "performedBy": "agent|user|system",
  "artifacts": {
    "backup": [],
    "continuity": [],
    "execution": []
  },
  "policy": {
    "linkBack": true,
    "deleteSourcePolicy": "manual-only"
  },
  "warnings": [],
  "errors": []
}
```

### Canonical fields

- `surface`
  - `discord`
  - `clawback-app`
  - `cli`
  - `web-ui`
  - future values allowed

- `operationFamily`
  - use `interaction-transfer` for forum/thread/task movement operations

- `operationType`
  - `create`
  - `append`
  - `refresh`
  - `split`
  - `recreate`

- `status`
  - `success`
  - `partial`
  - `blocked`
  - `failed`

- `sourceRef`
  - normalized source reference

- `destinationRef`
  - normalized destination reference

- `performedAt`
  - ISO timestamp

- `performedBy`
  - `agent`, `user`, `system`, or structured actor id

- `artifacts`
  - grouped references to output artifacts

- `policy`
  - normalized execution-side policy decisions

- `warnings`
  - human-readable warning list

- `errors`
  - machine-readable and/or human-readable error list

---

## Surface-specific payloads

A manifest may include a namespaced surface-specific section.

### Example: Discord

```json
{
  "surface": "discord",
  "discord": {
    "guildId": "1474997926919929927",
    "sourceForumId": "1475021817168134144",
    "sourceThreadId": "1480315446694641664",
    "destinationForumId": "1482170879550033990",
    "destinationThreadId": "1482577604140863680",
    "messageIds": ["..."],
    "linkbackMessageId": "..."
  }
}
```

### Example: Clawback-native app

```json
{
  "surface": "clawback-app",
  "clawbackApp": {
    "workspaceId": "wk_123",
    "surfaceId": "pane_456",
    "sourceConversationId": "conv_789",
    "destinationConversationId": "conv_abc",
    "sessionId": "sess_xyz"
  }
}
```

ClawText should preserve these details for audit/debugging, but the normalized fields remain the primary routing spec.

---

## Artifact routing rules

Interaction operations can produce multiple artifact classes. ClawText should route them by **artifact type**, not by source system.

### 1. Execution artifacts → operational lane

Examples:
- operation manifest
- preflight report
- permission failure report
- write verification report
- backup manifest
- partial-write warning

Routing:
- capture as operational events/pattern candidates
- do not treat as curated project memory by default

### 2. Continuity artifacts → curated / searchable memory

Examples:
- continuity packet
- handoff summary
- next-agent bootstrap
- move/recreate summary intended for future context

Routing:
- ingest as durable/searchable project memory
- eligible for clustering and retrieval

### 3. Backup/source snapshots → archive/source memory

Examples:
- raw exported thread snapshot
- copied source messages
- raw post payload bundle

Routing:
- preserve for audit/recovery
- not directly promoted into durable guidance unless later curated

---

## Operational learning taxonomy for interaction ops

ClawText should classify interaction-op outcomes into reusable operational patterns.

### Suggested generic taxonomy

- `interaction-op.target-resolution-failed`
- `interaction-op.permission-missing`
- `interaction-op.partial-write-detected`
- `interaction-op.backup-created`
- `interaction-op.linkback-success`
- `interaction-op.preflight-blocked-unsafe-run`
- `interaction-op.attach-target-invalid`
- `interaction-op.recreate-success-with-linkback`
- `interaction-op.refresh-success`
- `interaction-op.split-success`

### Surface tags

Patterns should also carry tags like:
- `surface:discord`
- `surface:clawback-app`
- `surface:web-ui`

This keeps the pattern taxonomy reusable while still allowing surface-specific learning.

---

## Automatic retrieval triggers

ClawText should automatically consider operational retrieval when a task suggests interaction-surface operations, such as:
- forum
- thread
- split
- recreate
- refresh
- append
- link back
- backup
- transfer
- move between surfaces
- thread migration
- cross-forum work

This should use the **operational lane**, not general project memory first.

---

## Capture thresholds

Not every interaction-op event should become durable operational memory.

### Capture automatically
- blocked unsafe run with meaningful safety reasoning
- permission failure
- target resolution failure
- partial write detection
- verified backup creation
- repeatable successful operation pattern

### Do not promote automatically
- one-off low-value noise
- raw verbose logs
- duplicate success manifests with no new insight
- surface-specific internals with no repeatable lesson

---

## Suggested manifest references

Artifact references should be stable and path-oriented where possible.

### Example

```json
{
  "artifacts": {
    "execution": [
      {
        "type": "preflight-report",
        "ref": "state://discord-ops/runs/2026-03-15/preflight-001.json"
      },
      {
        "type": "operation-manifest",
        "ref": "state://discord-ops/runs/2026-03-15/manifest-001.json"
      }
    ],
    "continuity": [
      {
        "type": "handoff-packet",
        "ref": "file://docs/handoffs/CLAWBRIDGE_FULL_2026-03-15.md"
      }
    ],
    "backup": [
      {
        "type": "source-snapshot",
        "ref": "file://memory/bridge/backups/.../source-messages.json"
      }
    ]
  }
}
```

ClawText does not need the backend's internal storage engine. It needs stable references.

---

## ClawText-side adapter behavior

A ClawText integration adapter for interaction ops should do this:

1. receive normalized manifest
2. validate required fields
3. route execution artifacts into operational capture
4. route continuity artifacts into ingest/searchable memory
5. route backup refs into archival bookkeeping
6. emit one compact summary memory event where appropriate

### Pseudocode

```text
if manifest.status in [failed, partial, blocked]:
  capture_operational_event(manifest)

if manifest.artifacts.continuity exists:
  ingest_continuity_artifacts(manifest.artifacts.continuity)

if manifest.artifacts.backup exists:
  record_archive_refs(manifest.artifacts.backup)
```

---

## Extensibility requirements

This spec must remain extensible for the planned Clawback-native app surface.

### Therefore:
- no Discord-specific top-level required fields
- no assumption that source/destination are always forums/threads
- no assumption that message IDs always exist
- no assumption that linkback always means a Discord reply
- no assumption that backup is always JSON

The normalized spec should survive new surfaces without redesign.

---

## Acceptance criteria

This spec is successful when ClawText can do all of the following regardless of the execution surface:

1. learn from repeated success/failure patterns
2. ingest continuity outputs into searchable memory
3. preserve raw backups as archival memory
4. retrieve safe operational guidance for future similar requests
5. avoid needing raw execution internals to understand what happened

---

## Practical summary

ClawText should not become the interaction-ops engine.

It should become the **best observer, learner, and continuity-preserver** of interaction operations across Discord, Clawback-native surfaces, and future adapters.
