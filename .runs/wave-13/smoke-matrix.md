# Wave 13 live smoke matrix

Generated: 2026-05-26T17:37:17.852Z
Real DB GREEN: 20/38
INVALID_ARGS expected: 2/2

| DB | Kind | Profile | Result | Error | Size | Source | Message |
|---|---|---|---|---|---:|---|---|
| acm | paywalled | research-acm | GREEN |  | 8226058 | initial | Literature PDF downloaded |
| acs | paywalled | research-acs | GREEN |  | 3009741 | initial | Literature PDF downloaded |
| aiaa | paywalled | research-aiaa | GREEN |  | 24753508 | retry | Literature PDF downloaded |
| aip | paywalled | research-aip | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry | AIP Publishing Scitation PDF download did not complete within 60s after CDP click |
| aps | paywalled | research-aps | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry | APS Journals browser-session PDF download failed: page.goto: Timeout 60000ms exceeded.<br>Call log:<br>  - navigating to "https://journals.aps.org/prl/pdf/10.1103/PhysRevLett.132.053401", waiting until "domcontentloaded" |
| arxiv | oa |  | GREEN |  | 2475990 | initial | Literature PDF downloaded |
| asce | paywalled | research-asce | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry | ASCE Library PDF download did not complete within 60s after CDP click |
| asme | paywalled | research-asme | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry | ASME Digital Collection PDF/download link was not found and no direct PDF download started |
| cambridge | paywalled | research-cambridge | GREEN |  | 125398 | initial | Literature PDF downloaded |
| cellpress | paywalled | research-cellpress | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | initial | Cell Press browser-session PDF download failed: page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.cell.com/cell-reports/pdf/S2211-1247(24)00001-6.pdf<br>Call log:<br>  - navigating to "https://www.cell.com/cell-repor |
| crc | paywalled | research-crc | GREEN |  | 576762 | retry | Literature PDF downloaded |
| dblp | invalid_args_expected |  | INVALID_ARGS_EXPECTED | INVALID_ARGS |  | initial | dblp is bibliographic-only; use the resolved arXiv/DOI URL from research_dblp_get_metadata to call the appropriate publisher driver (e.g. webai_arxiv_download_pdf, webai_acm_download_pdf, ...) |
| degruyter | paywalled | research-degruyter | GREEN |  | 2204452 | initial | Literature PDF downloaded |
| emerald | paywalled | research-emerald | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| frontiers | oa |  | GREEN |  | 512141 | initial | Literature PDF downloaded |
| ieee | paywalled | research-ieee | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry | IEEE Xplore PDF/download link was not found and no direct PDF download started |
| iest | paywalled | research-iest | GREEN |  | 1203454 | initial | Literature PDF downloaded |
| iet | paywalled | research-iet | GREEN |  | 3733786 | retry | Literature PDF downloaded |
| incopat | paywalled | research-incopat | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| inspirehep | oa |  | GREEN |  | 1386119 | initial | Literature PDF downloaded |
| iop | paywalled | research-iop | GREEN |  | 648735 | retry | Literature PDF downloaded |
| mdpi | oa |  | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | mdpi download did not produce a PDF artifact |
| nature | paywalled | research-nature | GREEN |  | 12092510 | retry | Literature PDF downloaded |
| optica | paywalled | research-optica | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| opticsjournal | paywalled | research-opticsjournal | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| proquest | paywalled | research-proquest | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| pubscholar | oa |  | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | initial | PubScholar PDF link was not found in article page |
| royalsoc | paywalled | research-royalsoc | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry | Royal Society Publishing PDF/download link was not found and no direct PDF download started |
| rsc | paywalled | research-rsc | GREEN |  | 752735 | initial | Literature PDF downloaded |
| sae | paywalled | research-sae | URL_RESOLVE_FAIL | ARTIFACT_VERIFICATION_FAILED |  | initial | Paywalled literature download did not produce a PDF artifact |
| scielo | oa |  | GREEN |  | 496587 | retry | Literature PDF downloaded |
| sciencedirect | paywalled | research-sciencedirect | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | retry | ScienceDirect PDF/download link was not found and no direct PDF download started |
| scoap3 | oa |  | GREEN |  | 3074730 | initial | Literature PDF downloaded |
| siam | paywalled | research-siam | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry | SIAM Publications PDF download did not complete within 60s after CDP click |
| springer | paywalled | research-springer | GREEN |  | 1601651 | initial | Literature PDF downloaded |
| tandf | paywalled | research-tandf | GREEN |  | 576762 | retry | Literature PDF downloaded |
| wanfang | paywalled | research-wanfang | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | retry | Wanfang Data PDF download did not complete within 60s after CDP click |
| wiley | paywalled | research-wiley | GREEN |  | 7040069 | retry | Literature PDF downloaded |
| worldsci | paywalled | research-worldsci | GREEN |  | 360284 | retry | Literature PDF downloaded |
| wos | invalid_args_expected | research-wos | INVALID_ARGS_EXPECTED | INVALID_ARGS |  | initial | wos is bibliographic/metadata-only; use the resolved DOI URL from research_wos_get_metadata to call the appropriate publisher driver (e.g. webai_acm_download_pdf, webai_wiley_download_pdf, ...) |

