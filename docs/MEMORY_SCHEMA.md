# ClawText Canonical Memory Schema (Draft v1)

## Goal

Give ClawText, Ingest, Recall, and Curation a common contract for memory-like records.

This schema is intentionally small enough to be practical and broad enough to support:
- capture
- ingest
- curation/promotion
- retrieval
- hot-cache admission
- long-term archive search

## Core Fields

```json
{
  "id": "mem_...",
  "sourceType": "capture|ingest|promotion|summary|archive|manual",
  "sourceId": "optional-source-id",
  "sourceRef": "path/url/thread/message/repo reference",
  "project": "clawtext",
  "type": "fact|decision|learning|protocol|preference|incident|summary|todo|note",
  "lane": "hot|curated|archive|staging",
  "status": "staged|review|promoted|archived|dismissed|actioned",
  "confidence": 0.0,
  "importance": 0.0,
  "createdAt": "ISO timestamp",
  "observedAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "entities": ["entity://project/clawtext"],
  "tags": ["memory", "rag"],
  "keywords": ["clawtext", "cache"],
  "dedupeHash": "sha1-or-similar",
  "summary": "short distilled representation",
  "body": "canonical content",
  "relations": {
    "supersedes": [],
    "related": [],
    "derivedFrom": []
  },
  "metadata": {}
}
```

## Required Fields

Minimum viable required fields:
- `project`
- `type`
- `confidence`
- `updatedAt`
- `body` or `summary`

## Recommended Fields

Strongly recommended for high-quality retrieval:
- `entities`
- `keywords`
- `dedupeHash`
- `sourceType`
- `sourceRef`
- `lane`
- `status`

## Notes

- `summary` should be the compact, injection-friendly representation
- `body` may be longer and more faithful to source material
- `lane` is about storage/retrieval role, not truth value
- `status` is about workflow state
- `dedupeHash` should be stable for identical or near-identical content

## Entity Strategy

Canonical entities should move toward URI-like identifiers, e.g.:
- `entity://project/clawtext`
- `entity://user/ragesaq`
- `entity://repo/ragesaq/clawtext`
- `entity://thread/1480315446694641664`
- `entity://file/skills/clawtext/src/rag.ts`

## Why This Matters

Without a canonical schema:
- ingest writes one shape
- curation expects another
- recall ranks a third
- hot cache stores a fourth

That fragmentation creates subtle bugs and poor explainability.

A common schema gives us:
- better dedupe
- better entity-driven recall
- clearer debugging
- more stable migrations
- easier ClawHub/public documentation
