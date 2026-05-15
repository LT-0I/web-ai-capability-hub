# generate/canvas-text

Status: PASS

Path: Tools menu → Canvas (menuitemcheckbox) → composer prompt for
"Stream 4 Stability Brief, 3 paragraphs" → Gemini generated a Canvas document
(title rendered as "Web AI Automation Stability Brief") → opened the Canvas
panel via `button[aria-label="Expand"]` → clicked
`button[aria-label="Share and export canvas"]` (sensitivity-guard
`--confirmed true`) → menu showed `Share Canvas / Export to Docs / Copy` →
clicked `Export to Docs`.

Outcome: a new browser tab opened at:

  https://docs.google.com/document/d/1Trf35Ozlw9cGJgEkAhGTKrxBzt-pEdYdQ2a6KD2Oa24/edit?pli=1&tab=t.0

with title `Stream 4 Stability Brief - Google Docs`. The document is stored
in the user's Drive (per policy, this is allowed). URL captured to
`exported-doc-url.txt`. No additional consent dialog appeared; export was
silent.

Selector inventory:
- Composer Tools button (the toolbox drawer trigger): generic `button` —
  needs improvement; works via DOM-search heuristic. Reliable approach is to
  click via `toolbox-drawer-button` (the Angular component selector).
- `#toolbox-drawer-menu button[role="menuitemcheckbox"]:has-text("Canvas")`
  selects Canvas.
- `button[aria-label="Expand"]` opens Canvas full panel.
- `button[aria-label="Share and export canvas"]` opens export menu.
- `button[role="menuitem"]:has-text("Export to Docs")` runs the export.
