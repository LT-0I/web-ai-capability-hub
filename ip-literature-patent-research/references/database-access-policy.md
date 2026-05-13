# Database Access Policy

## Allowed Access Modes

Use only these access modes:

- Company or institution IP range that the database recognizes.
- Explicit institutional SSO or proxy login performed by the authorized user.
- Free public databases such as PubMed or PATENTSCOPE.
- User-provided exports from a licensed session.

## Hard Stops

- Do not bypass CAPTCHA, paywalls, rate limits, download throttles, account locks, or anti-bot checks.
- Do not scrape bulk full text or patent PDFs unless the license and task explicitly allow it.
- Do not save usernames, passwords, cookies, SSO tokens, or VPN details in this skill.
- Stop immediately on abnormal-download or IP-blacklist warnings.
- Keep search evidence: database, query, filters, timestamp, result count, and export path.

## Practical Pattern

1. Probe access with `detect_database_access.py`; this only fetches landing/search pages.
2. Use the site's built-in search UI or official export features.
3. Normalize exports locally; do not over-automate download-heavy workflows.
4. For patent novelty checks, combine Incopat with at least one public patent source when possible, usually PATENTSCOPE or Espacenet, then compare earliest priority dates, applicants, IPC/CPC, claims/abstract terms, and family members.

## Useful Official Sources

- incoPat: `https://www.incopat.com/`
- Scopus: `https://www.scopus.com/`
- Elsevier Scopus product page: `https://www.elsevier.com/products/scopus`
- Web of Science access guidance: `https://webofscience.zendesk.com/hc/en-us/articles/39786653671057-Getting-Started-with-Web-of-Science`
- WIPO PATENTSCOPE: `https://patentscope.wipo.int/search/en/search.jsf`
- WIPO PATENTSCOPE overview: `https://www.wipo.int/patentscope/en`
