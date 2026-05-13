---
name: ip-literature-patent-research
description: Use when researching papers, scholarly databases, licensed institutional IP access, CNKI/Wanfang/Web of Science/Scopus-style retrieval, Incopat patent searches, patent novelty checks, database reachability probes, or updating site profiles and search adapters.
---

# IP Literature Patent Research

## Overview

Use this skill to detect which literature and patent databases are reachable from an institutional or company IP, then run controlled searches through each site's own search surface or through user-approved exports.

Read `references/database-access-policy.md` before live database automation.
For digital resource navigation MHTML attachments such as `数字资源导航`, read `references/engineering-resource-playbook.md`.
For the browser runner design rationale, read `references/browser-automation-notes.md`.
For the headed-browser feasibility review and anti-bot boundaries, read `references/headed-browser-feasibility.md`.
For paid STEM database operation details, read `references/paid-resource-operations.md`.
For deeper CNKI, Wanfang, VIP, and IncoPat advanced-search usage, read `references/advanced-search-playbook.md`.
For the current online navigation title-click access matrix, read `references/online-nav-title-click-probe-2026-05-04.md`.
For UAV / reinforcement-learning paid resource reachability through the online navigation page, read `references/online-nav-uav-rl-access-2026-05-04.md`.
For newly discovered resource advanced-search automation and live smoke results, read `references/new-resource-advanced-runbook-2026-05-04.md`.

## Quick Start

From the HBA root:

```powershell
python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\detect_database_access.py detect `
  --registry .\hba-agent-skills\skills\ip-literature-patent-research\references\site_registry.json `
  --out-json .\hba-agent-skills\.tmp\db_access.json `
  --out-md .\hba-agent-skills\.tmp\db_access.md

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\research_session.py make-plan `
  --mode patent `
  --topic "technical novelty search" `
  --keywords "your keywords here" `
  --out .\hba-agent-skills\.tmp\patent_plan.json

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\resource_nav_tool.py recommend `
  --json .\hba-agent-skills\skills\ip-literature-patent-research\references\scitech_resources.json `
  --topic "your engineering topic" `
  --discipline aerospace

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\resource_nav_login_probe.py `
  --nav-url "online digital-resource navigation URL" `
  --sites "cnki;wanfang;vip;incopat;web-of-science;scopus;ei-village;inspec" `
  --out-dir .\hba-agent-skills\.tmp\nav_login_probe `
  --profile-dir .\hba-agent-skills\.tmp\paid-stem-cdp-user-profile `
  --launch-cdp `
  --cdp-port 9333 `
  --try-ip-login

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\generic_nav_title_probe.py `
  --nav-url "online digital-resource navigation URL" `
  --resource-file .\hba-agent-skills\.tmp\nav_resource_titles.json `
  --out-dir .\hba-agent-skills\.tmp\nav_title_probe `
  --cdp-endpoint http://127.0.0.1:9333

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\browser_research_runner.py run `
  --plan .\hba-agent-skills\.tmp\patent_plan.json `
  --sites "incopat;patentscope;cnki;ieee-xplore" `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --out-dir .\hba-agent-skills\.tmp\browser_research

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\browser_research_runner.py dom-snapshot `
  --site cnki `
  --query "smoke query" `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --out-dir .\hba-agent-skills\.tmp\dom_snapshots `
  --manual-wait-seconds 30

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\browser_research_runner.py dom-snapshot `
  --sites "cnki;wanfang;incopat;web-of-science;ieee-xplore" `
  --query "smoke query" `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --out-dir .\hba-agent-skills\.tmp\dom_refresh `
  --manual-wait-seconds 20

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\browser_research_runner.py synthesize `
  --evidence-dir .\hba-agent-skills\.tmp\browser_research `
  --plan .\hba-agent-skills\.tmp\patent_plan.json `
  --mode combined `
  --out .\hba-agent-skills\.tmp\browser_research\literature_novelty_draft.md

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\advanced_search_runner.py run `
  --sites "cnki;wanfang;vip;incopat" `
  --query "your engineering literature and patent novelty query" `
  --strategy novelty `
  --filters "有全文;EI;2021-2026" `
  --out-dir .\hba-agent-skills\.tmp\advanced_paid_stem_run `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --launch-cdp `
  --cdp-port 9333 `
  --manual-wait-seconds 20

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\new_resource_advanced_runner.py plan `
  --group rl-ai `
  --query "reinforcement learning UAV path planning" `
  --filters "Peer reviewed;2021-2026;Article" `
  --out .\hba-agent-skills\.tmp\new_resource_advanced_plan_rl_ai.json

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\new_resource_advanced_runner.py run `
  --group uav `
  --query "UAV reinforcement learning trajectory planning" `
  --strategy recall `
  --filters "2021-2026;Article;Engineering" `
  --out-dir .\hba-agent-skills\.tmp\new_resource_advanced_run `
  --profile-dir .\hba-agent-skills\.tmp\paid-stem-cdp-user-profile `
  --launch-cdp `
  --cdp-port 9333 `
  --manual-wait-seconds 20

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\full_research_workflow.py run `
  --mode combined `
  --query "your engineering literature and patent novelty query" `
  --out-dir .\hba-agent-skills\.tmp\full_paid_stem_run `
  --profile-dir .\hba-agent-skills\.tmp\ip-literature-browser-profile `
  --launch-cdp `
  --cdp-port 9333 `
  --manual-wait-seconds 20

python .\hba-agent-skills\skills\ip-literature-patent-research\scripts\site_adapters\springer_link_search.py `
  --query "your engineering topic" `
  --launch-cdp `
  --cdp-port 9333
