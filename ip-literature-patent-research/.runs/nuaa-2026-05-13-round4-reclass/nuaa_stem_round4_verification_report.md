# NUAA STEM Round 4 Verification Report

Metadata: `{"captured_at": "2026-05-13T13:24:43.215752+00:00", "round": 4, "scope": "reclassify 10 round-1 unknowns", "parent_run": "nuaa-2026-05-13-round2-headed", "schema_version": "nuaa-stem-round4-reclass-1.0"}`

## Round-1 → Round-4 transitions

| resource_id | round-1 status | round-4 status | verification note |
|---|---|---|---|
| `aiaa-6dcbe1b3` | unknown | blocked | Persistent challenge / anti-bot or access-denied marker observed. |
| `asme-0e1b238e` | unknown | ip_login_button_ok | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| `asce-c44fb45b` | unknown | auto_ip_ok | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| `aip-cae6db23` | unknown | blocked | Persistent challenge / anti-bot or access-denied marker observed. |
| `acs-5f505783` | unknown | blocked | Persistent challenge / anti-bot or access-denied marker observed. |
| `annual-reviews-e26ad415` | unknown | ip_login_button_ok | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| `elsevier-sciencedirect-ee38095f` | unknown | duplicate_of:science-direct | Duplicate of science-direct entry already explored in round 2; smoke skipped. |
| `project-euclid-cdef7b59` | unknown | unreachable | No visible page title/body after homepage load. |
| `annals-of-mathematics-beec49f1` | unknown | auto_ip_ok | Flipped from round-1 unknown; simple search result list rendered under warm headed CDP profile. |
| `ahs-1247f19a` | unknown | blocked | Persistent challenge / anti-bot or access-denied marker observed. |

## Compliance

- Used one sequential headed CDP browser on port 9335 with the round-2 warm profile.
- No CAPTCHA bypass, anti-scraper evasion, account credential capture, or bulk full-text/PDF scraping was attempted.
- Per-resource work was capped at 180 seconds; blocked resources were stopped when persistent challenge/access-denied markers were observed.
