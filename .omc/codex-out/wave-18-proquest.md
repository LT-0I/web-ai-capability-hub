# Wave 18 — ProQuest per-DB deep fix

## Result

PASS — authenticated `research-proquest` headed Chrome session can resolve a real ProQuest docview and download a verified `%PDF-` artifact through `webai_proquest_download_pdf`.

## Probe

Artifact: `.runs/wave-18-proquest/probes/proquest-deep.json` (redacted before commit: transient CSRF, signed media, analytics/Pendo, browser/session query values, and full body text removed).

Headed Chrome/profile:
- Profile: `research-proquest`
- CDP: existing visible Chrome on port `9222`
- Browser: `Chrome/148.0.7778.167`
- Session state: authenticated ProQuest session; no SSO/login wall observed.

Entry points tested:
- `https://www.proquest.com/` → authenticated basic search page.
- `https://www.proquest.com/databases` → authenticated database browse page.
- `https://www.proquest.com/results?DBId=ALL&Subjects=renewable` → authenticated results page, `13,961` results, docview links found.
- `https://www.proquest.com/topics/renewable+energy` → authenticated basic search page.
- Advanced search UI (`/advanced?accountid=16605`, query `noft(renewable energy 2024)`) → authenticated results page, `13,961` results.

Discovered docview/PDF flow:
- Real docview id: `3280668334` (`central:3280668334`).
- Result page exposes fulltext PDF route pattern: `/docview/<id>/fulltextPDF/<search-id>/<rank>?accountid=16605`.
- The fulltext PDF route itself returns HTML; the actual PDF is delivered after clicking the fulltextPDF/PDF control as an authenticated `media.proquest.com/...` response with `content-type: application/pdf`.

## Diff summary

Changed only `src/mcp/submcp/literature/proquest.ts` for product code.

Key changes:
- Added ProQuest-specific docview normalization for numeric ids, `central:<id>`, and `/docview/<id>` URLs.
- Allows `webai_proquest_download_pdf --doc-id central:<id>` without requiring a separate `pdf_url` when the id is a ProQuest docview id.
- Added explicit `LOGIN_REQUIRED` surfacing for unauthenticated institutional SSO/login walls with a headed-Chrome setup instruction.
- Replaced the generic paywalled click/download path for ProQuest with a ProQuest-specific browser flow that:
  - opens docview/fulltextPDF candidates in the authenticated profile,
  - clicks the PDF/fulltextPDF control,
  - captures the authenticated `application/pdf` network response, and
  - writes/verifies the artifact as `%PDF-`.
- Kept queue/quota behavior and literature-driver registration for ProQuest.

## Validation

Build:
- Command: `rm -rf dist && npm run build`
- Exit: `0`
- Log: `.runs/wave-18-proquest/build.log`

Tests:
- Command: `npm test`
- Exit: `0`
- Result: `731/731` passing
- Log: `.runs/wave-18-proquest/npm-test.log`

Re-smoke:
- Command: `webai:proquest:download-pdf --doc-id central:3280668334 --profile research-proquest --output-json`
- Output: `.runs/wave-18-proquest/results/proquest-smoke.json`
- Verification: `.runs/wave-18-proquest/results/proquest-smoke-verify.txt`
- Gate: PASS — first bytes `%PDF-`
- Size: `782464`
- SHA-256: `faf87926ea260fbe91a4c751f96d0c87127b27bfe7f274f80c0b3018bf9b4631`

Note: the live PDF binary was verified during smoke and not committed; the smoke JSON and verification text capture the gate evidence.
