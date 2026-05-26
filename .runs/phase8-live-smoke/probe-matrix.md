# Phase 8 LIVE SMOKE probe matrix

Generated: 2026-05-26T07:12:39.721Z
Output root: `/tmp/phase8-live-smoke-2026-05-25`
Contract discovery: prompt expected 42 invocations, but current shipped contract exposes 40 download-pdf CLI surfaces total (38 real listed + 2 pseudo).
Artifact check: GREEN requires `ok=true`, file written, and `%PDF-` magic bytes. Non-PDF success artifacts are downgraded to URL_RESOLVE_FAIL for follow-up.

| DB | fixture | exit | duration_ms | errorCode | message-head | classification |
|---|---|---:|---:|---|---|---|
| acm | `10.1000/test-probe` | 1 | 246 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-acm-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| acs | `10.1000/test-probe` | 1 | 252 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-acs-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| aiaa | `10.1000/test-probe` | 1 | 244 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-aiaa-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| aip | `10.1000/test-probe` | 1 | 245 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-aip-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| aps | `10.1000/test-probe` | 1 | 254 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-aps-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| arxiv | `2401.04088` | 0 | 1337 | null (PASS) | Literature PDF downloaded (2401.04088.pdf 2475990 bytes) | GREEN |
| asce | `10.1000/test-probe` | 1 | 250 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-asce-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| asme | `10.1000/test-probe` | 1 | 242 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-asme-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| cambridge | `10.1000/test-probe` | 1 | 169 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-cambridge-phase8-live-smoke-missing" is not registered or initialized;  | NO_AUTH |
| cellpress | `10.1000/test-probe` | 1 | 156 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-cellpress-phase8-live-smoke-missing" is not registered or initialized;  | NO_AUTH |
| crc | `10.1000/test-probe` | 1 | 150 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-crc-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| dblp | `test-probe-2026-05-25` | 1 | 150 | INVALID_ARGS | dblp is bibliographic-only; use the resolved arXiv/DOI URL from research_dblp_get_metadata to call the appropriate publi | INVALID_ARGS_EXPECTED |
| degruyter | `10.1000/test-probe` | 1 | 157 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-degruyter-phase8-live-smoke-missing" is not registered or initialized;  | NO_AUTH |
| emerald | `10.1000/test-probe` | 1 | 153 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-emerald-phase8-live-smoke-missing" is not registered or initialized; re | NO_AUTH |
| frontiers | `articles/10.3389/fphys.2024.001/full` | 1 | 1539 | ARTIFACT_DOWNLOAD_TIMEOUT | frontiers PDF fetch returned HTTP 404 | TIMEOUT |
| ieee | `10.1000/test-probe` | 1 | 145 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-ieee-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| iest | `10.1000/test-probe` | 1 | 144 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-iest-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| iet | `10.1000/test-probe` | 1 | 146 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-iet-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| incopat | `10.1000/test-probe` | 1 | 148 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-incopat-phase8-live-smoke-missing" is not registered or initialized; re | NO_AUTH |
| inspirehep | `1234567` | 0 | 23972 | null (PASS) | Literature PDF downloaded (1234567.pdf 1386119 bytes) | GREEN |
| iop | `10.1000/test-probe` | 1 | 142 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-iop-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| mdpi | `2076-3417/15/1/2` | 0 | 1445 | null | Tool returned ok but saved non-PDF artifact at /tmp/phase8-live-smoke-2026-05-25/mdpi/2076-3417-15-1-2.pdf | URL_RESOLVE_FAIL |
| nature | `10.1000/test-probe` | 1 | 151 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-nature-phase8-live-smoke-missing" is not registered or initialized; ref | NO_AUTH |
| optica | `10.1000/test-probe` | 1 | 152 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-optica-phase8-live-smoke-missing" is not registered or initialized; ref | NO_AUTH |
| opticsjournal | `10.1000/test-probe` | 1 | 152 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-opticsjournal-phase8-live-smoke-missing" is not registered or initializ | NO_AUTH |
| proquest | `10.1000/test-probe` | 1 | 160 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-proquest-phase8-live-smoke-missing" is not registered or initialized; r | NO_AUTH |
| pubscholar | `test-probe-2026-05-25` | 1 | 413 | ELEMENT_NOT_FOUND | PubScholar PDF link was not found in article page | URL_RESOLVE_FAIL |
| royalsoc | `10.1000/test-probe` | 1 | 155 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-royalsoc-phase8-live-smoke-missing" is not registered or initialized; r | NO_AUTH |
| rsc | `10.1000/test-probe` | 1 | 148 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-rsc-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| sae | `10.1000/test-probe` | 1 | 152 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-sae-phase8-live-smoke-missing" is not registered or initialized; refusi | NO_AUTH |
| scielo | `test-probe-2026-05-25` | 1 | 148 | ELEMENT_NOT_FOUND | SciELO doc_id must include both journal and article PID (for example csp/abc123) | URL_RESOLVE_FAIL |
| sciencedirect | `10.1000/test-probe` | 1 | 150 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-sciencedirect-phase8-live-smoke-missing" is not registered or initializ | NO_AUTH |
| scoap3 | `74531` | 1 | 2494 | ELEMENT_NOT_FOUND | SCOAP3 record did not contain files[0].url | URL_RESOLVE_FAIL |
| siam | `10.1000/test-probe` | 1 | 153 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-siam-phase8-live-smoke-missing" is not registered or initialized; refus | NO_AUTH |
| springer | `10.1000/test-probe` | 1 | 147 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-springer-phase8-live-smoke-missing" is not registered or initialized; r | NO_AUTH |
| tandf | `10.1000/test-probe` | 1 | 148 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-tandf-phase8-live-smoke-missing" is not registered or initialized; refu | NO_AUTH |
| wanfang | `10.1000/test-probe` | 1 | 149 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-wanfang-phase8-live-smoke-missing" is not registered or initialized; re | NO_AUTH |
| wiley | `10.1000/test-probe` | 1 | 147 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-wiley-phase8-live-smoke-missing" is not registered or initialized; refu | NO_AUTH |
| worldsci | `10.1000/test-probe` | 1 | 147 | PROFILE_NOT_FOUND | Authenticated research browser profile "research-worldsci-phase8-live-smoke-missing" is not registered or initialized; r | NO_AUTH |
| wos | `test-probe-2026-05-25` | 1 | 149 | INVALID_ARGS | wos is bibliographic/metadata-only; use the resolved DOI URL from research_wos_get_metadata to call the appropriate publ | INVALID_ARGS_EXPECTED |

## Summary counts

- GREEN: 2
- NO_AUTH: 31
- SELECTOR_DRIFT: 0
- URL_RESOLVE_FAIL: 4
- TIMEOUT: 1
- INVALID_ARGS_EXPECTED: 2
- CRASH: 0
- Actual invocations run: 40
- Prompt-requested invocations: 42 (not present in current contract; see contract discovery note)

## Contract discovery note

Current shipped contract exposes 40 download-pdf CLI surfaces total: 38 real DBs plus dblp/wos bibliographic INVALID_ARGS pseudo-drivers. No 42nd download-pdf command exists in dist/src/cli.js, configs/consumer-contract.json, or docs/MIGRATION_v2.1.md.
