# B5 — file-create-spreadsheet (catalog gap: `file-create-spreadsheet`)

**Status:** PASS
**Catalog row:** `file-create-spreadsheet`

Prompt: `Create a tiny XLSX spreadsheet with 3 cities and their populations
as a downloadable file.` Claude rendered a file-creation artifact "City
populations" with type `Spreadsheet · XLSX`. Two Download controls were
present in DOM:
- `button[aria-label="Download City populations"]` — the visible
  in-message download button. First `browser:artifact-click` against this
  selector returned `ARTIFACT_DOWNLOAD_TIMEOUT` (no Browser.downloadWillBegin
  event observed within 60s).
- `button[aria-label="Download"]` — a smaller, icon-only download control
  in the artifact panel header (32×32 px at x=1160, y=10). Clicking THIS
  one via `browser:artifact-click` produced a real download.

File on disk:
- path: `download/47f875fa-8e29-429e-ada4-e6828e086272`
- suggestedFilename: `city_populations.xlsx`
- size: 5165 bytes
- sha256: `9fbf7467a4000731e699aaf2fcf9d743343ccb63ec785bd01cb2ad760ac9d49f`
- `file` reports `Microsoft Excel 2007+`; valid XLSX zip structure:
  `docProps/app.xml`, `docProps/core.xml`, `xl/theme/theme1.xml`,
  `xl/worksheets/sheet1.xml`, `xl/styles.xml`, `_rels/.rels`,
  `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`.

**Catalog observation (important):** For file-creation artifacts (XLSX
in this run; very likely also DOCX/PPTX/PDF) the **in-message Download
button does not trigger an actual download event** — only the
icon-only Download button in the artifact panel header does. The
catalog row should specify both selectors and note that the visible
button is a stub/UI-only on at least the Max plan account.

Evidence: `read-1.json`, `read-2.json`, `artifact-click.json` (timeout),
`artifact-click-2.json` (success), downloaded file in `download/`.
