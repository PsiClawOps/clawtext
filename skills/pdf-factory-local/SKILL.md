---
name: pdf-factory-local
description: Local-only high-quality PDF generation + form workflows (no external API required). Supports HTML/Typst/Markdown rendering, fillable form creation, form filling, and PDF quality validation.
version: 1.0.0
owner: local
category: pdf-documents
---

# PDF Factory (Local-Only)

This skill is **local-first** and **non-API by default**.

Use when you need:
- high-quality generated PDFs (reports/contracts/letters)
- local rendering without SaaS/API cost
- fillable PDF forms
- preflight quality checks before sending documents

## Commands

### 1) Generate PDF (high quality)
```bash
bash ~/.openclaw/workspace/skills/pdf-factory-local/scripts/pdf-factory-local.sh \
  generate \
  --input /path/to/template.html|.md|.typ \
  --output /path/to/output.pdf
```

Renderer priority:
- `.typ` -> `typst compile`
- `.html` -> `chromium/chrome --headless --print-to-pdf`, fallback `wkhtmltopdf`, then `weasyprint`
- `.md` -> `pandoc` -> html -> local renderer

### 2) Create fillable PDF form (AcroForm)
```bash
bash ~/.openclaw/workspace/skills/pdf-factory-local/scripts/pdf-factory-local.sh \
  create-form \
  --spec /path/to/form-spec.json \
  --output /path/to/form.pdf
```

### 3) Fill existing fillable PDF form
```bash
bash ~/.openclaw/workspace/skills/pdf-factory-local/scripts/pdf-factory-local.sh \
  fill-form \
  --template /path/to/form.pdf \
  --data /path/to/field-values.json \
  --output /path/to/filled.pdf
```

### 4) Validate output quality
```bash
bash ~/.openclaw/workspace/skills/pdf-factory-local/scripts/pdf-factory-local.sh \
  validate \
  --input /path/to/file.pdf
```

Validation includes best-effort checks via local tools (`qpdf`, `pdfinfo`, `pdffonts`) when available.

## Notes
- No external API calls in this skill.
- If a local dependency is missing, script explains exactly what to install.
- Use templates in `templates/` for repeatable branding and layout.
- For complex AcroForm layouts that exceed the simple JSON form-spec flow, use the `pdf-lib` pattern example at:
  - `examples/ai-vendor-questionnaire-fillable.mjs`
- Layout guidance for dense fillable forms:
  - use a shared inline single-line field helper for consistent baseline alignment
  - force page breaks at question boundaries, not mid-question
  - keep branding/logo insertion separate from the base fillable form when final branding may be added later in a PDF editor
