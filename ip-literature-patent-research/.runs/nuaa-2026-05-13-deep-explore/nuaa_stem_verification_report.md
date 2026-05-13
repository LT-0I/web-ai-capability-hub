# NUAA STEM Verification Report

captured_at: 2026-05-13T11:29:52.556398+00:00

## Scope reconciliation
- Live navigation resources enumerated: 159
- STEM resources in live/reconciled inventory: 109
- Prior `scitech_resources.json` STEM count: 109
- Prior STEM titles not matched exactly in live navigation: 1 (institution直升机特色数据库)
- Live STEM titles not in prior STEM set: 1 (南航直升机特色数据库)

## Access classification breakdown
- auto_ip_ok: 11
- ip_login_button_ok: 11
- proxy_error: 2
- requires_account: 1
- unknown: 10
- unreachable: 74

## Feature-test breakdown
- cli_insufficient: 50
- error: 608
- observed_only: 203
- partial: 3
- requires_account: 8

## Drift vs 2026-05-04 probe
The 2026-05-04 note covered selected paid STEM sites only. This run found the live navigation contains 159 resources and preserved the same broad behavior for selected registered sites where bounded snapshots were attempted: ScienceDirect/ACM/AIAA reachable enough for DOM evidence; ASME/ASCE/AIP/ACS presented unknown or challenge-like page states under headless automation. CNKI/Wanfang/WoS/Scopus were not deep-smoked in this bounded partial run.

## Limits
This is a partial deep exploration. Export clicks, full-text/PDF checks, exhaustive advanced fields/operators/facets, alerts, and API/OpenURL exercise were not completed across every reachable resource. No bulk downloads were attempted.
