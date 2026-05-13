# Headed Browser Feasibility Research

## Verdict

Headed browser automation is feasible for literature review and patent novelty work only as a human-authorized RPA assistant:

- Use a visible local Chrome or Edge session.
- Prefer IP-based access: after opening a database, first look for visible `IP登录`, `机构登录`, `Access through your institution`, or equivalent buttons. Many databases either auto-recognize the current IP or unlock after this click.
- Reuse a dedicated browser profile for cookies/cache when the site needs continuity, but do not require the user to perform routine account login unless IP access fails and the user explicitly authorizes manual login.
- Search through each database's own UI.
- Prefer built-in export buttons for metadata, RIS, CSV, Excel, or patent reports.
- Stop on CAPTCHA, abnormal-download warnings, IP blacklists, account locks, or explicit access-denied pages.

Do not build a stealth scraper. Avoid proxy rotation, CAPTCHA solving, user-agent deception, hidden headless runs, or bulk full-text/PDF download automation.

## Evidence From Tooling

- Browser-use documents real browser profiles for authenticated automation: if the user is already logged into Chrome, the agent can reuse that session.
- Playwright supports authenticated browser state and persistent contexts, but warns that auth state contains sensitive cookies/headers and should not be committed.
- Playwright can attach to existing Chromium instances through CDP, but automation should use a dedicated profile rather than the user's main everyday profile.
- Browser-use also advertises stealth/CAPTCHA-oriented cloud infrastructure; this skill should not rely on those techniques for licensed library resources.

## Evidence From Database Terms / Behavior

- IEEE API terms reserve access rights and prohibit robots/spiders/site retrieval applications for retrieving or indexing content. IEEE also says subscribed access should use the IP range registered with the subscription.
- Local smoke tests showed the expected pattern: SpringerLink allowed visible-style search evidence collection and exposed a CSV export link; IncoPat opened but showed login/CAPTCHA markers; PATENTSCOPE returned 403; CNKI and IEEE returned empty/error pages under automated headless checks.

## Recommended Architecture

1. **Access setup / IP access attempt**
   - Launch visible Chrome/Edge with a dedicated profile directory.
   - Open each selected database.
   - Try visible IP/institutional-access buttons first.
   - Treat automatic IP recognition as success.
   - Fall back to a manual checkpoint only when the site shows SSO, CAPTCHA, account login, or a blocker.
   - The skill stores only the profile path, not passwords or exported cookies.

2. **Visible browser runner**
   - `headless=false` by default.
   - Slow, deterministic actions: navigate, click a search box, type query, press Enter, wait, screenshot.
   - Optional manual checkpoint when login/CAPTCHA/SSO appears.

3. **Site adapters**
   - Start generic: direct search URL or visible input selectors.
   - Add per-site selectors only after Codex has evidence from a live probe.
   - Track selector version and last verified date.
   - This is an internal maintenance mechanism, not a request for the user to manually search. The point is to let Codex update the automation rule after a website changes.

4. **DOM update entry**
   - Run `browser_research_runner.py dom-snapshot --site <id> --query <smoke query>`.
   - Capture screenshot, HTML, visible text, interactive elements, and selector suggestions.
   - Use this whenever a site redesign breaks search, IP access, export, or result extraction.
   - The user only names the site or asks for a routine update; Codex performs the DOM capture and registry patch.

5. **Evidence capture**
   - Save final URL, screenshot, visible text, result count, query expression, filters, export links, and candidate records.
   - Save official exports when the user clicks or the site clearly allows automated download through the UI.

6. **Synthesis**
   - Build literature review / novelty draft from evidence files and exports.
   - Keep uncertainty explicit: database searched, query used, result count, limitation, and why each record is relevant.

## Feasibility Grade

- Public and tolerant sites: high.
- Paid publisher sites with direct search and export links: medium.
- Chinese licensed databases with IP access and no CAPTCHA: medium after visible-session selector tuning.
- IncoPat/CNKI/IEEE when IP access works: feasible with visible-browser UI automation and official exports.
- IncoPat/CNKI/IEEE when login/CAPTCHA/403/418 appears: feasible only after manual checkpoint or official export; not safe to automate around blockers.

## Implementation Implications

- Remove `--headless` from normal examples.
- Replace `profile-setup` language with `access setup`: first attempt automatic IP recognition or IP/institutional-access button clicks.
- Keep `manual checkpoint` for blockers, SSO, CAPTCHA, or anti-bot warnings.
- Treat adapter learning as Codex-internal selector maintenance from evidence, not user labor.
- Keep smoke tests on public pages, but treat paid-resource success as environment-dependent.
- Do not claim a database was reviewed unless an evidence file or official export exists.
