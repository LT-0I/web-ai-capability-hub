# Wave 17 hunt real DOIs + re-smoke

Generated: 2026-05-27T05:17:16.733Z
Wave 17 NEW GREEN: 5/10
Cumulative paywalled-GREEN delta: 25/38 → 30/38

## Per-DB hunt outcome

| DB | Outcome | Doc ID | Article URL | Title |
|---|---|---|---|---|
| aps | URL found | 10.1103/xgfv-p42g | https://link.aps.org/doi/10.1103/xgfv-p42g | Universality of Stochastic Control of Quantum Chaos with Measurement and Feedback |
| asce | URL found | 10.1061/JCEMD4.COENG-18065 | https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-18065 | Multiobjective Optimization for the Planning of Prefabricated Bridge Construction Projects |
| emerald | URL found | 10.1108/RESEP-04-2026-0009 | https://www.emerald.com/resep/article/doi/10.1108/RESEP-04-2026-0009/1368070/Artificial-intelligence-in-education-mapping | Artificial intelligence in education: mapping research trends, engagement and cognitive disengagement with evidence from |
| optica | URL found | optica:ol-51-10-2872 | https://opg.optica.org/captcha/(S(okpdlivsdwwzz04d2p253cz0))/?guid=36F5D252-76EC-4CF5-ACC9-9E72F37D02E1&uri=ol-51-10-2872 |  |
| opticsjournal | URL found | 10.3788/COL202624.061401 | https://www.opticsjournal.net/Articles/OJ5dab9615f02ec130/Abstract | Direction generation of 3 MW peak-power picosecond pulses in a compact all-fiber all-PM CPA-free amplifier |
| proquest | extraction failed: No article candidates found |  |  |  |
| pubscholar | URL found | https://file.scholarin.cn/files?fastdfspath=group1/M03/B2/DB/CgMLDmnUtF6AP1zCACrMA9dDdFs2196461&file_name=pubscholar-wave17.pdf | https://pubscholar.cn/articles/58b6bc8bb049f8c14e383186acf06640 | Human-induced climate change amplification on storm dynamics in Valencia’s 2024 catastrophic flash flood |
| royalsoc | extraction failed: No article candidates found |  |  |  |
| sae | extraction failed: No article candidates found |  |  |  |
| siam | URL found | 10.1137/25M1741790 | https://epubs.siam.org/doi/10.1137/25M1741790 | Unfitted Hybrid High-Order Methods Stabilized by Polynomial Extension for Elliptic Interface Problems \| SIAM Journal on |

## Per-DB re-smoke result with hunted doc_id

| DB | Result | Error | Size | Attempts | Hunted doc_id | Message |
|---|---|---|---:|---:|---|---|
| aps | GREEN |  | 539351 | 1 | 10.1103/xgfv-p42g | Literature PDF downloaded |
| asce | URL_RESOLVE_FAIL | ARTIFACT_DOWNLOAD_TIMEOUT |  | 3 | 10.1061/JCEMD4.COENG-18065 | ASCE Library PDF download did not complete within 60s after CDP click |
| emerald | GREEN |  | 16954314 | 1 | 10.1108/RESEP-04-2026-0009 | Literature PDF downloaded |
| optica | SELECTOR_DRIFT | ELEMENT_NOT_FOUND |  | 2 | optica:ol-51-9-2544 | Optica Publishing Group PDF/download link was not found and no direct PDF download started |
| opticsjournal | GREEN |  | 1146013 | 1 | 10.3788/COL202624.061401 | Literature PDF downloaded |
| proquest | NOT_RUN |  |  | 0 |  | No article candidates found |
| pubscholar | GREEN |  | 2804739 | 1 | https://file.scholarin.cn/files?fastdfspath=group1/M03/B2/DB/CgMLDmnUtF6AP1zCACrMA9dDdFs2196461&file_name=pubscholar-wave17.pdf | Literature PDF downloaded |
| royalsoc | NOT_RUN |  |  | 0 |  | No article candidates found |
| sae | NOT_RUN |  |  | 0 |  | No article candidates found |
| siam | GREEN |  | 1634385 | 1 | 10.1137/25M1741790 | Literature PDF downloaded |

## Hunted-DOIs catalog

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
