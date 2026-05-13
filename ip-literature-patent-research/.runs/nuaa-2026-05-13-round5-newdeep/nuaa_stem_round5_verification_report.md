# NUAA STEM Round 5 Verification Report

- Captured: 2026-05-13T15:44:48.955238+00:00
- CDP endpoint: http://127.0.0.1:9336
- Per-DB target: >=3 tested_ok where access policy permits

| resource | tested_ok | partial | not_applicable | requires_account | blocked | gate |
|---|---:|---:|---:|---:|---:|---|
| arxiv | 6 | 1 | 1 | 0 | 0 | pass |
| proquest-csa | 3 | 3 | 2 | 0 | 0 | pass |
| national-military-standards | 0 | 0 | 7 | 0 | 1 | access/DNS-blocked |
| scoap3 | 6 | 0 | 2 | 0 | 0 | pass |

## Adapter / registry changes
- site_registry.json: registered arxiv, proquest-csa, national-military-standards, scoap3 because absent from registry
- scripts/site_adapters/{arxiv,proquest_csa,national_military_standards,scoap3}_search.py: minimal wrappers because absent

## Aggregate file sizes
- `ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/nuaa_stem_round5_feature_tests.json`: 9133 bytes
- `ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/nuaa_stem_round5_deep_catalog.json`: 481888 bytes
- `ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/nuaa_stem_round5_summary.md`: 1378 bytes
- `ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/nuaa_stem_round5_verification_report.md`: 1626 bytes
- `ip-literature-patent-research/.runs/nuaa-2026-05-13-round5-newdeep/progress.md`: 1693 bytes
