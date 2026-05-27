# Wave 18 — Optica paywalled driver per-DB deep fix

## Probe

Evidence: `.runs/wave-18-optica/probes/optica-deep.json`

Headed `research-optica` Chrome was launched and probed against:

- `https://opg.optica.org/ol/abstract.cfm?uri=ol-51-10-2872`
- `https://opg.optica.org/ol/viewmedia.cfm?uri=ol-51-10-2872&seq=0`
- `https://doi.org/10.1364/OL.531116`

Findings:

- Abstract route: `302` to `/ol/viewmedia.cfm?...&html=true`, checkjs ran, then `/captcha/...&uri=ol-51-10-2872`; final title `Captcha`.
- Direct `viewmedia` route: final `/captcha/...&uri=ol-51-10-2872`; no PDF artifact.
- DOI route: redirects to a different Optica OL article (`ol-49-16-4630`) and also lands on `/captcha/...`.
- Abstract page did **not** expose a PDF link before captcha (`pdf_candidates: 0`).
- Cookies after first Optica visit gained `CFX_CHECKJS` and `CFX_SESSION`, but captcha persisted.
- Alternative request probes:
  - root `viewmedia.cfm?uri=ol-51-10-2872&seq=0`: captcha HTML, not `%PDF-`.
  - root `abstract.cfm?URI=ol-51-10-2872`: captcha HTML, not `%PDF-`.
  - `/ol/fulltext.cfm?uri=ol-51-10-2872`: captcha HTML, not `%PDF-`.
  - `/ol/viewmedia.cfm?uri=ol-51-10-2872&html=true`: captcha HTML, not `%PDF-`.
  - `/ol/upcoming_pdf.cfm?uri=ol-51-10-2872`: Optica home HTML, not `%PDF-`.
  - guessed `/ol/cd-51-10-2872.pdf`: `404`, not `%PDF-`.

Conclusion: this `research-optica` profile is captcha-state blocked; no reliable abstract-first PDF link or direct-PDF URL pattern was found for the hunted article.

## Diff

Touched only the allowed driver/evidence/report paths for the committed change.

`src/mcp/submcp/literature/optica.ts`:

- Added Optica URI parsing for IDs like `optica:ol-51-10-2872`.
- Added abstract-first candidate ordering:
  1. `/{journal}/abstract.cfm?uri=...`
  2. `/{journal}/viewmedia.cfm?uri=...&seq=0`
  3. root `/viewmedia.cfm?uri=...&seq=0`
  4. `/{journal}/fulltext.cfm?uri=...`
- Added Optica candidate filter to avoid captcha/assets and keep same-URI candidates.
- For Optica URI doc IDs without `pdf_url`, synthesize the OPG viewmedia URL so the paywalled driver can run; DOI doc IDs without `pdf_url` still preserve the existing `research_optica_get_metadata` / `pass pdf_url` contract.
- Converted captcha-shaped Optica `ELEMENT_NOT_FOUND` / download-timeout outcomes into actionable `LOGIN_REQUIRED`:
  - `Open https://opg.optica.org/ol/abstract.cfm?uri=ol-51-10-2872 in the research-optica profile manually, clear the captcha once, then cookies persist; rerun webai_optica_download_pdf.`

## Validation

- `rm -rf dist && npm run build` — PASS (`.runs/wave-18-optica/build-after-fix.log`, exit `0`)
- Targeted regression check: `node --test dist/tests/phase8-bucket-c/paywalled-literature-downloads.test.js` — PASS, `15/15` (`.runs/wave-18-optica/paywalled-targeted-test.log`)
- `npm test` — PASS, `731/731` (`.runs/wave-18-optica/npm-test-rerun.log`, exit `0`)
- 8-lock — PASS (`.runs/wave-18-optica/8-lock.json`): package `2.1.0`, contract `consumer-contract-2.1.0`, commands `232`, error codes `40`, webai `81`, research `121`, wah `8`, golden `236`, download_pdf `40`, forbidden diff `[]`.

## Re-smoke

Evidence: `.runs/wave-18-optica/optica-resmoke.json`

Command:

```bash
node dist/src/cli.js webai:optica:download-pdf \
  --doc-id optica:ol-51-10-2872 \
  --output-dir .runs/wave-18-optica/downloads/optica-resmoke \
  --profile research-optica \
  --output-json
```

Result:

- `ok: false`
- `errorCode: LOGIN_REQUIRED`
- `pdf_magic: null`
- message is actionable and points at the manual captcha-clear URL for `research-optica`.

Gate: **FAIL = no `%PDF-`**, but driver now ships honest `LOGIN_REQUIRED` surfacing instead of misleading `ELEMENT_NOT_FOUND`.
