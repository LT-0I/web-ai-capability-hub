# Wave 18 SAE — per-DB deep fix (technical-papers content route)

## Probe

- Browser: headed Chrome via managed profile `research-sae`.
- Probe artifact: `.runs/wave-18-sae/probes/sae-deep.json`.
- Candidate paper: `10.4271/2026-26-0608` / `2026-26-0608` — https://www.sae.org/papers/post-eol-cybersecurity-validation-automotive-production-units-2026-26-0608.
- Entry points checked:
  - https://www.sae.org/publications/technical-papers/
  - https://www.sae.org/publications/technical-papers/recent/
  - https://www.sae.org/search/?qt=&sort=relevance
  - https://www.sae.org/publications/technical-papers/content/2024-01-1000/
- Actual article discovery: SAE search exposes current papers on `/papers/<slug>-<id>`; the old sample `2024-01-1000` content route returned Page Not Found.
- Institution recognized: `False`.
- Subscription/login wall signals: `True`.
- Direct `/download` produced `%PDF-`: `False`.

### Download route checks

| Route | Status | Content-Type | Bytes | `%PDF-` | HTML |
|---|---:|---|---:|---|---|
| `www-content-download-pattern` | 200 | `text/html` | 15025 | False | True |
| `www-paper-download-pattern` | 200 | `text/html` | 15025 | False | True |
| `mobilus-content-download-pattern` | 202 | `text/html; charset=UTF-8` | 2188 | False | True |
| `mobilus-paper-download-pattern` | 202 | `text/html; charset=UTF-8` | 2188 | False | True |

## Diff

- Touched driver only: `src/mcp/submcp/literature/sae.ts`.
- Added SAE technical-paper ID extraction for raw IDs, `10.4271/<id>` DOIs, `/content/<id>`, and `/papers/...-<id>` URLs.
- Defaulted resolvable SAE IDs to `https://www.sae.org/publications/technical-papers/content/<id>/download`.
- Added SAE Mobilus `/content/<id>` and `/content/<id>/download` article candidates plus download button selectors for authenticated/subscribed sessions.
- If SAE routes return HTML/no verified PDF, the tool now emits `LOGIN_REQUIRED` with the `research-sae` setup hint instead of selector drift/no-candidate ambiguity.

## Validation

- `rm -rf dist && npm run build` → exit 0.
- `npm test` → exit 0, 731/731 passing.
- Re-smoke raw hunted id: `webai:sae:download-pdf --doc-id 2026-26-0608 --profile research-sae --output-json` → exit 1, `LOGIN_REQUIRED`.
- Re-smoke DOI: `webai:sae:download-pdf --doc-id 10.4271/2026-26-0608 --profile research-sae --output-json` → exit 1, `LOGIN_REQUIRED`.

## Gate

- Gate: `LOGIN_REQUIRED` — no tested SAE route returned `%PDF-` in `research-sae`; shipped explicit `LOGIN_REQUIRED` setup hint.
- Raw-id smoke message: SAE Technical Papers PDF access is subscription-gated for 2026-26-0608; the SAE /download route did not return a verified %PDF artifact. Setup: launch headed Chrome profile "research-sae", sign in to SAE Mobilus or connect an institutional SAE Technical Papers subscription, then retry with the same technical paper id.
- DOI smoke message: SAE Technical Papers PDF access is subscription-gated for 2026-26-0608; the SAE /download route did not return a verified %PDF artifact. Setup: launch headed Chrome profile "research-sae", sign in to SAE Mobilus or connect an institutional SAE Technical Papers subscription, then retry with the same technical paper id.
