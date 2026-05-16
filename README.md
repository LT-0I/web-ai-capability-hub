# web-ai-research-automation-hub

A local-first TypeScript package for cataloging, querying, and executing
web-AI interface workflows **and** authorized research-database automation
through visible, user-authorized browser sessions.

> **Status — `v0.6.0` (first stable, reasonably feature-complete version).**
> Public surface `consumer-contract-1.4.0`, package `0.6.0`. Clean build green,
> full test suite **370/370 passing**. Apache-2.0, Node ≥ 20.

The package is for personal/local development and authorized research
workflows. It does **not** bypass logins, paywalls, CAPTCHAs, bot checks, rate
limits, license restrictions, or service terms. Users authenticate manually in
a normal visible browser profile; this project reuses that profile through
Chrome DevTools Protocol (CDP) without exporting cookies or credentials. When
a UI/access path drifts or is walled, it surfaces a **stable contract error
code** — never a silent fallback or a synthesized artifact.

---

## What is this

`web-ai-research-automation-hub` is a TypeScript package that:

- Catalogs web-AI interface capabilities (Gemini, ChatGPT, Claude) via CDP
  browser automation.
- Stores capability metadata in SQLite for a queryable knowledge base, with a
  dependency-free JSON fallback and JSON import/export.
- Provides an MCP server (stdio) so AI agents can query capabilities and drive
  browser workflows.
- Supports parallel named-tab orchestration for multi-task automation.
- Exposes a versioned, contract-locked public surface split into two
  independent tool families:
  - **37 `webai_` tools** — ChatGPT / Claude / Gemini automation.
  - **120 per-DB `research_*` tools** — a separate research-database sub-MCP
    over 40 NUAA STEM databases.

---

## Public surface (consumer contract)

The complete CLI / MCP / TS public surface is versioned and round-tripped
through `configs/consumer-contract.json`, `docs/CONSUMER_CONTRACT.md`, and
`tests/consumerContract.test.ts`. A contract bump is a deliberate act; additive
per-DB expansion within the same minor does **not** bump the version.

Current locks (`consumer-contract-1.4.0`, `package 0.6.0`):

| Surface | Count |
| --- | --- |
| `webai_` tools (ChatGPT / Claude / Gemini) | **37** |
| per-DB `research_*` tools (40 DBs × search/filter/export) | **120** |
| `research_nuaa_import` (seed importer) | 1 (→ 121 `research_`-prefixed rows) |
| sub-MCP tools | **11** |
| stable error codes | **32** |
| `forbidden_output_fields` redacted for safe consumers | **23** |

Forbidden fields (`cdpEndpoint`, `webSocketDebuggerUrl`, `profileDir`,
`cookies`, `tokens`, `dom`, `html`, …) are never delivered to safe consumers.
Trace redaction is on by default.

### Web-AI tools (37)

- **ChatGPT (14)** — send prompt, upload & query, deep research, Canvas export,
  image/file generation, Pulse (get / onboard), conversation & workspace
  management, and Codex integration (submit task / status / diff / list envs).
- **Claude (10)** — send prompt, upload & query, deep research, file
  generation, conversation & workspace management, and Design (create project /
  generate / get HTML / present).
- **Gemini (12)** — send prompt, upload & query, deep research, image/video
  generation, Canvas (edit / to Docs), music (generate / status / download
  track), conversation & workspace management.
- Plus `webai_task_status`.

The three services run in independent managed profiles on separate CDP ports
(ChatGPT `9223`, Claude `claude-9224` on `9224`, Gemini `9225`). Browser
launches are serialized (shared singleton-lock) and require `DISPLAY` +
`XAUTHORITY` on the host.

### Research-database sub-MCP (40 DBs / 120 tools)

A database surface **distinct from** the webai tools (non-`webai_`, not a
sub-MCP entry). Each database exposes `research_<db>_search`,
`research_<db>_filter`, and `research_<db>_export`. Wired databases:

