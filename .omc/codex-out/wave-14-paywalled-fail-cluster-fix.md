# Wave 14 — Paywalled DB FAIL cluster fix

## Per-DB probe finding (live URL template / selector)

| DB | Probe finding | Final smoke |
| --- | --- | --- |
| aip | Live session can fetch AIP `article-pdf` URL after resolving DOI/profile cookies; article fallback `https://doi.org/<doi>` retained. | GREEN |
| aps | Live article page is `https://journals.aps.org/prl/abstract/<doi>` and exposes `PDF` anchor to `/prl/pdf/<doi>`; isolated article-first fetch worked, final serial smoke hit APS session/Cloudflare drift and surfaced `ELEMENT_NOT_FOUND`. | FAIL |
| asce | DOI and direct ASCE PDF path returned 404/403/no article PDF for the catalog DOI. | FAIL |
| asme | Actual article path resolves from DOI; page exposes semantic PDF links and `/article-pdf` asset. | GREEN |
| cellpress | Correct article template is `https://www.cell.com/cell-reports/fulltext/<pii>`; PDF can be fetched through session after redirect handling. | GREEN |
| emerald | DOI and direct full/pdf URL returned 404; no live PDF anchor. | FAIL |
| ieee | Actual selector includes `a.xpl-btn-pdf` / `stats-document-lh-action-downloadPdf_2`; direct `stamp.jsp` is valid. | GREEN |
| incopat | Supplied patent ID lands on marketing/home content; visible PDF candidates are whitepapers, not patent artifacts. | FAIL |
| mdpi | `www.mdpi.com/.../pdf` can return HTML interstitial; static resource template is `https://mdpi-res.com/d_attachment/<journal>/<slug>/article_deploy/<slug>.pdf`. | GREEN |
| optica | OPG redirects to `/captcha/...` for the supplied item. | FAIL |
| opticsjournal | Supplied article URL redirects to error (`article does not exist`); no article PDF exists for the catalog item. | FAIL |
| proquest | Supplied document resolves to unavailable/docunavailable page; no fulltext PDF anchor. | FAIL |
| pubscholar | Catalog input is the `/articles` search/list page, not an article page; no PDF link. | FAIL |
| royalsoc | DOI/direct PDF path returned 404/403; no live article PDF for catalog DOI. | FAIL |
| sae | DOI returned 404 and `/download` path was HTML/non-PDF; no PDF artifact. | FAIL |
| sciencedirect | ScienceDirect article/PDF paths returned 403 bot/challenge. | FAIL |
| siam | DOI/direct PDF returned 404/no PDF artifact. | FAIL |
| wanfang | Supplied record is missing; page contains a generic Wanfang product PDF (`wfdatazs.pdf`) that is now filtered so it cannot false-pass. | FAIL |

## Per-DB driver change diff summary

- Shared paywalled driver (`paywalled.ts`): added magic-byte PDF verification, HTML-interstitial PDF-anchor following, current-page/page-candidate fetches, article URL resolvers, popup fetch after CDP click, per-driver candidate URL filters, and non-fatal navigation-timeout inspection. No new error codes.
- Shared OA driver (`arxiv.ts`): added HTML PDF-anchor following and optional authenticated browser-profile fallback for OA drivers that front PDFs with HTML.
- `aip`, `asce`, `asme`, `cellpress`, `emerald`, `ieee`, `incopat`, `optica`, `opticsjournal`, `proquest`, `royalsoc`, `sae`, `sciencedirect`, `siam`, `wanfang`: added semantic `[aria-label/title/text*=PDF]` selector candidates and live-probed article URL resolver templates.
- `aps`: added APS DOI-prefix journal map, article-first resolver, and semantic PDF selector ordering.
- `ieee`: added the current `a.xpl-btn-pdf`/`stamp.jsp` path.
- `mdpi`: added `mdpi-res.com` static resource URL resolver for the smoke DOI and browser-profile fallback.
- `wanfang`: removed generic `/pdf` selector and added a candidate URL filter to block generic site/product PDFs.

## Re-smoke matrix

Final serial smoke artifact: `.runs/wave-14/smoke-matrix.md`.

| DB | Result | Error | Notes |
| --- | --- | --- | --- |
| aip | GREEN |  | 5,084,557-byte PDF |
| aps | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Article-first resolver exists, but final serial profile session did not expose a usable PDF link. |
| asce | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT | Bad/unavailable DOI/PDF path. |
| asme | GREEN |  | 2,163,771-byte PDF |
| cellpress | GREEN |  | 3,621,870-byte PDF |
| emerald | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | DOI/PDF 404, no anchor. |
| ieee | GREEN |  | 3,377,011-byte PDF |
| incopat | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | No patent PDF; only marketing PDFs. |
| mdpi | GREEN |  | 5,878,638-byte PDF |
| optica | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Captcha wall. |
| opticsjournal | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Article does not exist. |
| proquest | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Document unavailable. |
| pubscholar | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Input is list/search page. |
| royalsoc | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | DOI/PDF unavailable. |
| sae | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | DOI 404/download HTML. |
| sciencedirect | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | 403 bot/challenge. |
| siam | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT | DOI/PDF unavailable. |
| wanfang | SELECTOR_DRIFT | ELEMENT_NOT_FOUND | Missing record; generic product PDF filtered. |

## Cumulative paywalled-GREEN delta (20/38 → N/38)

- Wave 13 baseline: 20/38 GREEN.
- Wave 14 additional final GREEN: 5/18.
- Cumulative: **25/38 GREEN**.
- Gate result: **STOP condition hit** because final re-smoke is below the requested `>=10/18` additional GREEN threshold. The verified passed fixes are still shipped per instruction to ship whatever passed.

## Permanent-deferred

- aps: intermittent APS/Cloudflare/session drift; article-first resolver was implemented, but final full serial smoke did not expose the live PDF link.
- asce: catalog DOI/PDF path unavailable (404/403); needs replacement DOI or account entitlement verification.
- emerald: catalog DOI/PDF path unavailable (404).
- incopat: current account/catalog item resolves to marketing pages, not a patent PDF.
- optica: publisher captcha challenge; no automation path without operator intervention.
- opticsjournal: catalog article ID does not exist.
- proquest: document unavailable for this account/catalog ID.
- pubscholar: catalog input is a search/list page; needs a concrete article URL/ID.
- royalsoc: DOI/PDF unavailable for catalog item.
- sae: DOI/download path unavailable or HTML-only for catalog item.
- sciencedirect: 403 bot/challenge for current network/profile.
- siam: DOI/PDF unavailable for catalog item.
- wanfang: catalog record missing; generic site PDF blocked to avoid false success.

## Validation evidence

- `rm -rf dist && npm run build` — pass.
- `npm test` — pass, 731/731 (`.runs/wave-14/npm-test-final.log`).
- Final serial 18-DB smoke — 5/18 GREEN (`.runs/wave-14/smoke-final.log`, `.runs/wave-14/smoke-matrix.md`).
- No 429/rate-limit pauses triggered; no new error code added; package/contract/golden tool files were not intentionally changed.
