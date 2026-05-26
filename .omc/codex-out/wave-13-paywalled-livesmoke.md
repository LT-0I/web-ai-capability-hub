# Wave 13 — Phase 8 paywalled DB live smoke

Generated: 2026-05-26T17:42:39.933Z

## Tier-A: 5 OA bug fixes verified GREEN status

Implemented the known OA/URL fixes in the literature drivers and re-ran the live matrix. Verified GREEN: frontiers, scielo, scoap3. MDPI and PubScholar remain documented deferrals, not silent passes.

| DB | Live result | Error | Size | Evidence |
|---|---|---|---:|---|
| frontiers | GREEN |  | 512141 | Literature PDF downloaded |
| mdpi | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | mdpi download did not produce a PDF artifact |
| pubscholar | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | PubScholar PDF link was not found in article page |
| scielo | GREEN |  | 496587 | Literature PDF downloaded |
| scoap3 | GREEN |  | 3074730 | Literature PDF downloaded |

## Tier-B: missing profiles registered

Registered 23 explicitly-listed missing profiles in data/browser-profiles/profiles.json and created minimal BrowserMetrics/.keep profile state. Note: the prompt labels this as 24, but the enumerated missing-profile list contains 23 names including wos.

- research-acs
- research-aiaa
- research-aip
- research-aps
- research-asce
- research-crc
- research-degruyter
- research-ieee
- research-iest
- research-iet
- research-iop
- research-nature
- research-optica
- research-rsc
- research-sae
- research-sciencedirect
- research-siam
- research-springer
- research-tandf
- research-wanfang
- research-wiley
- research-worldsci
- research-wos

The registry now contains stable seed entries for all 37 research-* profile directories present under data/browser-profiles/.

## Tier-C: live smoke matrix per-DB result

Serial smoke/retry evidence is consolidated at `.runs/wave-13/smoke-matrix.md`; raw merged JSON is `.runs/wave-13/smoke-results-final.json`; DOI/input catalog is `.runs/wave-13/test-dois.json`.

| DB | Result | Error | Size | Source run |
|---|---|---|---:|---|
| acm | GREEN |  | 8226058 | initial |
| acs | GREEN |  | 3009741 | initial |
| aiaa | GREEN |  | 24753508 | retry |
| aip | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry |
| aps | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry |
| arxiv | GREEN |  | 2475990 | initial |
| asce | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry |
| asme | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry |
| cambridge | GREEN |  | 125398 | initial |
| cellpress | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | initial |
| crc | GREEN |  | 576762 | retry |
| dblp | INVALID_ARGS_EXPECTED | INVALID_ARGS |  | initial |
| degruyter | GREEN |  | 2204452 | initial |
| emerald | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| frontiers | GREEN |  | 512141 | initial |
| ieee | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry |
| iest | GREEN |  | 1203454 | initial |
| iet | GREEN |  | 3733786 | retry |
| incopat | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| inspirehep | GREEN |  | 1386119 | initial |
| iop | GREEN |  | 648735 | retry |
| mdpi | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| nature | GREEN |  | 12092510 | retry |
| optica | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| opticsjournal | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| proquest | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| pubscholar | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | initial |
| royalsoc | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry |
| rsc | GREEN |  | 752735 | initial |
| sae | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial |
| scielo | GREEN |  | 496587 | retry |
| sciencedirect | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry |
| scoap3 | GREEN |  | 3074730 | initial |
| siam | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry |
| springer | GREEN |  | 1601651 | initial |
| tandf | GREEN |  | 576762 | retry |
| wanfang | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry |
| wiley | GREEN |  | 7040069 | retry |
| worldsci | GREEN |  | 360284 | retry |
| wos | INVALID_ARGS_EXPECTED | INVALID_ARGS |  | initial |

## Net delta: 2/40 → 20/40 GREEN

- Real DB GREEN: 20/38 (acm, acs, aiaa, arxiv, cambridge, crc, degruyter, frontiers, iest, iet, inspirehep, iop, nature, rsc, scielo, scoap3, springer, tandf, wiley, worldsci)
- INVALID_ARGS expected pseudo-drivers: 2/2 (dblp, wos).
- Effective expected-pass count including INVALID_ARGS pseudo-drivers: 22/40.
- No HTTP 429/rate-limit stop condition was observed.

## Permanent-deferred list

- aip: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — AIP Publishing Scitation PDF download did not complete within 60s after CDP click
- aps: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — APS Journals browser-session PDF download failed: page.goto: Timeout 60000ms exceeded. Call log:   - navigating to "https://journals.aps.org/prl/pdf/10.1103/PhysRevLett.132.053401", waiting until "domcontentloaded"
- asce: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — ASCE Library PDF download did not complete within 60s after CDP click
- asme: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — ASME Digital Collection PDF/download link was not found and no direct PDF download started
- cellpress: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — Cell Press browser-session PDF download failed: page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.cell.com/cell-reports/pdf/S2211-1247(24)00001-6.pdf Call log:   - navigating to "https://www.cell.com/cell-reports/pdf
- emerald: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- ieee: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — IEEE Xplore PDF/download link was not found and no direct PDF download started
- incopat: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- mdpi: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — mdpi download did not produce a PDF artifact
- optica: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- opticsjournal: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- proquest: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- pubscholar: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — PubScholar PDF link was not found in article page
- royalsoc: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — Royal Society Publishing PDF/download link was not found and no direct PDF download started
- sae: URL_RESOLVE_FAIL (ARTIFACT_VERIFICATION_FAILED) — Paywalled literature download did not produce a PDF artifact
- sciencedirect: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — ScienceDirect PDF/download link was not found and no direct PDF download started
- siam: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — SIAM Publications PDF download did not complete within 60s after CDP click
- wanfang: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — Wanfang Data PDF download did not complete within 60s after CDP click

## Validation evidence

- `rm -rf dist && npm run build` → PASS (`.runs/wave-13/build-final.log`).
- Targeted Phase 8 tests → PASS, 47/47 (`.runs/wave-13/phase8-targeted-tests.log`).
- `npm test` → PASS, 731/731 (`.runs/wave-13/npm-test.log`).
- Live smoke gate → PASS, 20/38 real GREEN and 2/2 INVALID_ARGS expected (`.runs/wave-13/smoke-matrix.md`).