```
aiaa  wos  acm  ieee  acs  asme  rsc  wiley  asce  iop
tandf sae  sciencedirect aps emerald cambridge springer nature iet aip
mdpi  optica proquest frontiers arxiv siam degruyter worldsci royalsoc scoap3
dblp  scielo inspirehep pubscholar opticsjournal crc cellpress iest
incopat wanfang
```

Each database was mapped observe-first (Opus-effort=max interactive,
no synthesis), solidified into a self-contained module
(`src/mcp/researchdb/<db>/{flow,tools}.ts` + a unit test), then wired with one
consolidated contract round-trip. Per-DB scope is the built-in advanced search,
filter/refine, and citation/file export only. SPA/anti-automation surfaces are
driven with a trusted CDP `Input.dispatchMouseEvent` gesture and a read-only
`connectOverCDP` observer where a synthetic click no-ops. Databases behind a
login/quota/entitlement wall return a stable contract error code
(`HUMAN_HANDOFF_REQUIRED`, `LOGIN_REQUIRED`, `PLAN_OR_QUOTA_REQUIRED`,
`MODE_UNCERTAIN`, …) — never a silent fallback or a fabricated artifact.

---

## NoeticBraid v3.2 first-phase scope (recorded 2026-05-12, δ demo day-0, Part 2.C #7)

