# Browser Automation Notes

The live runner follows proven patterns from mature public projects without copying their code:

- Browser-use: persistent browser sessions, visible browser operation, action logs, and custom tools for web agents.
- Paperfetcher: reproducible search parameters, export-first evidence handling, and systematic-review-friendly reports.
- Deep research tools such as GPT Researcher / STORM-style workflows: plan the search, collect cited evidence, then synthesize a draft from the evidence set.
- Playwright Python: persistent Chromium contexts, browser navigation, screenshots, and reliable waits.

Operational rules:

- Keep the browser runner deterministic where possible: registry profile plus query plan in, evidence artifacts out.
- Treat the browser as a licensed UI, not as a bulk scraper.
- Preserve enough evidence for replay: action log, final URL, screenshot, HTML/text snapshot, result-count hints, and candidate links.
- Stop or hand off when the page shows CAPTCHA, abnormal-download, IP blacklist, account lock, or access-denied signals.
