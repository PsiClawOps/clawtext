# Project Docs Schema

**Status:** Cross-project documentation convention  
**Purpose:** Define a standard documentation shape for GitHub-backed projects that works standalone in-repo, while also supporting optional publication into ClawDash's docs/library surface.

---

## Design goals

This schema exists to support two things at the same time:

1. **Modularity**
   - a project like ClawText must work perfectly well without requiring full ClawDash
   - repo docs remain usable as the primary technical source of truth

2. **Centralization later**
   - if a project is used with ClawDash, its docs should fit into a predictable library structure
   - every GitHub-backed project should be treated consistently in the docs surface

This means the schema is **repo-first, ClawDash-compatible**.

---

## Core rule

### Canonical source
For every GitHub-backed project:
- **repo docs are the canonical technical source of truth**

### Optional library mirror
If ClawDash is in use:
- selected docs may be mirrored/published into the ClawDash docs library
- the ClawDash copy is a **published/library surface**, not the canonical editing surface

This keeps projects modular while still enabling centralized documentation later.

---

## Project metadata schema

Every GitHub-backed project should be representable with a small metadata block.

Example:

```yaml
project: clawtext
display_name: ClawText
repo: PsiClawOps/clawtext
github_backed: true
status: active
maturity: release-candidate
category: memory-infrastructure
primary_owner: ragesaq
surface_area:
  - openclaw
  - clawdash
  - discord
canonical_repo_docs: true
clawdash_library_compatible: true
publish_to_clawdash: optional
```

### Recommended metadata fields

- `project`
- `display_name`
- `repo`
- `github_backed`
- `status`
- `maturity`
- `category`
- `primary_owner`
- `surface_area`
- `canonical_repo_docs`
- `clawdash_library_compatible`
- `publish_to_clawdash`

---

## Standard project doc sections

Every project should expose the same top-level documentation shape, even if some sections are lightweight.

### Required sections

1. **Overview**
2. **Status**
3. **Install / Activation**
4. **Architecture**
5. **Operations**
6. **Contracts / Interfaces**
7. **Release**
8. **Gaps / Risks**
9. **Docs Index**
10. **Archive**

This gives ClawDash a stable schema for every GitHub-backed project.

---

## Section definitions

### Overview
What the project is.

Contains:
- one-line definition
- short purpose
- what it is / is not
- key capabilities

### Status
What state the project is in right now.

Contains:
- active / paused / archived
- version
- release target
- current phase
- last reviewed date

### Install / Activation
Canonical setup and activation only.

Contains:
- published install flow
- local dev flow
- non-canonical paths explicitly called out
- verification commands

### Architecture
System design and major components.

Contains:
- architecture overview
- subsystem/lane model
- data/storage model
- integration boundaries

### Operations
How to run and maintain it.

Contains:
- monitoring
- cron jobs
- maintenance tasks
- troubleshooting
- health checks

### Contracts / Interfaces
How the project connects to other systems.

Contains:
- API/tool contracts
- integration contracts
- external surface contracts
- memory/ops contracts if relevant

### Release
What current release or release target means.

Contains:
- release definition
- in-scope
- deferred
- release readiness checklist

### Gaps / Risks
What remains incomplete or risky.

Contains:
- gap matrix
- known limitations
- blockers
- next technical steps

### Docs Index
Human/agent-friendly navigation entry point.

Contains:
- start here
- by audience
- by task
- most important docs

### Archive
Superseded but preserved material.

Contains:
- old release notes
- migration notes
- old audits
- superseded docs

---

## Standard doc classes

Each doc should be classifiable into one of these classes.

- `overview`
- `status`
- `setup`
- `architecture`
- `operations`
- `spec`
- `release`
- `gap-analysis`
- `archive`

This helps both humans and agents organize docs consistently.

---

## Recommended frontmatter

If a project wants structured metadata in docs, use lightweight frontmatter like this:

```yaml
---
project: clawtext
doc_class: spec
title: Interaction Ops Memory Spec
status: active
canonical_source: repo
source_repo: PsiClawOps/clawtext
source_path: docs/INTERACTION_OPS_MEMORY_CONTRACT.md
publish_to_clawdash: true
audience:
  - developers
  - agents
  - operators
last_reviewed: 2026-03-15
---
```

### Recommended fields

- `project`
- `doc_class`
- `title`
- `status`
- `canonical_source`
- `source_repo`
- `source_path`
- `publish_to_clawdash`
- `audience`
- `last_reviewed`

This is optional for raw repo docs, but useful if ClawDash later wants richer indexing.

---

## Repo-first layout

A project repo does **not** need to match the ClawDash library layout exactly.

The repo only needs:
- a coherent docs directory
- stable canonical docs
- enough metadata or convention to mirror them later

For many projects, a docs directory like this is enough:

```text
repo/
  README.md
  docs/
    ARCHITECTURE.md
    MONITORING.md
    RELEASE_DEFINITION.md
    GAP_MATRIX.md
    ...
```

That is acceptable. ClawDash mirroring is a publication concern, not a repo layout requirement.

---

## Optional ClawDash library layout

If a project is mirrored into ClawDash, use this general structure:

```text
clawdash/docs/library/projects/<project-slug>/
  00-index/
    README.md
    DOC_INDEX.md

  10-overview/
    OVERVIEW.md
    STATUS.md

  20-setup/
    INSTALL.md
    ACTIVATION.md

  30-architecture/
    ARCHITECTURE.md
    CONTRACTS.md

  40-operations/
    OPERATIONS.md
    MONITORING.md
    TROUBLESHOOTING.md

  50-release/
    RELEASE_DEFINITION.md
    GAP_MATRIX.md
    RELEASE_CHECKLIST.md

  90-archive/
    ...
```

This is a **library projection**, not the required repo structure.

---

## Promotion rules

A doc should be promoted into ClawDash if it is:
- useful across sessions
- useful to future agents
- useful to project planning/operations
- likely to be referenced repeatedly
- part of the project's durable operating model

A doc should remain repo-only if it is:
- highly temporary
- debugging-local
- migration scratch
- one-off implementation residue

---

## Temporary staging rule

While ClawDash doc-management features are still under development, projects may use a local ignored staging/export directory such as:

```text
.clawdash-export/
```

This should be:
- ignored in git
- treated as temporary publishing prep space
- safe to delete/rebuild later

This allows experimentation without polluting the project repo.

---

## What this means for ClawText

ClawText should remain fully usable as a standalone project.

It should not require:
- a full ClawDash deployment
- ClawDash-specific runtime behavior
- ClawDash-specific doc tooling to make sense of its docs

But it **should** remain compatible with ClawDash library publishing by:
- keeping repo docs coherent
- keeping contracts and release docs well-structured
- making selected docs easy to mirror into the ClawDash project-doc schema later

---

## Acceptance criteria

This schema is working when:

1. a GitHub-backed project can stand alone using only its repo docs
2. the same project can be mirrored into ClawDash without rewriting its whole docs strategy
3. agents can predict where to find overview / ops / release / spec docs across projects
4. projects are treated consistently in the centralized docs surface
5. modularity is preserved — ClawDash is compatible, not required

---

## Practical summary

**Rule:** Every GitHub-backed project should maintain repo-first canonical docs that can be projected into a shared ClawDash library schema later.

That gives us:
- modular projects
- consistent documentation treatment
- future centralization
- cleaner agent navigation
- less duplication and drift
