# Agent-Led Library Import Workflow

**Status:** Draft  
**Owner:** ClawText  
**Phase:** Post-2.0 / Phase 3  
**Related:** `docs/LIBRARY_LANE.md`, `docs/LIBRARY_LANE_INTEGRATION_SPEC.md`, `docs/PRD.md`

---

## 1. Purpose

Define how an agent should handle **library import requests** in a way that matches ClawText product philosophy:
- agent-led
- file-first
- auditable
- structured
- safe for long-term retrieval quality

This workflow exists so an operator can say something natural like:
- "Import the official Proxmox 9.1 docs into the library"
- "Make this URL a library collection"
- "Pull this documentation into ClawText so future agents can use it"

without needing to manually build manifests or think in terms of internal ingest plumbing.

---

## 2. Recommendation

## Recommended product behavior

**Make library import agent-led at the UX layer, but manifest-backed under the hood.**

### Why
This is the right approach because it preserves both:

### Operator experience
- natural-language request
- low friction
- no need to remember CLI details

### System integrity
- explicit trust metadata
- named collections
- repeatable ingest
- stable provenance
- auditability through files

### What not to do
Do **not** make the first version a freeform "fetch any URL into memory" behavior.

### Why not
That would:
- blur trusted library material with generic ingest
- weaken ranking quality later
- make provenance less clear
- turn the library lane into an uncurated scrape bucket

The right behavior is: **agentic on the surface, structured underneath**.

---

## 3. Scope

This workflow is for requests that mean:
- import a trusted doc set
- create a named library collection
- make the imported material available for future retrieval as reference knowledge

This workflow is **not** for:
- operational learning capture
- one-off ad hoc web fetch
- continuity handoffs
- freeform raw ingest without collection identity

---

## 4. Canonical user intents

The agent should recognize intents like:
- "import this into the library"
- "make this a library collection"
- "pull in the official docs for X"
- "add this vendor doc set to ClawText"
- "bring this URL into memory as a reference library"
- "import the Proxmox docs into ClawText library"

### Intent classification outcome
The request should resolve to one of:
1. **official / vendor docs collection**
2. **internal docs collection**
3. **community/reference collection**
4. **ambiguous source requiring clarification**

---

## 5. Agent workflow

## Step 1 — detect library-import intent
If the user is clearly asking to bring external docs into durable retrievable reference memory, the agent should switch into **library import mode**.

## Step 2 — inspect source and classify trust
The agent should determine whether the source appears to be:
- official/vendor
- internal/team-owned
- reviewed community
- generic community / uncertain

### Recommendation
Proceed automatically only when trust is reasonably clear.

### Why
The library lane should remain high-signal and trusted.

## Step 3 — gather or infer metadata
The agent should infer or collect:
- collection title
- slug
- version (if obvious and relevant)
- source type
- trust level
- source URL(s)
- topics/tags
- refresh policy (default: manual)

## Step 4 — decide whether clarification is needed
If the source is ambiguous, ask **one short clarification question**.

### Good examples
- "Should I import this as official, internal, or community library material?"
- "Do you want this as a named library collection or just general ingest?"

### Recommendation
Keep clarification minimal.

### Why
The point is agent-led operation, not pushing complexity back onto the user.

## Step 5 — create or update collection manifest
The agent should write a proper collection manifest rather than keeping import state ephemeral.

## Step 6 — run library ingest
The agent should execute the manifest-backed ingest workflow.

## Step 7 — report the result
The agent should respond with:
- collection name / slug
- trust level
- imported sources
- imported/skipped counts
- where the collection now lives
- suggested next step (start-here entry, overlay, retrieval test)

## Step 8 — optionally scaffold follow-up artifacts
When useful, the agent should offer to create:
- a curated start-here entry
- an overlay template for local environment notes

---

## 6. Proceed vs ask rules

## Auto-proceed when
- source is clearly official/vendor
- source identity is obvious
- collection purpose is clear
- version can be inferred safely or is not critical

### Example
"Import the official Proxmox VE 9.1 docs into the library."

## Ask one clarifying question when
- source trust is ambiguous
- multiple different doc sets could match the request
- version matters and is not obvious
- the source looks like a blog/forum/community page

### Example
"Import this URL into the library" with an unclear third-party site.

## Do not proceed silently when
- source trust is unclear and likely to affect ranking later
- the request could mean either general ingest or trusted library import
- the URL appears unrelated to documentation/reference material

---

## 7. Manifest generation rules

The agent-generated manifest should always include:
- `kind: library-collection`
- `slug`
- `title`
- `source_type`
- `trust_level`
- `status`
- `visibility`
- `refresh_policy`
- `sources`
- `topics`

### Default recommendations
- `status: planned` before first ingest
- `visibility: shared`
- `refresh_policy: manual`
- `retrieval_priority: high` for official/vendor docs

### Recommendation
Use conservative defaults and explicit metadata.

### Why
Defaults should preserve clarity, trust, and inspectability.

---

## 8. Agent output contract

After a successful library import, the agent should summarize in a stable structure.

### Recommended output shape
- **Collection created:** `slug`
- **Title:** human-readable title
- **Trust level:** official / internal / etc.
- **Sources imported:** list of URLs
- **Imported:** N
- **Skipped:** N
- **Runtime location:** library runtime root path
- **Suggested next step:** create entry / create overlay / test retrieval

### Why
This makes the action visible and easy to audit in both chat history and files.

---

## 9. Proxmox example

### User request
"Import the official Proxmox VE 9.1 docs into the library."

### Agent behavior
1. detect library-import intent
2. recognize `pve.proxmox.com` as official/vendor docs
3. infer collection slug `proxmox-official-docs-9-1`
4. use official docs index + admin guide sources
5. create/update manifest
6. run library ingest
7. report outcome
8. optionally offer to create or refresh:
   - `proxmox-9-1-start-here`
   - `proxmox-our-environment` overlay

---

## 10. Recommended first implementation

## Recommendation
Implement the first agent-led version as a **workflow contract and behavior pattern**, not as a fully separate command parser.

### Why
This is the fastest path to product value because:
- the manifest-backed ingest path already exists
- the agent can already create files and run commands
- we can prove the UX before investing in a richer command surface

### What that means in practice
The agent should be taught to:
- recognize library-import requests
- create manifests automatically
- execute `library:ingest`
- report results in a structured way

Only after that is stable should we consider a dedicated higher-level command wrapper.

---

## 11. Future command evolution

Once the workflow is proven, future command surfaces can make it more explicit.

### Possible future commands
```bash
clawtext library:create-collection --url <url> --title <title> --trust official
clawtext library:import-url --collection <slug> --url <url>
clawtext library:scaffold-entry --collection <slug>
clawtext library:scaffold-overlay --collection <slug>
```

These are useful later, but not required for the first agent-led version.

---

## 12. Final recommendation

If choosing the best next product behavior, I recommend:

1. **agent-led library import workflow first**
2. **manifest-backed ingest under the hood**
3. **minimal clarification only when trust/source ambiguity matters**
4. **structured post-import reporting every time**

### Why this is the best fit
Because it matches ClawText's product philosophy:
- automatic where it makes sense
- agent-led where judgment is useful
- explicit and reviewable when durable state is created

That is exactly what Library Lane should feel like.
