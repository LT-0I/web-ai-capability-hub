<div align="center">

# web-ai-research-automation-hub

**Local-first browser-automation hub for Web-AI services and research databases**

Catalog, query, and execute web-AI interface workflows and authorized
research-database automation through visible, user-authorized browser sessions.

[![version](https://img.shields.io/badge/version-2.2.0-blue)](#)
[![contract](https://img.shields.io/badge/consumer--contract-2.2.0-blueviolet)](docs/CONSUMER_CONTRACT.md)
[![tests](https://img.shields.io/badge/tests-844%2F871%20passing-success)](#)
[![node](https://img.shields.io/badge/node-%E2%89%A520-339933)](#)
[![license](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

[简体中文](README.md) ｜ **English**

</div>

---

> **Status — `v2.2.0` (Path C Unpaywall OA fallback release).**
> Public surface `consumer-contract-2.2.0`, package `2.2.0`. Clean build green,
> tests **844/871 passing** (the other 27 are live-CDP integration tests that
> need an active browser session + login, not counted offline). Apache-2.0,
> Node ≥ 20.

For personal/local development and authorized research workflows. It does
**not** bypass logins, paywalls, CAPTCHAs, bot checks, rate limits, license
restrictions, or service terms. Users authenticate manually in a normal
visible browser profile; this project reuses that session over Chrome
DevTools Protocol (CDP) **without exporting cookies or credentials**. When a
UI/access path drifts or is walled, it returns a **stable contract error
code** — never a silent fallback, never a synthesized artifact.

## Table of Contents

- [What is this](#what-is-this)
- [Highlights](#highlights)
- [Public surface (consumer contract)](#public-surface-consumer-contract)
- [Quick start](#quick-start)
- [Use as a standard MCP server](#use-as-a-standard-mcp-server)
- [NoeticBraid v3.2 first-phase scope](#noeticbraid-v32-first-phase-scope)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [CLI commands](#cli-commands)
- [MCP tools & resources](#mcp-tools--resources)
- [Capability catalogs](#capability-catalogs)
- [Setup](#setup)
- [Development](#development)
- [Automated maintenance](#automated-maintenance)
- [Safety & data handling](#safety--data-handling)
- [Contributing](#contributing)
- [License](#license)

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
  - **81 `webai_` tools** — ChatGPT / Claude / Gemini automation, plus 40 `webai_<db>_download_pdf` literature PDF download drivers.
  - **120 per-DB `research_*` tools** — a separate research-database sub-MCP
    over 40 academic research databases.

## Highlights

- 🧭 **Observe-first, never synthesize** — every database is mapped
  interactively; walls fail with an honest error code, never a fabricated
  result.
- 🔒 **Contract-locked public surface** — the entire CLI/MCP/TS surface is
  versioned and round-tripped via `configs/consumer-contract.json`; a contract
  bump is a deliberate act.
- 🧱 **Safe-consumer redaction** — 27 forbidden fields (`cdpEndpoint`,
  `cookies`, `profileDir`, …) are never delivered; trace redaction on by
  default.
- 🖱️ **Trusted-gesture automation** — anti-automation SPAs are driven with a
  real CDP `Input.dispatchMouseEvent` gesture + a read-only `connectOverCDP`
  observer where synthetic clicks no-op.
- 🗂️ **40-database research coverage** — AIAA, IEEE, ACM, Web of Science,
  Springer, ScienceDirect, IncoPat, Wanfang, and more — search/filter/export
  each.
- ✅ **Reproducible** — clean build + 844/871 tests passing (27 live-CDP
  integration tests need an active browser session) + zero orphan contract
  rows + all locks held.

## Public surface (consumer contract)

The full CLI / MCP / TS surface is versioned and round-tripped through
`configs/consumer-contract.json`, `docs/CONSUMER_CONTRACT.md`, and
`tests/consumerContract.test.ts`. Additive per-DB expansion within the same
minor does **not** bump the version.

Current locks (`consumer-contract-2.2.0`, `package 2.2.0`): **81** webai_ tools, **121** research_ tools, **8** wah_ tools, **40** error codes, **232** commands, golden tool snapshot `tests/golden/listMcpTools.236.json`.

| Surface | Count |
| --- | --- |
| `webai_` tools (ChatGPT / Claude / Gemini + 40-DB PDF download + literature tasks) | **81** |
| per-DB `research_*` tools (40 DBs × search/filter/export) | **120** |
| `research_inventory_import` (seed importer) | 1 (→ 121 `research_`-prefixed rows) |
| sub-MCP tools | **11** |
| stable error codes | **40** |
| `forbidden_output_fields` redacted for safe consumers | **27** |

The public surface grew across phases (Chrome-extension-assisted CDP and Phase 8 literature downloads) to the current lock: **232** commands, `webai_` **81**, `research_` **121**, `wah_` **8**, **40** error codes (covering bridge-not-connected, permission-denied, and debugger-unavailable failures).

### Web-AI tools (81)

- **ChatGPT (15)** — send prompt, standalone model/thinking-depth selection,
  upload & query, deep research, Canvas export, image/file generation, Pulse
  (get / onboard), conversation & workspace management, Codex integration
  (submit task / status / diff / list envs).
- **Claude (11)** — send prompt, standalone model/thinking-depth selection,
  upload & query, deep research, file generation, conversation & workspace
  management, Design (create project / generate / get HTML / present).
- **Gemini (13)** — send prompt, standalone model/thinking-depth selection,
  upload & query, deep research, image/video generation, Canvas (edit / to
  Docs), music (generate / status / download), conversation & workspace
  management.
- Plus `webai_task_status`, `webai_literature_task_status`, and **40 `webai_<db>_download_pdf`** literature PDF download drivers (one per database, `%PDF-` enforced, honest `LOGIN_REQUIRED` on a login/paywall). 39 core service tools + 42 literature download/task tools = 81 `webai_` tools.

Services run in independent managed profiles on separate CDP ports (ChatGPT
`9223`, Claude `claude-9224` on `9224`, Gemini `9225`). Browser launches are
serialized (shared singleton-lock) and require `DISPLAY` + `XAUTHORITY`.

### Research-database sub-MCP (40 DBs / 120 tools)

A database surface **distinct from** the webai tools (non-`webai_`, not a
sub-MCP entry). Each database exposes `research_<db>_search`,
`research_<db>_filter`, `research_<db>_export`. Wired databases:

```
aiaa  wos  acm  ieee  acs  asme  rsc  wiley  asce  iop
tandf sae  sciencedirect aps emerald cambridge springer nature iet aip
mdpi  optica proquest frontiers arxiv siam degruyter worldsci royalsoc scoap3
dblp  scielo inspirehep pubscholar opticsjournal crc cellpress iest
incopat wanfang
```

Each was mapped observe-first (interactive, no synthesis), solidified into a
self-contained module (`configs/adapters/researchdb/<db>/*.yaml` + `src/handlers/researchdb/*.ts` + a unit
test), then wired with one consolidated contract round-trip. Per-DB scope is
the built-in advanced search, filter/refine, and citation/file export only.
Anti-automation SPAs use a trusted CDP gesture + a read-only `connectOverCDP`
observer. Databases behind a login/quota/entitlement wall return a stable
contract error code (`HUMAN_HANDOFF_REQUIRED`, `LOGIN_REQUIRED`,
`PLAN_OR_QUOTA_REQUIRED`, `MODE_UNCERTAIN`, …) — never a silent fallback or a
fabricated artifact.

## Quick start

```bash
git clone https://github.com/<username>/web-ai-capability-hub.git
cd web-ai-capability-hub
npm install
npx playwright install chromium
npm run build
npm test                       # 844/871 passing (27 live-CDP tests need an active browser)

# launch a visible profile and complete login manually
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini \
  --url https://gemini.google.com/app --cdp-port 9225 --json

# run as an MCP server
node dist/src/cli.js mcp
```

## Use as a standard MCP server

GitHub Releases include `web-ai-research-automation-hub-2.2.0.tgz`. Consumers can install it and point their MCP client at the dedicated stdio binary:

```bash
npm i -g ./web-ai-research-automation-hub-2.2.0.tgz
web-ai-research-automation-hub-mcp
```

Or run it without a global install:

```bash
npx -y --package ./web-ai-research-automation-hub-2.2.0.tgz web-ai-research-automation-hub-mcp
```

Generic `mcpServers` config (Claude Desktop uses the same shape in `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "web-ai-research-automation-hub": {
      "command": "web-ai-research-automation-hub-mcp",
      "args": []
    }
  }
}
```

The server exposes the existing `webai_`, `research_`, sub-MCP tools, and resources over stdio; server name and version are read from `package.json`. See [`docs/MCP_SERVER.md`](docs/MCP_SERVER.md).

## NoeticBraid v3.2 first-phase scope

> (Recorded 2026-05-12, δ demo day-0, Part 2.C #7 — this is a deliberate scope
> record, not stale content.)

Per NoeticBraid first-phase MUP (`PROJECT_DEFINITION_v3.2.md` §5.2 / §10.4 and
Codex II audit Part 2.C #7 + Part 5 #4), only one capability is in
first-phase scope:

- ✅ **4-end basic health-check** for Claude Code CLI / Codex CLI / Gemini CLI
  / Gemini Web (the reference implementation SDD-D2-03 consumes — commit
  `f06b044`).

Out of first-phase scope (paused / deferred to phase 2+):

- ❌ Institutional research databases — violates v3.2 §4.
- ❌ Workflow executor / scheduled jobs — manual triggers only (v3.2 §10.4).
- ❌ ChatGPT Web / Claude Web adapters — first MVP end set is the 4 ends only
  (v3.2 §5.2).
- ❌ `WAH_AUTO_CONFIRM` auto-confirm flag — manual confirmation required for
  any send / download / export / delete / share / publish / pay /
  account-change action (v3.2 §7.2).

These remain in the repo for reference and future phases but **must not** be
wired into NoeticBraid first-phase code paths.

## Architecture

**Capability database** — SQLite (`better-sqlite3` when installed) at
`data/capability-hub.sqlite`, with a dependency-free JSON fallback. Stores
targets, profiles, page captures, UI elements, capabilities/versions,
workflow definitions/runs, run events, artifacts, site-registry entries,
scheduled jobs, policy events; maintains searchable capability text; JSON
import/export.

**CDP browser automation** — Playwright connects to visible
Chrome/Chromium/Edge over CDP, launching or reusing persistent profiles under
`data/browser-profiles/<profile>`. Pages read as structured snapshots (text,
elements, forms, tables, lists, iframes, selector candidates, optional
screenshot/accessibility). Tabs tracked through a registry for parallel work.

**Lite snapshot mode** — `browser:read`, `browser:screenshot`,
`capability:update`, and the snapshot path accept opt-in `--mode lite`
(~76% fewer bytes on typical landing pages, no loss of interactive labels).

**MCP server** — stdio (`node dist/src/cli.js mcp` / `npm run mcp`), exposing
browser, capability, workflow, site-registry, maintenance, the 81 `webai_`
and 120 per-DB `research_*` tools (plus `research_inventory_import`, 121 `research_`-prefixed rows), plus JSON resources.

**Workflow compiler & executor** — compiles YAML/JSON definitions into
concrete action plans, resolving abstract capability references to selectors.
Dry runs, workflow tests, approval gates; risky actions require explicit
approval.

**Download manager & artifacts** — captures browser-native downloads under
`data/downloads/`, records artifact metadata, keeps binary/runtime folders
out of git.

**Health-check system** — validates capability freshness vs current
selectors, reporting `ok` / `missing` / `ambiguous` / `blocked` /
`needs_review`, optionally `--apply`.

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
    researchdb/         legacy metadata bridge; per-DB MCP shims removed in v1.0
  observe/              Snapshot helpers, redaction, IP-login detection
  reader/               DOM/accessibility/screenshot/page snapshot extraction
  recipes/              YAML recipe loader and engine
  safety/               Policy/redaction helpers
  shared/               Shared TypeScript types
  utils/                Paths, schema, YAML, logger, optional imports
  workflows/            Workflow schema, compiler, executor, safety policy
configs/                Profile/target/refresh/adapter/recipe/contract config
scripts/                Catalog import and selector backfill scripts
tests/                  Node test-runner tests
data/                   Curated catalogs plus ignored runtime data/dbs/artifacts
dist/                   Compiled build output (git-ignored)
docs/                   Consumer contract, integration and workflow notes
examples/               Example workflows
fixtures/               Mock web-AI/research pages and sample registries
```

## CLI commands

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
  `browser:launch --profile <name> --cdp-port <port>` (never legacy
  `browser:start`).
- **Capability** — `capability:init-db` / `capability:update` /
  `capability:query` / `capability:import` / `capability:export` /
  `capability:health-check`.
- **Workflow** — `workflow:list` / `workflow:compile` / `workflow:test` /
  `workflow:run [--dry-run]`.
- **Research DB** — `research:<db>:search|filter|export` (`export` requires
  `--confirmed`) for each of the 40 wired databases.
- **MCP / registry** — `mcp` / `mcp:tools` / `mcp:resources` /
  `site:registry:import` / `site:capture-map` / `adapter:list` /
  `web-ai:adapters` / `recipe:list` / `snapshot:capture|diff` /
  `consumer:health` / `verify:docx-min`.

Every command supports `--json`. Default web-automation tab selection requires
an explicit `--tab-url-contains` or `--url`; the tools refuse to silently pick
`pages()[0]`.

## MCP tools & resources

Representative tools: `browser_launch`, `browser_status`, `browser_pages`,
`browser_open`, `browser_read`, `browser_screenshot`, the browser-action
tools, `capability_update`, `capability_query`, `capability_export`,
`workflow_compile`, `workflow_run`, `consumer_health`, plus the 81 `webai_*`
and 120 `research_*_{search,filter,export}` tools.

Resources: `capabilities://targets`, `capabilities://target/{targetId}`,
`capabilities://target/{targetId}/latest`, `workflows://definitions`,
`workflows://runs`, `browser-profiles://list`, `site-registry://sites`.

## Capability catalogs

Pre-cataloged sets for Gemini / Claude / ChatGPT migration and query
workflows are project deliverables and reproducibility anchors.

- **Gemini** — 612 capabilities (603 manually explored across canvas, image,
  video, audio, Deep Research, guided learning, Gems, personalization,
  sharing/export; 9 DOM-discovered selector-backed records).
- **Claude & ChatGPT** — same deliverable pattern with locale-paired JSON.
  Claude base `*.json` are English captures; ChatGPT base `*.json` are
  Chinese-locale captures; both keep `*.en.json` variants.

Tracked: `data/gemini_*.json`, `data/claude_*.json`, `data/chatgpt_*.json`,
`data/locale_diff_report.json`, `data/t30_article.txt`. Runtime/regenerated
files (SQLite, profiles, screenshots, downloads, logs, site maps, tab state,
`.runs/` evidence, `dist-*` outDirs) are git-ignored.

## Setup

**Prerequisites:** Node.js ≥ 20, `npm install`,
`npx playwright install chromium`, Chrome/Chromium with remote debugging.

**Managed browser launch** (routes through the project profile/CDP manager):

```bash
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini \
  --url https://gemini.google.com/app --cdp-port 9225 --json
```

`DISPLAY` + `XAUTHORITY` are mandatory on a remote host (otherwise Chrome
goes headless and Cloudflare blocks the live UI). Serialize multiple launches.

**Environment variables:**

```bash
export WAH_CDP_ENDPOINT=http://localhost:9222
export WAH_CONNECT_CDP=true
export WAH_SQLITE_PATH=data/capability-hub.sqlite
# optional:
export WAH_DEFAULT_PROFILE=gemini
export WAH_DATA_DIR=data
```

## Development

```bash
npm run build        # npm run clean && tsc -p tsconfig.json
npm test             # npm run build && node --test dist/tests/*.test.js
node dist/src/cli.js --help
node dist/src/cli.js mcp:tools --json
```

Heavy implementation (research-DB modules, deep refactors, verification
sweeps) is dispatched to Codex via `omx exec` with an auditable prompt file
under `.omc/codex-prompts/`; the in-repo session orchestrates, gates, and
keeps docs/contract in sync. See `CLAUDE.md` and
`docs/WORKFLOW_OMC_OMX_INTEGRATION.md`.

## Automated maintenance

The web UIs this project drives drift constantly, so it ships a **local-first**
maintenance loop (GitHub-hosted runners can't provide the visible Chrome +
`DISPLAY` + logged-in profiles these checks need). Full design in
[`docs/AUTOMATED_MAINTENANCE.md`](docs/AUTOMATED_MAINTENANCE.md).

**Sweep → file issue (read-only, safe)**

```bash
# local scheduled sweep: read GREEN targets from integration_registry → health-check → drift vs wall → dedup → file issue
scripts/maintenance-sweep.sh --service chatgpt,claude,gemini            # real run (files a GitHub issue on drift)
scripts/maintenance-sweep.sh --service chatgpt,claude,gemini --dry-run  # detect only, never file
```

- Files an issue only for **genuine selector drift** (`ELEMENT_NOT_FOUND` /
  `MODEL_SELECTION_DRIFT` / health-check `missing` / `ambiguous`).
- **Walls** (`LOGIN_REQUIRED` / `PLAN_OR_QUOTA_REQUIRED` / blocked) are recorded
  but never filed — §2.3 honest boundary; an environment wall is not a driver bug.
- Dedups before filing (skips if an open `drift` issue already matches the
  target), closes browsers when done, and writes via the fixer account's
  per-command token (never `gh auth switch`).
- Run daily via cron or a systemd timer (examples in the doc); keep IP-blocked
  databases like World Scientific at low frequency.

**Gated self-heal (optional, dry-run by default)**

```bash
scripts/issuefix-trigger.sh                    # dry-run: list open drift issues + write fix prompts
scripts/issuefix-trigger.sh --apply --limit 3  # real: dispatch Codex → mandatory gate → push
```

- Only `--apply` mutates anything. The mandatory gate requires `rm -rf dist &&
  npm run build` + `npm test` + 8-lock (`verify:contract-version` /
  `verify:golden` / `verify:generated-clean`) **all green** before it commits +
  pushes; `npm test` includes the live-CDP suites, so self-heal must run on the
  local machine with active browsers + login, otherwise those 27 live-CDP tests
  fail and trip needs-human (fail-safe — it never pushes a broken tree).
- Any gate failure adds a `needs-human` label + comment and **never** pushes; a
  dirty workspace outside `.runs/.omc` is refused outright.
- Commits use `git commit -F`, carry no auto-close keywords, and never
  force-push; the consumer (LT-0I) still validates and closes issues. See the doc
  for the unattended-push risk and its mitigations.

## Safety & data handling

- No CAPTCHA bypass, stealth tooling, credential entry, IP/proxy spoofing,
  billing/account changes, or public publishing during automation.
- Keep browser profiles, downloads, screenshots, local SQLite, tab
  registries, logs, site maps, and `.runs/` evidence out of git. Never commit
  `.env`, cookies, credentials, or exported profile data.
- Stop at login walls, CAPTCHAs, access denials, terms prompts, abnormal
  download warnings, or license-sensitive workflows — and surface a stable
  contract error code. No silent fallback, no locally synthesized artifact.
- Prefer fixture-based tests and dry runs. Risky actions require explicit
  confirmation.

## Contributing

This project uses an **orchestrator-dispatch** model: the in-repo session
plans, writes dispatch prompts, gates evidence, and keeps docs/contract in
sync; heavy implementation in `src/`, `tests/`, `configs/` is dispatched to
Codex (`omx exec`) and independently verified. Any new CLI/MCP/TS surface must
round-trip through `configs/consumer-contract.json` +
`docs/CONSUMER_CONTRACT.md` + `tests/consumerContract.test.ts` in the same
change. See `CLAUDE.md`. Every commit must keep: clean build = 0, `npm test`
offline-green (844/871; the other 27 are live-CDP, need an active browser), all
locks held, minimal `git diff --stat` scope.

## License

[Apache-2.0](LICENSE).
