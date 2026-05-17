# academic research science/engineering-DB auto-collection + sibling-asset absorption (2026-05-16)

Status: **ACTIVE** · Initiative kicked off post-R1R2 (`eebf87c`).

## User request

Build research-database auto-collection covering **all 学术研究 (science/engineering-related)
accessible databases** from the library digital-resource navigation directory
directory, and absorb that capability into this hub. Hard constraint:
**"不要破坏当下既有流程即可，增加更多新功能"** — do not break any existing
flow; only ADD. Absorption scope = orchestrator's call.

## Source-of-truth decision

The previously-referenced sibling assets
(`ip-literature-patent-research/`, `research_inventory.json`,
`references/site_registry.json`) **do not exist on this host** (architect +
independent `find /home/l1u` both confirm absent). Fabricating the
inventory is banned (no synthesis). The user supplied the **authoritative
live nav portal**:

```
https://lib.institution.example.edu/engine2/m/C033AF58F1DD8665?p=254235&typeId=4493755&pageId=226566&wfwfid=21318&websiteId=136822
```

Decision: **re-derive the inventory by an authorized live read-only
enumeration of this portal** (device is on the institutional network).
The emitted seed JSON is then the durable source-of-truth (the portal is
NOT re-crawled afterward — import-first, per
`project_capability_library_source_of_truth` re-exploration ban).

## Architecture (architect-blueprinted, red-teamed)

- **Store: `site_registry_entries`** (NOT `integration_registry`, NOT a new
  table). `SiteRegistryImporter.parseFile` already maps the
  `{id,name,type,home_url,...}` shape with zero code change; auto-mirrors
  into `service_targets` with `kind:"research-database"`, so the existing
  `researchDatabaseAdapter` / `capability:query` / `site-registry://sites`
  resource see new DBs for free. `integration_registry` rejected: it is a
  status-FSM campaign tracker keyed `feature_id/service/status` — sites are
  a catalog, not capability features; mixing corrupts the
  "never re-explore IMPLEMENTED_GREEN" governance invariant. New table
  rejected: forces a schema-version + export-key bump (more breaking
  surface than a `raw`-JSON scan).
- **Surface = a SEPARATE database sub-MCP, NOT the webai MCP** (user
  directive 2026-05-16, memory `feedback-research-db-separate-mcp-cdp`).
  New sub-MCP module `src/mcp/submcp/research-db/` mirroring the shipped
  `src/mcp/submcp/` pattern (claude-design / gemini-music / chatgpt-codex)
  — explicitly distinct so the database MCP and the webai MCP are never
  confused/mixed. Houses `research:inventory:import` CLI + `research_inventory_import`
  MCP (seed importer) AND all future per-DB flow tools. None are `webai_`
  tools → **37 stays 37, 32 error codes stay 32,
  `consumer-contract-1.5.0` / package `0.7.0` unchanged.** Round-trip
  triad still required (command row + 2 `sensitive_fields` entries; docs;
  non-counting assertions + explicit "still 37/32" locks).
- **Database access uses the CDP approach** (user directive): CDP-level
  `Browser.setDownloadBehavior` + raw `Input.dispatchMouseEvent` /
  `browser:artifact-click`, never page-level Playwright `download.click()`
  — same anti-pattern ban as the sandbox-iframe download.
- **Per-DB capability scope (user directive 2026-05-16):** each science/engineering DB's
  automation surface is exactly three primitives — (1) the DB's built-in
  **advanced search**, (2) its various **filter/refine** controls, (3)
  **file export** (results/records → file, via the CDP download path,
  never page-level `download.click()`). Not full-text scraping, not
  account/billing actions. Export reuses the proven round-3 raw-CDP
  `Browser.setDownloadBehavior` recipe.
