# Post-ship FIX wave 12 — PPTX ZIP bundle + Gemini canvas

## Outcome

- Status: **SHIP**
- Gate: **3/3 live smokes PASS** (required ≥2/3)
- Stop conditions: not triggered
- Contract/golden drift: none observed (`commands.length === 232`, `webai_ === 81`, `research_ === 121`; no diff under `src/generated`, `tests/consumerContract.test.ts`, `package.json`, or `tests/golden`)

## Scoped changes

- `src/mcp/tools.ts`
  - Kept the existing ChatGPT single-file PPTX chip/inline detector path.
  - Added primary PPTX ZIP-bundle strategy for `expected_extension === "pptx"`: prompt asks ChatGPT for PPTX + `summary.md` in one ZIP, downloads the ZIP through the existing generated-file detector, extracts the PPTX with a built-in ZIP central-directory reader, validates OOXML PPTX markers, and returns the extracted PPTX as the contract artifact.
  - Added Gemini Canvas export-to-Docs direct CDP path using the live-probed share/export selectors, with extension-page fallback for tests.
  - Hardened Gemini Canvas edit/open capture by using the live canvas activation path and contenteditable markup fallback.
- `examples/workflows/chatgpt-chatgpt-generate-file-pptx-ext.yaml`
  - Documented Wave 12 ZIP-bundle driver behavior and raised timeout for PPTX ZIP generation/extraction.
- `examples/workflows/gemini-canvas-to-docs-mgr.yaml`
  - Updated from fail-closed wording to the real Canvas share/export -> Docs path.
- `examples/workflows/gemini-gemini-canvas-edit-mgr.yaml`
  - Replaced the flaky HTML-page prompt with a stable editable-document Canvas prompt.

## Live probe summary

### ChatGPT ZIP delivery

Evidence: `.runs/postship-fix-wave-12/probes/chatgpt-zip-delivery.json`

- CDP: `http://127.0.0.1:9223`
- Prompt: generated PPTX + markdown summary, bundled into one ZIP.
- Result: **PASS**
- Delivery shape: inline file-delivery button
- Selector: `[data-message-author-role="assistant"] button.behavior-btn`
- Suggested filename: `renewable_energy_package.zip`
- MIME/extension: `application/zip`, `.zip`
- ZIP magic: `504b030414000000`

### Gemini Canvas to Docs

Evidence: `.runs/postship-fix-wave-12/probes/gemini-canvas-to-docs.json`

- CDP: `http://127.0.0.1:9225`
- Result: **PASS**
- Share selector: `[data-test-id="share-button"] button`
- Export selector: `[data-test-id="export-to-docs-button"]`
- Outcome: new Docs tab
- Probe Docs URL: `https://docs.google.com/document/d/18eNdLlKNcHs1YW94evY-8WBwwL_Dk_bmRLhl93-yyKE/edit?tab=t.0`
- Gemini tab hygiene: after-smoke cleanup closed 1 non-essential Gemini tab and kept `https://gemini.google.com/app`.

## Validation

- Build: **PASS**
  - Command: `rm -rf dist && npm run build`
  - Evidence: `.runs/postship-fix-wave-12/npm-build-final.txt`
- Test suite: **PASS**
  - Command: `npm test`
  - Evidence: `.runs/postship-fix-wave-12/npm-test-final-r2.txt`
  - Summary: `731` tests, `731` pass, `0` fail.

## Per-yaml live smoke verification

### `chatgpt-generate-file-pptx-ext`

Evidence: `.runs/postship-fix-wave-12/workflows/chatgpt-generate-file-pptx-ext.json`

- Result: **PASS**
- Error code: `null`
- Extracted PPTX path: `/tmp/explore-2026-05-25/chatgpt/renewable_energy_basics.pptx`
- PPTX size: `8210720` bytes
- PPTX SHA-256: `07a7dc579ff1fda2180b12336a83c6661dc75168be93a34823d1df3c45e83b74`
- ZIP path: `/tmp/explore-2026-05-25/chatgpt/renewable_energy_basics_bundle.zip`
- ZIP SHA-256: `a00cb0a0ef4e40bbc11f7afb76741504eb6ef12e6396c45f72123a205bd543e5`
- ZIP entry extracted: `renewable_energy_basics.pptx`
- `extracted_from_zip`: `true`
- Rate-cap handling: no 429 observed.

### `gemini-canvas-to-docs-mgr`

Evidence: `.runs/postship-fix-wave-12/workflows/gemini-canvas-to-docs-mgr.json`

- Result: **PASS**
- Error code: `null`
- Docs URL: `https://docs.google.com/document/d/13RL0lWNbQ2XHJuCff--UNIoGTmH7IsTipUdItVVnqjU/edit`
- Docs doc id: `13RL0lWNbQ2XHJuCff--UNIoGTmH7IsTipUdItVVnqjU`

### `gemini-gemini-canvas-edit-mgr`

Evidence: `.runs/postship-fix-wave-12/workflows/gemini-gemini-canvas-edit-mgr.r4.json`

- Result: **PASS**
- `canvas_opened`: `true`
- `edit_applied`: `true`
- `canvas_html_before` length: `371`
- `canvas_html_after` length: `371`
- Note: earlier attempts exposed empty canvas capture / activation flake; the final driver and YAML path is the passing evidence.

## Residual risk

- ChatGPT single-file PPTX chip handling remains in place but was not the primary Wave 12 path; the validated primary path is ZIP bundle -> server-side PPTX extraction.
- Built-in ZIP extraction intentionally supports standard non-ZIP64 stored/deflated entries only. Unsupported ZIP64/encrypted/missing-PPTX bundles fail honestly with `ARTIFACT_VERIFICATION_FAILED`.
