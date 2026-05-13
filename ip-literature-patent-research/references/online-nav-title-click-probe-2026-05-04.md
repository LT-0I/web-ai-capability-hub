# Online Navigation Title-Click Probe, 2026-05-04

This note records the current behavior of the online digital-resource navigation page. Do not store or quote the private navigation URL. The correct primary entry path is:

1. Open the online navigation page in a headed CDP browser with the persistent profile.
2. Find or scroll to the resource row.
3. Click the resource title/name cell itself.
4. Classify the resulting database page, preserving only redacted evidence.

The previous "open detail page then extract vendor URL" path is retained only as a fallback. It is not the primary behavior for this navigation page.

## Current Paid STEM Results

| Resource | Title-click result | Current classification | Notes |
|---|---|---|---|
| CNKI | Opens `https://www.cnki.net/` | Direct IP/institution access | Search surfaces and advanced search are visible. |
| Wanfang Data | Navigation title route hit a proxy reset in CDP | Mixed | Direct official home `https://www.wanfangdata.com.cn/` is IP/institution accessible. Keep a retry rule that bypasses the failed proxy route when this navigation failure appears. |
| CQVIP | Navigation title route opens `chrome-error://chromewebdata/` | Navigation error | This matches the manual observation that this navigation link may not enter correctly. Use the known visible login/IP-login path when reachable. |
| IncoPat | Opens public `https://www.incopat.com/` marketing page | Login required or unknown | The page shows Login/Trial/Free Trial, not the logged-in patent search workspace. Use the known login-menu IP-login route. |
| Web of Science Core Collection | Opens Web of Science smart search | Direct IP/institution access | Smart Search, Advanced Search, All Databases, and Core Collection surfaces are visible. |
| Scopus | Opens Scopus homepage/search UI | Direct IP/institution access | Basic and advanced document-search surfaces are visible. |
| Inspec | Opens Web of Science Inspec basic search | Direct IP/institution access | Lands on the Inspec search page in Web of Science. |
| Engineering Village / Ei | Navigation title currently lands on Scopus; direct official Engineering Village URL reports entitlement error | Not confirmed | Do not mark as clean Ei/Compendex access until the entry route is confirmed by a human or the navigation mapping changes. |

## Evidence Locations

Generated artifacts are under:

- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_direct_cnki\`
- `C:\Users\13080\Desktop\HBA\hba-agent-skills\.tmp\nav_login_probe_20260504_direct_titles_sites\`

The access matrix redacts navigation URLs and institution markers. Re-run the privacy scan after any DOM refresh or new artifact batch.

## Update Rule

When the navigation page or a vendor page changes:

1. Re-run `resource_nav_login_probe.py` in title-click mode.
2. If a site opens but classification looks wrong, classify from the saved evidence with the latest `classify_login_evidence` rules before changing the matrix.
3. Update this note only with stable behavior and redacted evidence paths.
4. Do not add institution names, private navigation URLs, credentials, cookies, or proxy tokens to skill files.
