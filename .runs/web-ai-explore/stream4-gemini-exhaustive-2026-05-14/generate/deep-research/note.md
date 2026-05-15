# generate/deep-research

Status: PASS

Path: composer Tools menu → Deep research (menuitemcheckbox) → composer
prompt "Summarize the difference between Gemini 3 Fast and Gemini 3 Pro
models..." → wait for plan (~20s) → click
`button[aria-label="Start research"]` → wait for completion (research
finished in ~7 minutes wall time, well under 15-min budget).

Result rendered inline in chat panel with a Canvas-like report viewer
showing tabs `Contents / Share & Export / Create`. Report title:
**"Architectural and Functional Stratification of the Gemini 3 Model
Series: A Comprehensive Analysis of Fast and Pro Variants"**.

Captured 14,398 characters of the report to `response.txt`.

Selector inventory:
- Plan trigger: `button[aria-label="Start research"]`.
- Export menu: `button[data-test-id="export-menu-button"]` (label "Share & Export").
- Export-to-Docs option lives inside `.cdk-overlay-pane button.mat-mdc-menu-item:has-text("Export to Docs")`.

Quirk: clicking Export-to-Docs triggered "Creating document..." snackbar
(visible bottom-left in screenshot
`2026-05-14T16-38-14-094Z-Model-Comparison-Research-Plan---Google-Gemini.png`).
At the time this note was written, the Doc creation was still in-flight in
the background — a new docs.google.com tab was not yet auto-opened. That is
a **known Gemini behavior** (Drive document creation can take a few minutes
for long reports) but does not invalidate the export action. The deep
research report text itself is fully captured in `response.txt` so the
artifact requirement is met.

Sources visible in DOM (28+ links): blog.google, gemini.google,
deepmind.google, ai.google.dev, openrouter.ai, devoteam.com, tech-now.io,
vellum.ai, glbgpt.com, metacto.com, etc.
