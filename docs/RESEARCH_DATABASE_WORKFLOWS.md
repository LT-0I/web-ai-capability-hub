# Research-Database Workflows

How the hub automates **paid/licensed research databases** (the science/engineering
digital-resource family), kept strictly separate from the web-AI surface.

> Companion: `docs/plans/research-db-absorption-2026-05-16.md` (initiative
> plan), `docs/CONSUMER_CONTRACT.md` (versioned surface),
> `examples/workflows/research-database-search-dry-run.yaml` (dry-run
> starting point). Real paid-database runs require visible browser access
> and user/institution authorization.

## 1. Two surfaces, never mixed

| Surface | Module | Tool namespace | Contract count |
|---|---|---|---|
| Web-AI (ChatGPT/Claude/Gemini) | `src/mcp/submcp/**` via `subMcpToolSpecs` | `webai_*` | 37 `webai_` (11 sub-MCP) — LOCKED |
| **Research databases** | `src/mcp/researchdb/**` (separate top-level) | `research_*` (non-`webai_`) | not counted in 37 |

The database MCP is a **separate module** by explicit design so the two
are never confused. Adding database tools never moves the `webai_` count,
the 11-sub-MCP count, the 32 error codes, or `consumer-contract-1.5.0`.

## 2. Catalog (source of truth)

The library digital-resource navigation directory is enumerated
read-only into `configs/research/research_inventory.json` (the editable
seed; `schema_version: research-inventory-1.0`). The authoritative
store is the SQLite `site_registry_entries` table — import the seed via:

- CLI: `research:inventory:import [configs/research/research_inventory.json] [--stem-only] [--json]`
- MCP: `research_inventory_import` (`{ path?, stem_only? }`)

`--stem-only` keeps only `raw.classification.science_engineering === true`
rows (学术研究). Imported rows auto-mirror into `service_targets` with
`kind:"research-database"`, so the existing research adapter /
`capability:query` / `site-registry://sites` resource see them for free.
The seed is the seed; the table is authoritative; tallies are derived.

## 3. Per-database capability scope

Each in-scope database exposes exactly three automated primitives — no
full-text scraping, no account/billing actions:

1. **Advanced search** — the database's own built-in advanced-search form.
2. **Filter / refine** — its facet/limiter controls.
3. **File export** — results/records → file via the **CDP download path**
   (`Browser.setDownloadBehavior` + raw `Input.dispatchMouseEvent` /
   `browser:artifact-click`). **Never** page-level Playwright
   `download.click()` (the round-2 sandbox-iframe retro proved this; the
   round-3 raw-CDP DOCX export recipe is the prior-art reference,
   `CLAUDE.md:152`).

## 4. Access model (institutional network)

Device is on the institutional network. A database is reached by:

- **(a) direct** — navigate the entry,
- **(b) IP登录 click** — a single click on the homepage IP-login control
  (no credential typing),
- **(c) nav-proxy link** — click the EZproxy link in the navigation page.

We **never type credentials**. Institutional/proxy URLs
(`*.institution.example.edu`, `libproxy`, nav/proxy URLs) are **sensitive values**,
redacted at import (the `normalizeInstitutionalUrls` projection in
`siteRegistryImporter.ts`) and never persisted or emitted; the R1/R2
forbidden-field boundary (`src/mcp/forbiddenFields.ts`) is the second
line for structural keys.

## 5. Failure → stable contract error code (no silent fallback)

| Situation | Error code |
|---|---|
| True login wall / CAPTCHA / bot check | `HUMAN_HANDOFF_REQUIRED` |
| Quota / mass-download ambiguity | `PLAN_OR_QUOTA_REQUIRED` |
| Form requiring typed credentials | `LOGIN_REQUIRED` |
| Access mode genuinely unclear | `MODE_UNCERTAIN` |
| Missing `--url` / `--tab-url-contains` | `INVALID_ARGS` |
| Output would carry an institutional/proxy URL | `SAFE_OUTPUT_REDACTION_REQUIRED` |

No CAPTCHA bypass, no stealth/proxy bypass, no synthesised artifacts, no
graceful fallback — fail honestly with the code.

## 6. Safe execution sequence

1. Launch the `research-default` profile (own CDP port; do not collide
   with the web-AI chromes 9223/9224/9225 or another research profile on 9226).
2. Let the user confirm access or institutional login (mode a/b/c above).
3. Discover capabilities (advanced search / filters / export).
4. Compile a dry-run workflow.
5. Execute only official visible UI operations; stop on blockers with the
   matching error code (§5).

## 7. Building a per-database flow (mandatory pipeline)

Per-DB UI flows are the SPA-hydration / gated-element class that has cost
repeated blind-codex failures. The required order:

1. **Opus-4.7 effort=max interactive exploration** — observe-first,
   canonical reader (`readPageSnapshot`), bounded-poll past SPA hydration;
   map advanced-search + filters + export for that database.
2. **Codex re-run** — another AI reproduces the verified flow headlessly.
3. **固化 (solidify)** — encode the verified CDP flow as a `research_*`
   tool in `src/mcp/researchdb/`, with the additive consumer-contract
   round-trip in the same dispatch. Never blind-codex a per-DB flow before
   step 1 has mapped it.
