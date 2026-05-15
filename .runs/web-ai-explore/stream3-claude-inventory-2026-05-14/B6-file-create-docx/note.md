# B6 — file-create-docx (catalog gap: `file-create-document-pdf`)

**Status:** PASS
**Catalog row:** `file-create-document-pdf` (DOCX branch)

Prompt: `Create a one-page DOCX document titled Stream Test Doc with a
single paragraph saying this is a smoke test fixture. Make it a
downloadable file.` Claude rendered a file-creation artifact "Stream test
doc". Two Download controls present (same pattern as B5 XLSX):
- `button[aria-label="Download Stream test doc"]` (in-message; B5 showed
  this one timed out for XLSX).
- `button[aria-label="Download"]` (icon-only in artifact panel header —
  the working path).

Used `browser:artifact-click` against the icon-only `Download` button.

File on disk:
- path: `download/e161d05a-6460-4f84-a856-e928c4d76e3a`
- suggestedFilename: `stream_test_doc.docx`
- size: 8559 bytes
- sha256: `fda49a1324514bae64064cfee795911a73c09c39d73580c75e6c3a04aa42d25b`
- `file` reports `Microsoft Word 2007+`.
- `node dist/src/cli.js verify:docx-min` reports 2 paragraphs, 44 chars —
  valid OOXML DOCX with extractable text.

**Catalog observation:** DOCX file creation is reachable and working on
this Max-plan account; the same dual-button download UX as XLSX
(in-message vs icon-only) applies, and only the icon-only header
button issues a real download event.

Evidence: `read-1.json`, `artifact-click.json`, downloaded file in
`download/`.