For NoeticBraid first-phase MUP (per `PROJECT_DEFINITION_v3.2.md` §5.2 / §10.4
and Codex II audit Part 2.C #7 + Part 5 #4), only one capability of this hub is
in first-phase scope:

- ✅ **4-end basic health-check** for Claude Code CLI / Codex CLI / Gemini CLI /
  Gemini Web (the reference implementation that SDD-D2-03 capability
  real-health-check consumes — commit `f06b044`).

Out of NoeticBraid first-phase scope (paused / deferred to phase 2+):

- ❌ Institutional research databases — violates v3.2 §4 "External Reference
  Pool only stores AI meta-knowledge, not domain knowledge" (line 110-112).
- ❌ Workflow executor / scheduled jobs — first phase allows manual triggers
  only (v3.2 §10.4 cron deferred).
- ❌ ChatGPT Web adapter / Claude Web adapter — first MVP end set is Claude
  Code CLI / Codex CLI / Gemini CLI / Gemini Web only (v3.2 §5.2).
- ❌ `WAH_AUTO_CONFIRM` automatic-confirmation flag — first phase requires
  manual confirmation for any send / download / export / delete / share /
  publish / pay / account-change action (v3.2 §7.2 user-subject red line).

These features remain in this hub repo for reference and future-phase work but
**must not** be wired into NoeticBraid first-phase code paths.

---

## Architecture

**Capability database** — SQLite (`better-sqlite3` when installed) at
`data/capability-hub.sqlite`, with a dependency-free JSON fallback. Stores
service targets, browser profiles, page captures, UI elements, capabilities and
versions, workflow definitions/runs, run events, artifacts, site-registry
entries, scheduled jobs, and policy events; maintains searchable capability
text; supports JSON import/export.

**CDP browser automation** — Playwright connects to visible
Chrome/Chromium/Edge over CDP, launching or reusing persistent profiles under
`data/browser-profiles/<profile>`. Pages are read as structured snapshots
(text, elements, forms, tables, lists, iframes, selector candidates, optional
screenshot/accessibility). Tabs are tracked through a registry for parallel
work.

**Lite snapshot mode** — `browser:read`, `browser:screenshot`,
`capability:update`, and the snapshot path accept opt-in `--mode lite`, which
drops non-interactive text, accessibility tree, empty fields, and the
screenshot payload (~76% fewer bytes on typical landing pages, no loss of
interactive element labels). Default mode is unchanged.

**MCP server** — runs over stdio (`node dist/src/cli.js mcp` / `npm run mcp`),
exposing browser, capability, workflow, site-registry, maintenance, the 37
`webai_` and the 120 `research_*` tools, plus JSON resources.

**Workflow compiler & executor** — compiles YAML/JSON workflow definitions into
concrete browser action plans, resolving abstract capability references to
selectors from the capability database. Supports dry runs, workflow tests, and
approval gates; risky actions (send, download/export, delete, publish/share,
purchase, account change, bulk ops) require explicit approval.

**Download manager & artifacts** — captures browser-native downloads under
`data/downloads/`, records artifact metadata in the capability database, and
keeps binary/runtime folders out of git.

**Health-check system** — validates capability freshness against current UI
selectors, reporting `ok` / `missing` / `ambiguous` / `blocked` /
`needs_review`, optionally applying status updates with `--apply`.

---

## Project layout

```text
src/                    TypeScript source
  actions/              Browser action execution and confirmation policy
  adapters/             Web-AI adapters and research-database importers
  artifacts/            Artifact metadata helpers
  browser/              Managed CDP launcher, profiles, tabs, sessions, downloads
  capabilities/         SQLite/JSON database, schema, migrations, extractor, updater
  maintenance/          Site-map capture/diff/probe utilities
  mcp/                  MCP server, tools, resources, schemas
    researchdb/         40 per-DB research modules ({flow,tools}.ts each)
  observe/              Snapshot helpers, redaction, IP-login detection
  reader/               DOM/accessibility/screenshot/page snapshot extraction
  recipes/              YAML recipe loader and engine
  safety/               Policy/redaction helpers
  shared/               Shared TypeScript types
  utils/                Paths, schema, YAML, logger, optional imports
  workflows/            Workflow schema, compiler, executor, safety policy
configs/                Profile, target, refresh, adapter, recipe, and contract config
scripts/                Catalog import and selector backfill scripts
tests/                  Node test-runner tests
data/                   Curated catalogs plus ignored runtime data/dbs/artifacts
dist/                   Compiled build output (git-ignored)
docs/                   Consumer contract, integration and workflow notes
examples/               Example workflows
fixtures/               Mock web-AI/research pages and sample registries
```

---

## Key CLI commands

Build first when running from source:

```bash
npm run build
node dist/src/cli.js --help
```

- **Browser** — `browser:launch` / `browser:status` / `browser:open` /
  `browser:read` / `browser:screenshot` / `browser:click` / `browser:type` /
  `browser:select` / `browser:press` / `browser:hover` / `browser:drag` /
  `browser:wait` / `browser:upload` / `browser:download-url` /
  `browser:artifact-click` / `browser:tab:alloc|free|list` /
  `browser:close --mode disconnect|close-process|leave-open`. Use
  `browser:launch --profile <name> --cdp-port <port>` (never the legacy
  `browser:start`).
- **Capability** — `capability:init-db` / `capability:update` /
  `capability:query` / `capability:import` / `capability:export` /
  `capability:health-check`.
- **Workflow** — `workflow:list` / `workflow:compile` / `workflow:test` /
  `workflow:run [--dry-run]`.
- **Research DB** — `research:<db>:search|filter|export`
  (`export` requires `--confirmed`) for each of the 40 wired databases.
- **MCP / registry** — `mcp` / `mcp:tools` / `mcp:resources` /
  `site:registry:import` / `site:capture-map` / `adapter:list` /
  `web-ai:adapters` / `recipe:list` / `snapshot:capture|diff` /
  `consumer:health` / `verify:docx-min`.

Every command supports `--json`. Default web-automation tab selection requires
an explicit `--tab-url-contains` or `--url`; the tools refuse to silently pick
`pages()[0]`.

---

## MCP tools & resources

Representative tools: `browser_launch`, `browser_status`, `browser_pages`,
`browser_open`, `browser_read`, `browser_screenshot`, the browser-action tools,
`capability_update`, `capability_query`, `capability_export`,
`workflow_compile`, `workflow_run`, `consumer_health`, plus the 37 `webai_*`
and 120 `research_*_{search,filter,export}` tools.

Resources:

- `capabilities://targets`
- `capabilities://target/{targetId}`
- `capabilities://target/{targetId}/latest`
- `workflows://definitions`
- `workflows://runs`
- `browser-profiles://list`
- `site-registry://sites`

---

## Capability catalogs

Pre-cataloged capability sets for Gemini, Claude, and ChatGPT migration and
query workflows are project deliverables and reproducibility anchors.

- **Gemini** — 612 capabilities (603 manually explored across canvas, image,
  video, audio, Deep Research, guided learning, Gems, personalization,
  sharing/export; 9 DOM-discovered selector-backed records).
- **Claude & ChatGPT** — same deliverable pattern with locale-paired JSON for
  feature inventory, live feature tests, full/deep/remaining/unexplored
  catalogs, manual capability exports, and verification reports. Claude base
  `*.json` are English captures; ChatGPT base `*.json` are Chinese-locale
  captures; both keep `*.en.json` variants.

Tracked catalog files: `data/gemini_*.json`, `data/claude_*.json`,
`data/chatgpt_*.json`, `data/locale_diff_report.json`, `data/t30_article.txt`.
Regenerated/runtime files (SQLite, browser profiles, screenshots, downloads,
logs, site maps, tab state, `.runs/` evidence, `dist-*` build outDirs) are
git-ignored.

To ignore catalog working-tree churn locally without untracking:

```bash
git update-index --skip-worktree data/*.json
# undo before refreshing deliverables:
git update-index --no-skip-worktree data/*.json
```

---

## Linux setup

### Prerequisites

- Node.js ≥ 20 (`package.json` declares `>=20.0.0`).
- `npm install`
- `npx playwright install chromium`
- Chrome/Chromium with remote debugging.

### Managed browser launch

Prefer the managed launcher (routes through the project's profile/CDP manager):

```bash
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini \
  --url https://gemini.google.com/app --cdp-port 9225 --json
```

`DISPLAY` + `XAUTHORITY` are mandatory on a remote host — without them Chrome
goes headless and Cloudflare blocks the live UI. Serialize multiple launches
(shared singleton-lock).

### Environment variables

```bash
export WAH_CDP_ENDPOINT=http://localhost:9222
export WAH_CONNECT_CDP=true
export WAH_SQLITE_PATH=data/capability-hub.sqlite
# optional:
export WAH_DEFAULT_PROFILE=gemini
export WAH_DATA_DIR=data
```

### Fresh install

```bash
git clone https://github.com/<username>/web-ai-capability-hub.git
cd web-ai-capability-hub
npm install
npx playwright install chromium
npm run build
npm test
```

Then launch a visible profile, complete login manually, and query
capabilities:

```bash
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
node dist/src/cli.js capability:init-db --json
node dist/src/cli.js capability:import data/gemini_manual_capabilities.json --json
node dist/src/cli.js capability:query --target gemini --text "image generation" --json
```

---

## Development

```bash
npm run build        # npm run clean && tsc -p tsconfig.json
npm test             # npm run build && node --test dist/tests/*.test.js
node dist/src/cli.js --help
node dist/src/cli.js mcp:tools --json
```

Heavy implementation (research-DB modules, deep refactors, verification
sweeps) is dispatched to Codex via `omx exec` with an auditable prompt file
under `.omc/codex-prompts/`; the in-repo session orchestrates, gates, and keeps
docs/contract in sync. See `CLAUDE.md` and
`docs/WORKFLOW_OMC_OMX_INTEGRATION.md`.

---

## Safety and data handling

- No CAPTCHA bypass, stealth tooling, credential entry, IP/proxy spoofing,
  billing/account changes, or public publishing during automation.
- Keep browser profiles, downloads, screenshots, local SQLite, tab registries,
  logs, site maps, and `.runs/` evidence out of git. Never commit `.env`,
  cookies, credentials, or exported profile data.
- Stop at login walls, CAPTCHAs, access denials, terms prompts, abnormal
  download warnings, or license-sensitive workflows — and surface a stable
  contract error code. No silent fallback, no locally synthesized artifact.
- Prefer fixture-based tests and dry runs. Risky actions require explicit
  confirmation.

---

## License

Apache-2.0. See `LICENSE`.