```

Detection is safe and read-only. For paid resources, prefer `--launch-cdp --cdp-port <unused-port>` so the skill starts a real visible Chrome/Edge CDP browser with its own persistent profile and never competes for port 9222. Browser searching first attempts automatic IP recognition or visible IP/institutional-access buttons, and keeps normal site continuity without storing credentials in the skill.

## Workflow

1. Define the research mode: `literature`, `patent`, or `combined`.
2. Run `detect_database_access.py detect` and inspect which sites are reachable, IP-authenticated, login-required, blocked, or unknown.
3. Create a query plan with `research_session.py make-plan`. Include topic, keywords, synonyms, date range, languages, and must-check assignees/authors when known.
4. If a digital-resource navigation file is available, parse it with `resource_nav_tool.py parse`, then recommend by topic/discipline before opening websites.
5. For advanced-search form work on CNKI, Wanfang, VIP, and IncoPat, use `advanced_search_runner.py run`. It fills advanced fields, applies ordered result filters, discovers official export/citation controls, blocks full-text and bulk-download controls by default, and writes source-labeled local outputs.
6. For newly discovered online-navigation resources, use `new_resource_advanced_runner.py plan/run`. It covers ProQuest/CSA, Annual Reviews, Cambridge, SAGE, Emerald, SIAM, RTCA, military-standard/report resources, Woodhead, and related UAV/RL/engineering routes from `references/new_resource_advanced_profiles.json`.
7. For full paid STEM work, use `full_research_workflow.py run`. It runs selected paid resources, saves per-site evidence, then writes merged local outputs with source labels.
8. For one database, use the matching `scripts/site_adapters/*_search.py` wrapper. Each wrapper uses the same headed-browser runner and writes local evidence for that site.
9. Use `browser_research_runner.py synthesize` or the merged workflow draft to create the first evidence-based literature-review / technology-novelty draft. Then read the saved evidence and revise the narrative manually in Codex.
10. Prefer official export features where available. Normalize exported CSV/TSV files with `research_session.py normalize-export`.
11. For Incopat novelty checks, record search expressions, filters, family grouping, top assignees, IPC/CPC classes, earliest priority dates, and representative closest documents.
12. Produce a final evidence table with query strings, database names, access status, timestamps, result counts, and exported artifact paths.

## Compliance Boundaries

- Use only licensed IP access, explicit institutional login, or free public databases.
- Do not bypass CAPTCHA, paywalls, robots restrictions, abnormal-download controls, or account terms.
- Do not bulk download full text or patent PDFs unless the site's license explicitly allows it and the task requests it.
- Respect database anti-abuse rules; CNKI-style IP blacklist warnings are treated as a hard stop.
- Keep credentials out of skill files, registry files, prompts, logs, and artifacts.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/detect_database_access.py` | Probe configured database home/search pages and emit JSON/Markdown access reports. |
| `scripts/research_session.py` | Build query plans, run controlled browser/URL searches, and normalize user-approved exports. |
| `scripts/browser_research_runner.py` | Drive real browser searches, reuse a persistent browser profile, save per-site evidence, and synthesize a literature-review / novelty-check draft. |
| `scripts/advanced_search_runner.py` | Fill advanced-search form rows, run multi-round result filters, prefer official metadata/citation export candidates, and merge source-labeled evidence. |
| `scripts/new_resource_advanced_runner.py` | Run the same advanced-search, multi-filter, official-export-first workflow for newly discovered UAV/RL/engineering resources from the online navigation page. |
| `scripts/full_research_workflow.py` | Run paid STEM resources end-to-end, save per-site evidence, merge records locally, and write source-labeled review outputs. |
| `scripts/site_adapters/*_search.py` | One-site headed browser wrappers for IncoPat, CNKI, Wanfang, VIP, Web of Science, Scopus, Ei, Inspec, IEEE, ACM, ScienceDirect, SpringerLink, Wiley, AIAA, ASME, ASCE, ASTM, SAE, SPIE, IET, Taylor & Francis, ACS, RSC, IOP, AIP, APS, Nature, and Science Online. |
| `scripts/site_registry_tool.py` | Validate, list, add, or update site profiles in `site_registry.json`. |
| `scripts/resource_nav_tool.py` | Parse `数字资源导航`-style MHTML files, filter science/engineering resources, and recommend databases by topic. |
| `scripts/resource_nav_login_probe.py` | Open an online digital-resource navigation page through headed CDP, locate paid STEM database rows, click the resource title as the direct entry, probe login/IP-access state, optionally try visible IP-login controls, and write a redacted access matrix. |
| `scripts/generic_nav_title_probe.py` | Probe arbitrary online navigation resource titles not yet in `site_registry.json`; write redacted JSON/CSV/Markdown access matrices and strip long login query tokens. |

## Full Paid STEM Automation

Use `full_research_workflow.py list-sites --mode combined` to see the currently configured paid STEM resources. Use `--sites` to narrow a run when a review only needs specific resources.

The full workflow writes:

- `evidence/<site-id>/*_evidence.json`, HTML, text, and screenshot snapshots;
- `merged/merged_records.jsonl`;
- `merged/merged_records.csv`;
- `merged/source_index.json`;
- `merged/evidence_matrix.md`;
- `merged/literature_novelty_draft.md`.

Every merged row keeps source labels. Blocked or login-limited sites are kept as `site_status` rows so a technology-novelty report can show which paid databases were tested and what happened.

## Browser Automation Pattern

- Start headed by default so the operator can see blockers; do not use `--headless` for paid resources.
- Prefer self-launched CDP on an unused port such as `--launch-cdp --cdp-port 9333`. Do not attach to port `9222` when another workflow owns it.
- Keep a stable `--profile-dir` for the CDP browser. Log in or confirm IP access once in that visible browser, then future runs reuse that browser session.
- Let the runner try IP access first. Site-specific `ip_login_texts` or `ip_login_selectors` can be added to `site_registry.json` when a database uses unusual wording.
- Use `--profile-dir` to preserve authorized database sessions across runs. Do not save usernames, passwords, cookies, or SSO tokens into prompts or artifacts.
- If a site shows CAPTCHA, abnormal-download, IP-blacklist, or access-denied markers, treat the run as blocked and continue only after an authorized manual session or official export.
- Add or fix site-specific selectors in `site_registry.json` from evidence when a site changes. This is internal adapter maintenance by Codex, not a user-facing manual-search step.
- The runner collects evidence, not final truth. Final review/novelty conclusions require checking candidate records inside source databases or official exports.
- When deeper recall or precision is needed, prefer the site's advanced search URL from `site_registry.json` and follow `references/advanced-search-playbook.md` before falling back to a plain keyword run.

## DOM Update Entry

When the user says a database changed, run `browser_research_runner.py dom-snapshot --site <id> --query <smoke query>`. For a routine refresh, pass `--sites "cnki;wanfang;incopat;web-of-science;ieee-xplore"` or `--sites all` when the task explicitly allows touching every configured site. This command:

- opens the site in a visible browser;
- attempts IP/institutional access first;
- optionally waits for a manual checkpoint;
- saves HTML, visible text, screenshot, and an interactive DOM element list;
- emits selector suggestions for search boxes, IP access buttons, export links, and result links.

After reading the snapshot JSON and screenshot, update only the affected `site_registry.json` fields, then re-run `site_registry_tool.py validate`, unit tests, and a live smoke for that site.

For an online resource-navigation page refresh, run `resource_nav_login_probe.py --nav-url <navigation URL> --launch-cdp --cdp-port <unused-port>`. The default path searches the navigation page for each configured resource and clicks the resource title itself, not the `详情` link. Use `--discover-only` first when the row set changed, then run without it to rebuild `access_matrix.json/csv/md`. Navigation URLs and private institutional redirects are redacted in all outputs.

For newly discovered resources, update `references/new_resource_advanced_profiles.json` after a DOM snapshot or navigation-probe refresh, then run `new_resource_advanced_runner.py plan --group <group> --query <smoke query>` before a live run. Profiles that require manual login or a security checkpoint are skipped in group runs unless `--include-checkpoint-sites` and `--run-checkpoint-sites` are both intentional.

## Updating This Skill

When a website changes, update `references/site_registry.json` through `site_registry_tool.py` or by asking Codex to patch the profile. Add selectors only after a live page probe proves them. Re-run the registry validator and local unit tests before using the changed adapter.
