# New Resource Advanced Automation Runbook

Generated: 2026-05-04

This note records the current "advanced-search form fill + multi-round filter + official-export-first" workflow for newly discovered paid STEM resources from the online navigation page. It intentionally excludes private navigation URLs, institution names, account ids, raw IPs, and session tokens.

## Entry Point

Use:

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\new_resource_advanced_runner.py list-sites

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\new_resource_advanced_runner.py plan `
  --group uav `
  --query "UAV reinforcement learning trajectory planning" `
  --filters "2021-2026;Article;Engineering" `
  --out .\hba-agent-skills\.tmp\new_resource_advanced_plan_uav.json

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\new_resource_advanced_runner.py run `
  --group uav `
  --query "UAV reinforcement learning trajectory planning" `
  --strategy recall `
  --filters "2021-2026;Article;Engineering" `
  --out-dir .\hba-agent-skills\.tmp\new_resource_advanced_uav_batch `
  --profile-dir .\hba-agent-skills\.tmp\paid-stem-cdp-user-profile `
  --cdp-endpoint http://127.0.0.1:9333
```

Do not use headless mode for paid resources. Do not pass `--click-export` until the current page state has been reviewed. Full-text/PDF/bulk-download controls are blocked by default.

## Profile Source

Profiles live in:

`references/new_resource_advanced_profiles.json`

Current groups:

- `rl-ai`: ProQuest/CSA, Annual Reviews, CRC/Taylor eBooks, Cambridge Core journals/books, SAGE, SIAM; EBSCO is a manual-checkpoint profile.
- `uav`: ProQuest/CSA, CRC/Taylor eBooks, RTCA, military-standard/report resources, Wanfang industry, Woodhead; Yi Patent and AHS are manual-checkpoint profiles.
- `publisher`, `engineering-books`, `aviation-standards`, `technology-reports`, `patent`, `materials`, `review`, `math-optimization`: secondary routing groups for narrower runs.

Manual-checkpoint profiles are skipped in group runs unless the operator intentionally passes both inclusion flags and handles the visible login/security step.

## Live Smoke Matrix

Commands were run through a dedicated visible Chrome CDP endpoint on port 9333 with the persistent paid-resource profile.

### UAV Batch

Query: `UAV reinforcement learning trajectory planning`

Output directory:

`C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\new_resource_advanced_uav_batch`

| Site | Status | Result Count | Records | Safe Export Candidates | Blocked Candidates |
|---|---:|---:|---:|---:|---:|
| ProQuest/CSA | searched_or_reachable | 346 | 40 | 16 | 13 |
| CRC/Taylor eBooks | searched_or_reachable | 223627 | 10 | 7 | 27 |
| RTCA | searched_or_reachable | unknown | 4 | 2 | 7 |
| Foreign Military Standards | searched_or_reachable | unknown | 8 | 3 | 4 |
| National Military Standards | searched_or_reachable | unknown | 8 | 3 | 4 |
| Special Documents | searched_or_reachable | 0 | 8 | 3 | 3 |
| Shangwei Reports | searched_or_reachable | 0 | 8 | 3 | 3 |
| Wanfang Industry | searched_or_reachable | unknown | 3 | 3 | 7 |
| Woodhead | searched_or_reachable | unknown | 0 | 3 | 9 |

Merged rows: 133. Record-quality check: zero navigation/full-text/PDF records in `records`.

### RL/AI Batch

Query: `reinforcement learning UAV path planning`

Output directory:

`C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\new_resource_advanced_rl_batch`

| Site | Status | Result Count | Records | Safe Export Candidates | Blocked Candidates |
|---|---:|---:|---:|---:|---:|
| ProQuest/CSA | searched_or_reachable | 476 | 40 | 12 | 13 |
| Annual Reviews | searched_or_reachable | unknown | 14 | 37 | 109 |
| CRC/Taylor eBooks | searched_or_reachable | 223627 | 10 | 6 | 26 |
| Cambridge Core Journals | searched_or_reachable | unknown | 0 | 3 | 11 |
| Cambridge Core eBooks | searched_or_reachable | unknown | 0 | 3 | 11 |
| SAGE | site_run_error | unknown | 0 | 0 | 0 |
| SIAM | searched_or_reachable | unknown | 3 | 12 | 96 |

Merged rows: 143. Record-quality check: zero navigation/full-text/PDF records in `records`.

SAGE note: the original mirror profile returned 404. The profile was corrected to SAGE Journals official search, but the current network/CDP run hit `ERR_CONNECTION_RESET`; keep it as a reachable-profile-but-currently-blocked site until a later navigation-page refresh or manual checkpoint proves a better entry.

### Single-Site Checks

- SAGE official profile: `site_run_error`, browser navigation reported `ERR_CONNECTION_RESET`.
- Emerald: `searched_or_reachable`, 12 records / 4 safe export candidates / 14 blocked candidates, but page title was `Not Found | Emerald Publishing`; treat as a DOM-calibration target rather than a finished adapter.
- ProQuest/CSA quality smoke: 40 candidate records, zero bad records, with PDF/full-text links excluded from `records`.

## Safety Checks

After runs, scan artifacts for private institution strings and raw session values. The private string patterns are intentionally built by concatenation so this runbook does not itself contain the full strings.

```powershell
$root = ".\hba-agent-skills"
$patterns = @(
  "nu" + "aa",
  "南京" + "航空航天",
  "Nanjing " + "University of Aeronautics",
  "Aeronautics " + "& Astronautics",
  "Aeronautics " + "&amp; Astronautics",
  "Nanjing " + "Univ",
  "Nanjing " + "University of Aeronau",
  "authRequest",
  "requestIdentifier",
  "redirect_uri",
  "accountid=[0-9]",
  "_csrf=[0-9a-fA-F-]",
  "t:ac=[A-Za-z0-9]",
  '"accountId":"[0-9]',
  '"departmentId":"[0-9]',
  '"webUserId":"[0-9]',
  '"searchToken":"[^"]',
  '"ip":"[0-9]',
  "58\.216\."
)
Get-ChildItem -Path "$root\.tmp" -Recurse -File |
  Where-Object { $_.FullName -match "new_resource_advanced" } |
  Select-String -Pattern $patterns
```

Expected result after current fixes: no hits.

Also check record quality after batch runs:

```powershell
node -e "const fs=require('fs'); for (const p of ['.\\hba-agent-skills\\.tmp\\new_resource_advanced_uav_batch\\advanced_run.json','.\\hba-agent-skills\\.tmp\\new_resource_advanced_rl_batch\\advanced_run.json']) { const j=JSON.parse(fs.readFileSync(p,'utf8')); const bad=[]; for (const s of j.sites) for (const r of (s.records||[])) { const hay=((r.text||'')+' '+(r.href||'')).toLowerCase(); if (/full\\s*text|fulltextpdf|honeypot|basic search|recent searches|selected items|shopping cart|access via your institution/.test(hay)) bad.push({site:s.site_id,text:r.text}); } console.log(p, bad.length); }"
```

Expected result: both batches print `0`.

## Update Flow

When a site changes:

1. Run the site through `new_resource_advanced_runner.py run --sites <id>` with `--manual-wait-seconds 0` first.
2. If the page is `unknown_page_state`, `site_run_error`, or has zero search inputs, inspect the evidence HTML/text/interactive DOM.
3. Update only that site's profile in `new_resource_advanced_profiles.json`.
4. Re-run `new_resource_advanced_runner.py plan --sites <id>`.
5. Re-run the single-site smoke.
6. Run unit tests and the privacy scan before using the updated profile in a batch.

