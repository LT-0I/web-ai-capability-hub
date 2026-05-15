# share/export-to-docs

Status: PASS (exercised twice; both Drive Docs created)

Two successful Export-to-Docs invocations during this run:

1. **Canvas → Docs (`generate/canvas-text`)** — auto-opened a new tab at
   `https://docs.google.com/document/d/1Trf35Ozlw9cGJgEkAhGTKrxBzt-pEdYdQ2a6KD2Oa24/edit`
   (title `Stream 4 Stability Brief - Google Docs`).
2. **Deep Research → Docs (`generate/deep-research`)** — created
   "Gemini 3 Fast vs. Pro Comparison" in user's Drive (visible in
   `/library`). The Doc was created server-side; no new tab auto-opened
   (Gemini behavior — longer reports go to /library + Drive, do not
   pop a tab).

Both Docs land in the user's own Drive; no additional consent dialog
appeared.

Selector inventory:
- Canvas export: `button[aria-label="Share and export canvas"]` →
  menuitem `Export to Docs`.
- Deep Research export: `button[data-test-id="export-menu-button"]` →
  `.cdk-overlay-pane button.mat-mdc-menu-item:has-text("Export to Docs")`.
- Standard chat per-response menu: `button[aria-label="Show more options"]`
  → menuitem `Export to Docs` (aria-label-attached).
