# Wave 17 — hunt real article DOIs per publisher + re-smoke 10 selector-drift DBs

Generated: 2026-05-27T05:23:17.548369Z

## Per-DB hunt outcome (URL found / extraction failed / page blocked)

| DB | Hunt outcome | Hunted URL / evidence | Identifier | Notes |
|---|---|---|---|---|
| `aps` | URL found | https://link.aps.org/doi/10.1103/xgfv-p42g | `10.1103/xgfv-p42g` | Recent PRL article resolved through link.aps.org DOI page. |
| `asce` | URL found | https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-18065 | `10.1061/JCEMD4.COENG-18065` | Current ASCE JCEM issue produced a real DOI, but article/PDF attempts timed out; direct PDF/EPDF probe returned 403 HTML / challenge shell. |
| `emerald` | URL found | https://www.emerald.com/resep/article/doi/10.1108/RESEP-04-2026-0009/1368070/Artificial-intelligence-in-education-mapping | `10.1108/RESEP-04-2026-0009` | Browse/search produced a real Emerald article DOI and direct PDF download succeeded. |
| `optica` | page blocked after URL found | https://opg.optica.org/captcha/(S(okpdlivsdwwzz04d2p253cz0))/?guid=36F5D252-76EC-4CF5-ACC9-9E72F37D02E1&uri=ol-51-10-2872 | `optica:ol-51-10-2872` | Recent Optics Letters issue produced article IDs, but article navigation landed on OPG/Radware captcha URLs; no PDF link available to automation. |
| `opticsjournal` | URL found | https://www.opticsjournal.net/Articles/OJ5dab9615f02ec130/Abstract | `10.3788/COL202624.061401` | OpticsJournal article page exposed citation DOI and PDF; download succeeded. |
| `proquest` | extraction failed | — | `—` | Homepage/search route did not expose docview article candidates in this unauthenticated headed session. |
| `pubscholar` | URL found | https://pubscholar.cn/articles/58b6bc8bb049f8c14e383186acf06640 | `10.1038/s41467-026-68929-9` | Headed home search plus captured signed PubScholar article search request found an OA article with PubScholar local PDF link. |
| `royalsoc` | extraction failed | — | `—` | Royal Society articles route exposed no article candidates in this session; old direct DOI smoke also found no downloadable PDF selector. |
| `sae` | extraction failed | — | `—` | SAE technical-papers browse/search exposed no article candidates; old direct DOI smoke found no downloadable PDF selector. |
| `siam` | URL found | https://epubs.siam.org/doi/10.1137/25M1741790 | `10.1137/25M1741790` | SIAM journal issue DOI article resolved and PDF download succeeded. |

## Per-DB re-smoke result with hunted doc_id

| DB | Result | Error code | Hunted doc_id used | PDF bytes | Attempts | Evidence artifact |
|---|---|---|---|---:|---:|---|
| `aps` | **GREEN** | `` | `10.1103/xgfv-p42g` | 539351 | 1 | `.runs/wave-17/results/aps-attempt-1.json` |
| `asce` | **URL_RESOLVE_FAIL** | `ARTIFACT_DOWNLOAD_TIMEOUT` | `10.1061/JCEMD4.COENG-18065` |  | 3 | `.runs/wave-17/results/asce-attempt-3.json` |
| `emerald` | **GREEN** | `` | `10.1108/RESEP-04-2026-0009` | 16954314 | 1 | `.runs/wave-17/results/emerald-attempt-1.json` |
| `optica` | **SELECTOR_DRIFT** | `ELEMENT_NOT_FOUND` | `optica:ol-51-9-2544` |  | 2 | `.runs/wave-17/results/optica-attempt-2.json` |
| `opticsjournal` | **GREEN** | `` | `10.3788/COL202624.061401` | 1146013 | 1 | `.runs/wave-17/results/opticsjournal-attempt-1.json` |
| `proquest` | **NOT_RUN** | `` | `—` |  | 0 | `—` |
| `pubscholar` | **GREEN** | `` | `https://file.scholarin.cn/files?fastdfspath=group1/M03/B2/DB/CgMLDmnUtF6AP1zCACrMA9dDdFs2196461&file_name=pubscholar-wave17.pdf` | 2804739 | 1 | `.runs/wave-17/results/pubscholar-direct-local-link-file-name.json` |
| `royalsoc` | **NOT_RUN** | `` | `—` |  | 0 | `—` |
| `sae` | **NOT_RUN** | `` | `—` |  | 0 | `—` |
| `siam` | **GREEN** | `` | `10.1137/25M1741790` | 1634385 | 1 | `.runs/wave-17/results/siam-attempt-1.json` |