- **Per-DB automation pipeline (user directive):** for any science/engineering DB whose
  automation is in scope — FIRST Opus-4.7 effort=max interactive
  exploration (observe-first, canonical reader, bounded-poll past SPA
  hydration) maps advanced-search + filters + export → THEN Codex
  re-runs/reproduces → THEN固化 into a tool in the database sub-MCP +
  additive contract round-trip. No blind-codex per-DB flow before an
  Opus-max interactive pass has mapped it.
- **science/engineering filter:** per-record `science_engineering:bool` +
  `subject`/`matched_subjects` ride losslessly in `raw`; import-all,
  mark-science/engineering, with a cheap `--stem-only` flag.

## Access model (user-stated; MUST honor)

Device on institutional network. Reachable by (a) direct, (b) homepage
"IP登录" **click** (no typing), (c) nav-page proxy link (EZproxy). **We
never type credentials.** Failure → stable contract error code, no
fallback/synthesis:

| Failure | Code |
|---|---|
| True login wall / CAPTCHA / bot check | `HUMAN_HANDOFF_REQUIRED` |
| Quota / mass-download ambiguity | `PLAN_OR_QUOTA_REQUIRED` |
| Form requiring typed credentials | `LOGIN_REQUIRED` |
| Access mode genuinely unclear | `MODE_UNCERTAIN` |
| Missing `--url`/`--tab-url-contains` | `INVALID_ARGS` |
| Output would carry nav/proxy/institutional URL | `SAFE_OUTPUT_REDACTION_REQUIRED` |

## Redaction (ties to R1/R2 boundary)

Forbidden-field walker (`src/mcp/forbiddenFields.ts`, just shipped) catches
structural **key names** only. Institutional/proxy URL **values**
(`*.institution.example.edu`, `libproxy.institution.example.edu` EZproxy, `nav_url`, `proxy_url`)
are blanked by an **import-time normalizer** BEFORE rows hit the DB, so
`site-registry://sites` can never emit them. Seed JSON keeps
`redactions_applied:["nav_url","institutional_markers"]` as authored.

## Serialized Codex batches (each: own build+test gate, orchestrator re-verifies)

1. **`research-inventory-enumerate`** (Task #28) — live read-only listing crawl of
   the nav portal → `configs/research/research_inventory.json` seed
   (classified, redacted). No per-DB login, no credential entry.
2. **`research-importer-extend`** — `SiteRegistryImporter` additive science/engineering
   classifier + nav/proxy/institutional-URL normalizer; namespaced
   `site_id` (`research-inventory-<slug>`). Existing `site:registry:import` tests
   must stay green (no regression).
3. **`research-cli-mcp-surface`** — `research:inventory:import` CLI +
   `research_inventory_import` MCP (delegates to B2), non-`webai_`.
4. **`research-contract-roundtrip`** — command row + `sensitive_fields`;
   `docs/CONSUMER_CONTRACT.md`; tests incl. explicit "still 37 / still 32"
   locks; `contract_version` unchanged.
5. **`research-import-verify`** — import real seed in scratch DB; assert row
   counts, science/engineering preserved, zero forbidden field / institutional URL in
   `site-registry://sites`.
6. **`research-docs-workflow`** — `docs/RESEARCH_DATABASE_WORKFLOWS.md` 3-mode
   access + error-code map; round-3 export script cited as prior art only.

## Top risks (red-team)

- `site_id` collision overwriting pre-existing `site_registry_entries` →
  namespace all ids; B5 asserts no pre-existing id mutated.
- Institutional/proxy URL value leak → import-time value normalizer (B2);
  structural walker is second line.
- `SiteRegistryImporter` change regressing shipped `site:registry:import` →
  extension additive (new optional param, default off); B2 gate reruns
  site-registry tests.
- `service_targets` volume delta → intended engine-reuse; `--stem-only`
  bounds it.
- DB ToS forbids automated access despite no credential typing → adapter
  `accessPolicy`/`stopConditions` already encode "do not bypass"; any wall
  → `HUMAN_HANDOFF_REQUIRED`. No per-DB ToS audit in scope.
- Re-crawling portal as discovery loop → banned; import-first, live ops
  per-DB on demand only.
