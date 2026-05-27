# Path C — Unpaywall OA fallback for paywalled literature drivers

## Executive summary

### Final 8-lock values

| Lock | Value |
| --- | --- |
| package | `2.2.0` |
| contract | `consumer-contract-2.2.0` |
| cmds | `232` |
| errs | `40` |
| webai_ | `81` |
| research_ | `121` |
| wah_ | `8` |
| golden | `listMcpTools.236.json` / `236` tools |

### Live smoke results

| DB | DOI | oa_source | PDF size | Result |
| --- | --- | --- | ---: | --- |
| optica | `10.1364/OL.531116` | `none` | — | Unpaywall resolved an OA URL, but the PMC PDF endpoint returned an HTML proof-of-work/download-prep page, so no verified `%PDF-` artifact was written. |
| sae | `10.4271/2023-01-1234` | `none` | — | Honest `LOGIN_REQUIRED`; Unpaywall returned no OA copy for this DOI. |
| asce | `10.1061/AOMJAH.AOENG-0026` | `publisher` | `874462` | Publisher PDF path succeeded before fallback. |
| springer | `10.1007/s43621-024-00534-6` | `unpaywall` | `493290` | Verified `%PDF-` artifact via Unpaywall OA PDF URL. |
| sciencedirect | `10.1016/j.jcp.2019.108929` | `unpaywall` | `386611` | Verified `%PDF-` artifact via Unpaywall OA arXiv URL. |

Live-smoke evidence is stored under `.runs/path-c-unpaywall/livesmoke/`; downloaded PDFs are under `.runs/path-c-unpaywall/downloads/`.

### Reviewer report verdict

- Native reviewer first reported `FAIL` on missing custom-handler `oa_source` and unbounded OA fetch timeout; both were fixed.
- Claude cross-model reviewer final verdict: `PASS`.
- Claude validation command: `node .runs/path-c-unpaywall/review/claude-validation.mjs`
- Claude validation result: `PASS — 31 paywalled commands carry oa_source + unpaywall_email; 17 DOI drivers opt in; excluded DBs stay out; locks intact.`

### Commit + push status

- Commit title: `webai: path-c — Unpaywall OA fallback for paywalled drivers (contract 2.2.0)`
- Commit ID: pending until commit is created; final assistant response records the pushed commit SHA.
- Push status: pending until commit is created and pushed.

## Implementation summary

- Added `src/mcp/submcp/literature/unpaywall.ts` with DOI/email validation, serialized Unpaywall API calls, timeout/network/rate-limit handling, and best-OA PDF URL extraction.
- Integrated Unpaywall as explicit opt-in routing in `paywalled.ts`; publisher success reports `oa_source:"publisher"`, Unpaywall success reports `oa_source:"unpaywall"`, and failures/queues report `oa_source:"none"`.
- Added bounded direct OA PDF fetch with HTML PDF-link discovery and `%PDF-` verification.
- Enabled `unpaywall_fallback: true` for DOI-based drivers selected for Path C, while keeping ProQuest/IncoPat/Wanfang excluded.
- Added CLI/schema/contract/golden/docs/version/redaction updates for optional `unpaywall_email` and output `oa_source`.
- Added regression coverage for Unpaywall API resolution, paywalled fallback behavior, OA fetch timeout, custom handler `oa_source`, and redaction key variants.

## Validation evidence

- `rm -rf dist && npm run build` — exit 0.
- `npm run verify:contract-version` — exit 0.
- `node .runs/path-c-unpaywall/review/claude-validation.mjs` — exit 0.
- `npm test` — exit 0, `742/742` passing.