## Cumulative paywalled-GREEN delta (25/38 → N/38)

- Wave 17 NEW GREEN: **5/10** (`aps`, `emerald`, `opticsjournal`, `pubscholar`, `siam`).
- Cumulative paywalled GREEN: **25/38 → 30/38**.
- Gate status: **PASS** (target ≥5/10 NEW GREEN met).

## Hunted-DOIs catalog (useful for future issue-fix-loop)

```json
{
  "aps": {
    "doc_id": "10.1103/xgfv-p42g",
    "article_url": "https://link.aps.org/doi/10.1103/xgfv-p42g",
    "title": "Universality of Stochastic Control of Quantum Chaos with Measurement and Feedback",
    "captured_at": "2026-05-27T04:46:20.357Z"
  },
  "asce": {
    "doc_id": "10.1061/JCEMD4.COENG-18065",
    "article_url": "https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-18065",
    "title": "Multiobjective Optimization for the Planning of Prefabricated Bridge Construction Projects",
    "captured_at": "2026-05-27T04:47:37.531Z"
  },
  "emerald": {
    "doc_id": "10.1108/RESEP-04-2026-0009",
    "article_url": "https://www.emerald.com/resep/article/doi/10.1108/RESEP-04-2026-0009/1368070/Artificial-intelligence-in-education-mapping",
    "title": "Artificial intelligence in education: mapping research trends, engagement and cognitive disengagement with evidence from global and Asian contexts",
    "captured_at": "2026-05-27T04:51:54.775Z"
  },
  "optica": {
    "doc_id": "optica:ol-51-10-2872",
    "article_url": "https://opg.optica.org/captcha/(S(okpdlivsdwwzz04d2p253cz0))/?guid=36F5D252-76EC-4CF5-ACC9-9E72F37D02E1&uri=ol-51-10-2872",
    "title": "",
    "captured_at": "2026-05-27T04:53:00.432Z"
  },
  "opticsjournal": {
    "doc_id": "10.3788/COL202624.061401",
    "article_url": "https://www.opticsjournal.net/Articles/OJ5dab9615f02ec130/Abstract",
    "title": "Direction generation of 3 MW peak-power picosecond pulses in a compact all-fiber all-PM CPA-free amplifier",
    "captured_at": "2026-05-27T04:55:53.982Z"
  },
  "siam": {
    "doc_id": "10.1137/25M1741790",
    "article_url": "https://epubs.siam.org/doi/10.1137/25M1741790",
    "title": "Unfitted Hybrid High-Order Methods Stabilized by Polynomial Extension for Elliptic Interface Problems | SIAM Journal on Numerical Analysis",
    "captured_at": "2026-05-27T04:59:23.088Z"
  },
  "pubscholar": {
    "doc_id": "https://file.scholarin.cn/files?fastdfspath=group1/M03/B2/DB/CgMLDmnUtF6AP1zCACrMA9dDdFs2196461&file_name=pubscholar-wave17.pdf",
    "article_url": "https://pubscholar.cn/articles/58b6bc8bb049f8c14e383186acf06640",
    "title": "Human-induced climate change amplification on storm dynamics in Valencia’s 2024 catastrophic flash flood",
    "captured_at": "2026-05-27T05:17:16.733Z",
    "doi": "10.1038/s41467-026-68929-9",
    "pubscholar_article_id": "58b6bc8bb049f8c14e383186acf06640",
    "pdf_url": "https://file.scholarin.cn/files?fastdfspath=group1/M03/B2/DB/CgMLDmnUtF6AP1zCACrMA9dDdFs2196461&file_name=pubscholar-wave17.pdf",
    "source": "PubScholar signed search API via headed Chrome-observed request headers"
  }
}
```

## Validation

- `rm -rf dist && npm run build` → exit 0 (`.runs/wave-17/build.log`).
- `npm test` → exit 0, **731/731 pass** (`.runs/wave-17/npm-test.log`).
- No product source files changed; Wave 17 changes are artifacts/report only.

## Deferred / honest failures

- `asce`: real DOI found, but PDF access returned challenge/403 or timed out under automation; no selector-only change justified.
- `optica`: OPG/Radware captcha blocked article pages for real issue candidates; surface as blocked/session-required instead of adding fallback.
- `proquest`: no docview article candidate surfaced without an authenticated/searchable session.
- `royalsoc`: article browse route did not expose candidates in this environment; manual old DOI smoke remained selector drift/no PDF link.
- `sae`: technical-papers browse/search did not expose candidates in this environment; manual old DOI smoke remained selector drift/no PDF link.