## GREEN real DBs


- acm: 8226058 bytes, sha256 a0e1ed23bd8f4ef600bed2d9308e96dc63d469ae5d0d1d64eea897fd57c94c6a
- acs: 3009741 bytes, sha256 d51d37e5eff41e698e4d352ab4c811a9d5f7387cf09f49638c620626c01c3c97
- aiaa: 24753508 bytes, sha256 1e6ac24948f7e0b1a91f939d0968c9d34b430a5a1a2e078d4f9542bedea4d3d8
- arxiv: 2475990 bytes, sha256 f8bbf0e9d979b7a8ce7be65119266545a229a85b57e077d8bd048e458bb642da
- cambridge: 125398 bytes, sha256 b5757c3f3976d14478343443e80c5e73748eb3c1015003377cfd0b524b7f1c3e
- crc: 576762 bytes, sha256 520963ac9db4ecddb0ac4c15eb0c933289f6577d6e351f52f8862ca23ba4fc12
- degruyter: 2204452 bytes, sha256 699380d2344261983fe2f57fbb901a705f8064a61f34448a404e9bc7562b0877
- frontiers: 512141 bytes, sha256 1417c6632c2fa60cef37339209702e9f92818ec23440cb789a6c5da62bfb7fba
- iest: 1203454 bytes, sha256 ac337745321df2d114d1d01299f657efcff83a366d5ea0aed658b685d3d92a48
- iet: 3733786 bytes, sha256 50999247441388b8f150654c596a9971c506f1aeba15a398e976d660af0edbdd
- inspirehep: 1386119 bytes, sha256 f474f405e12d6aabaac7628e917e180a26d6e1ecd6be4b7c6a28a5dbce91c91f
- iop: 648735 bytes, sha256 ccd7d40da9dcec975844d108f8444a0868f32b8e97f9e2d2478b79fe342a0ab7
- nature: 12092510 bytes, sha256 783bb4ab0b0047822293ce4d829338fff5ed5be0f85000b41c3269642cb9edf9
- rsc: 752735 bytes, sha256 3f135d11474cda3844a2e438dc197706fc21da289cfc9f9abf3d89ca3bddfb50
- scielo: 496587 bytes, sha256 1539208ce836eef58af8407012892cd2ec640b138b07206d0e049e24a533339c
- scoap3: 3074730 bytes, sha256 8590c5d25c3e59eea186ceca0cb96adae338b4d4ef30e87832b0d2d8ea0d688a
- springer: 1601651 bytes, sha256 e107f7be5d074b611eb4577e93b1be49a27d453da0003c8c9dd885f448c68d56
- tandf: 576762 bytes, sha256 35b6ec7d58afb216aa2ee39ec7b016afda626f9934caa80318367ef2c011d7fd
- wiley: 7040069 bytes, sha256 32a1396e126e00e54f36a6e0db2dc86b489008cbd15759137d01a0777a55a336
- worldsci: 360284 bytes, sha256 08f77b41c9b4dafeaf01b4aa6daadd095c962dfe91ae0ccb3faf275a59c8f41c

## Permanent-deferred candidates

- aip: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — AIP Publishing Scitation PDF download did not complete within 60s after CDP click
- aps: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — APS Journals browser-session PDF download failed: page.goto: Timeout 60000ms exceeded.<br>Call log:<br>  - navigating to "https://journals.aps.org/prl/pdf/10.1103/PhysRevLett.132.053401", waiting until "domcontentloaded"
- asce: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — ASCE Library PDF download did not complete within 60s after CDP click
- asme: SELECTOR_DRIFT (ELEMENT_NOT_FOUND) — ASME Digital Collection PDF/download link was not found and no direct PDF download started
- cellpress: URL_RESOLVE_FAIL (ARTIFACT_DOWNLOAD_TIMEOUT) — Cell Press browser-session PDF download failed: page.goto: net::ERR_TOO_MANY_REDIRECTS at https://www.cell.com/cell-reports/pdf/S2211-1247(24)00001-6.pdf<br>Call log:<br>  - navigating to "https://www.cell.com/cell-repor
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
