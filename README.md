# web-ai-capability-hub

A local-first TypeScript package for cataloging, querying, and executing web AI interface workflows through visible, user-authorized browser sessions.

## What is this

`web-ai-capability-hub` is a TypeScript package that:

- Catalogs web AI interface capabilities (Gemini, ChatGPT, Claude) via CDP browser automation.
- Stores capability metadata in SQLite for a queryable knowledge base, with JSON fallback/export support.
- Provides an MCP server for AI assistants to query capabilities and execute browser workflows.
- Supports parallel tab orchestration for multi-task automation.
- Connects to institutional research databases such as CNKI, Web of Science (WoS), PubMed, Scopus, and IEEE Xplore.

The package is designed for personal/local development and authorized research workflows. It does **not** bypass logins, paywalls, CAPTCHAs, bot checks, rate limits, license restrictions, or service terms. Users authenticate manually in a normal visible browser profile; this project reuses that profile through Chrome DevTools Protocol (CDP) without exporting cookies or credentials.

### v3.2 NoeticBraid first-phase scope (recorded 2026-05-12, δ demo day-0, Part 2.C #7)

For NoeticBraid first-phase MUP (per `PROJECT_DEFINITION_v3.2.md` §5.2 / §10.4 and Codex II audit Part 2.C #7 + Part 5 #4), only one capability of this hub is in first-phase scope:

- ✅ **4-end basic health-check** for Claude Code CLI / Codex CLI / Gemini CLI / Gemini Web (this is the reference implementation that SDD-D2-03 capability real health-check at `noeticbraid/packages/noeticbraid-backend/.../capability_registry.py` consumes — commit `f06b044`).

The following hub features are **out of NoeticBraid first-phase scope** (paused / deferred to phase 2 or later):

- ❌ Institutional research databases (CNKI / Web of Science / PubMed / Scopus / IEEE Xplore) — violates v3.2 §4 "External Reference Pool only stores AI meta-knowledge, not domain knowledge" (line 110-112).
- ❌ Workflow executor / scheduled jobs — first phase only allows manual triggers (v3.2 §10.4 cron deferred).
- ❌ ChatGPT Web adapter / Claude Web adapter — first MVP end set is Claude Code CLI / Codex CLI / Gemini CLI / Gemini Web only (v3.2 §5.2); ChatGPT Pro is on hold.
- ❌ `WAH_AUTO_CONFIRM` automatic-confirmation flag for risky actions — first phase requires manual confirmation for any send / download / export / delete / share / publish / pay / account-change action (v3.2 §7.2 user-subject red line).

These features remain in this hub repo for reference and future-phase work, but **must not** be wired into NoeticBraid first-phase code paths.

## Architecture

### Capability database

- Uses SQLite (`better-sqlite3` when installed) at `data/capability-hub.sqlite` by default.
- Provides a dependency-free JSON fallback if SQLite is unavailable.
- Stores service targets, browser profiles, page captures, UI elements, capabilities, capability versions, workflow definitions/runs, run events, artifacts, site registry entries, scheduled jobs, and policy events.
- Maintains searchable capability text for fast capability lookup and query workflows.
- Supports JSON import/export for migration, backfills, and reproducible catalog updates.

### CDP browser automation

- Uses Playwright to connect to visible Chrome/Chromium/Edge sessions over CDP.
- Launches or reuses project-managed persistent profiles under `data/browser-profiles/<profile>`.
- Reads pages as structured snapshots: text, elements, forms, tables, lists, iframes, selector candidates, and optional screenshots/accessibility details.
- Tracks tabs through a registry for parallel automation and multi-task workflows.

### Lite snapshot mode

`browser:read`, `browser:screenshot`, `capability:update`, and the snapshot capture path accept an opt-in `--mode=lite` flag (e.g. `node dist/src/cli.js browser:read --tab-id main --mode=lite --json`) that drops non-interactive text, accessibility tree, empty/default fields, and the screenshot payload. Reduces output bytes by ~76% on typical web AI landing pages with no loss of interactive element labels. The default mode is unchanged — lite is opt-in.

### MCP server

- Runs over stdio with `node dist/src/cli.js mcp` or `npm run mcp`.
- Exposes browser, capability, workflow, site-registry, and maintenance tools to MCP clients.
- Exposes JSON resources for targets, capabilities, workflow runs, browser profiles, and research site registry entries.

### Workflow compiler and executor

- Compiles YAML/JSON workflow definitions into concrete browser action plans.
- Resolves abstract capability references to selectors and action metadata from the capability database.
- Supports dry runs, workflow tests, execution results, and approval gates.
- Requires explicit approval for risky actions such as sending prompts, downloads/exports, deletes, publishing/sharing, purchases, account changes, and bulk operations.

### Download manager and artifacts

- Captures browser-native downloads under `data/downloads/`.
- Records artifact metadata in the capability database.
- Keeps binary/runtime download folders out of git.

### Health-check system

- Validates capability freshness against current UI selectors.
- Reports `ok`, `missing`, `ambiguous`, `blocked`, and `needs_review` states.
- Can optionally apply status updates back to the capability database with `--apply`.

## Project layout

```text
src/                    TypeScript source
  actions/              Browser action execution and confirmation policy
  adapters/             Web AI adapters and research database importers
  artifacts/            Artifact metadata helpers
  browser/              Managed CDP launcher, profiles, tabs, sessions, downloads
  capabilities/         SQLite/JSON database, schema, migrations, extractor, updater
  maintenance/          Site-map capture/diff/probe utilities
  mcp/                  MCP server, tools, resources, schemas
  observe/              Snapshot helpers, redaction, IP-login detection
  reader/               DOM/accessibility/screenshot/page snapshot extraction
  recipes/              YAML recipe loader and engine
  safety/               Policy/redaction helpers
  shared/               Shared TypeScript types
  utils/                Paths, schema, YAML, logger, optional imports
  workflows/            Workflow schema, compiler, executor, safety policy
configs/                Browser profile, target, refresh, adapter, and recipe config
scripts/                Catalog import and selector backfill scripts
tests/                  Node test-runner tests
data/                   Curated catalogs plus ignored runtime data/dbs/artifacts
dist/                   Compiled build output (ignored by git)
docs/                   API and integration notes
examples/               Example workflows
fixtures/               Mock web AI/research pages and sample registries
```

## Key CLI commands

Build first when running from source:

```bash
npm run build
node dist/src/cli.js --help
```

### Browser commands

- `browser:click --tab-id <id> --selector <sel> [--expect-download] [--ms <ms>] [--json]` — click an element; optionally capture a download triggered by the click
- `browser:close --profile <name> --mode disconnect|close-process|leave-open [--json]` — disconnect from, preserve, or close a managed browser process.
- `browser:download-url --url <url> [--filename <name>] [--tab-id <id>] [--json]` — fetch a direct URL through the tab's request context and save under `data/downloads/`
- `browser:downloads [--profile <name>] [--limit <n>] [--json]` — list downloads tracked by the project's download manager
- `browser:drag --selector <sel> [--from-offset x,y] [--to-offset x,y] [--from x,y] [--to x,y] [--steps <n>] [--hold-ms <ms>] [--json]` — real mouse-drag (mousedown→move→mouseup) for selection-triggered toolbars
- `browser:hover --selector <sel> [--ms <ms>] [--json]` — hover over an element to surface tooltips and hover-revealed controls
- `browser:launch --profile <name> [--url <url>] [--cdp-port <port>] [--json]` — launch or reuse a visible managed browser profile.
- `browser:open <url> [--tab-id <id>] [--json]` — open a URL in the active browser/session or registered tab.
- `browser:pages --profile <name> [--json]` — list browser pages/tabs visible through the managed CDP connection.
- `browser:press --tab-id <id> --selector <sel> --key <key> [--json]` — press a keyboard key inside an element
- `browser:profiles [--json]` — list stored profile metadata.
- `browser:read [--url <url>] [--tab-id <id>] [--mode full|lite] [--json]` — capture a structured snapshot of the active page.
- `browser:screenshot [--url <url>] [--tab-id <id>] [--mode full|lite] [--json]` — capture a page snapshot with screenshot output.
- `browser:select --tab-id <id> --selector <sel> --value <value> [--json]` — choose a value in a `<select>`
- `browser:select-text --selector <sel> [--start <int>] [--end <int>] [--json]` — programmatically select text inside an element via DOM Range API
- `browser:status --profile <name> [--json]` — inspect managed browser executable/profile/CDP state.
- `browser:tab:alloc --profile <name> --url <url> --tab-id <id> [--json]` — allocate a named tab for parallel work.
- `browser:tab:free --tab-id <id> [--json]` — release a registered tab.
- `browser:tab:list --profile <name> [--json]` — list registered tab sessions.
- `browser:type --tab-id <id> --selector <sel> --text <text> [--json]` — type text into an element
- `browser:upload --tab-id <id> --selector <sel> --file <path> [--file <path> ...] [--json]` — upload one or more files to an `<input type="file">`
- `browser:wait --tab-id <id> [--selector <sel>] [--ms <ms>] [--state visible|hidden|attached|detached] [--json]` — wait for selector state or time

### Capability commands

- `capability:init-db [--json]` — initialize the SQLite/JSON capability database.
- `capability:update --target <id> --profile <name> [--kind web-ai|research-database] [--fixture <html>] [--tab-id <id>] [--mode full|lite] [--json]` — discover capabilities from a live page or fixture and store them.
- `capability:query --target <id> --text <query> [--category <category>] [--limit <n>] [--json]` — search capability records.
- `capability:import <file.json> [--json]` — import capability database JSON.
- `capability:export --target <id> --out <path> [--json]` — export database records, optionally filtered by target.
- `capability:health-check --target <id> --profile <name> [--url <url>] [--apply] [--json]` — validate selectors/status for existing capability records and optionally apply updates.

### Workflow commands

- `workflow:list [--json]` — list available workflow YAML/JSON files.
- `workflow:compile <workflow.yaml|json> [--json]` — compile abstract workflow steps into concrete browser actions.
- `workflow:test <workflow.yaml|json> [--json]` — compile and report approval gates without executing.
- `workflow:run <workflow.yaml|json> [--dry-run] [--json]` — dry-run or execute a workflow through the browser executor.

### MCP and registry commands

- `mcp` — start the MCP server over stdio.
- `mcp:tools [--json]` — list MCP tools and input schemas.
- `mcp:resources [--json]` — list MCP resources.
- `site:registry:import <site_registry.json> [--json]` — import institutional research database registry entries.
- `site:capture-map --site <id> [--profile research-default] [--fixture <html>] [--json]` — capture a versioned site map for selector maintenance.
- `adapter:list [--json]` — list configured adapters.
- `web-ai:adapters [--json]` — list built-in web AI adapters.
- `recipe:list [--json]` and `recipe <id> --key value` — inspect and run YAML recipes.
- `snapshot:capture --site <site> [--url <url>] [--tab-id <id>]` — capture a site map from a snapshot.
- `snapshot:diff --site <site> --previous <path> --current <path>` — compare site-map snapshots.

## MCP tools

When running as an MCP server, the package exposes these key tools:

- `browser_launch` — launch or reuse a project-managed visible Chrome/Edge profile through CDP.
- `browser_status` — return browser executable, profile, endpoint, page, and connection state.
- `browser_pages` — list open browser tabs/pages.
- `browser_open` — open a URL in the active visible browser page.
- `browser_read` — read the active page as structured text/elements/forms/tables/lists/iframes/snapshot data.
- `browser_screenshot` — capture a full-page screenshot path.
- `browser_click`, `browser_type`, `browser_select`, `browser_press`, `browser_wait` — execute browser actions with confirmation policy support.
- `browser_downloads` — list downloads tracked by the browser download manager.
- `browser_run_recipe` — run a YAML recipe from `configs/recipes`.
- `browser_capture_site_map` — capture a versioned site map for adapter maintenance.
- `browser_update_adapter_notes` — append adapter maintenance notes under `configs/adapters/notes/`.
- `capability_update` — discover capabilities/UI elements and store them in the local database.
- `capability_query` — search stored capabilities by target/category/text.
- `capability_export` — export capability database records as JSON.
- `workflow_compile` — compile a workflow file into an executable action plan.
- `workflow_run` — run or dry-run a workflow with safety gates.
- `workflow_execute` — compile or execute inline workflows or precompiled plans.
- `site_registry_import` — import research database site registry entries.
- `site_capture_map` — capture site maps from live pages or fixtures.

MCP resources include:

- `capabilities://targets`
- `capabilities://target/{targetId}`
- `capabilities://target/{targetId}/latest`
- `workflows://definitions`
- `workflows://runs`
- `browser-profiles://list`
- `site-registry://sites`

## Capability catalogs

This repository includes pre-cataloged capability sets for Gemini, Claude, and ChatGPT migration and query workflows. The catalogs are project deliverables and reproducibility anchors, even when they are too large for convenient day-to-day diffs.

### Gemini

- 612 Gemini capabilities are pre-cataloged.
- 603 capabilities were manually explored across Gemini UI areas such as canvas, image generation, video generation, audio, Deep Research, guided learning, Gems, personalization, sharing/export, and related workflows.
- 9 DOM-discovered capabilities include selector-backed records for automation and health checking.
- Source: T6-T9 deep exploration sessions, with later T30 validation artifacts.

### Claude and ChatGPT

Claude and ChatGPT catalogs follow the same deliverable pattern with locale-paired JSON files for feature inventory, live feature tests, full/deep/remaining/unexplored catalogs, manual capability exports, and verification reports. Claude and ChatGPT keep parallel English-locale variants in `*.en.json`; ChatGPT's base `*.json` files are Chinese-locale captures, while Claude's base `*.json` files are English captures.

Tracked catalog files include:

- `data/gemini_*.json`
- `data/claude_*.json`
- `data/chatgpt_*.json`
- `data/locale_diff_report.json`
- `data/t30_article.txt`

Ignored regenerated/runtime files include SQLite databases, browser profiles, screenshots, downloads, logs, site maps, tab runtime state, and other bulky data artifacts.

If you do not need local catalog history while working on code, you can ask Git to ignore catalog working-tree changes locally without untracking them for everyone else:

```bash
git update-index --skip-worktree data/*.json
```

Use `git update-index --no-skip-worktree data/*.json` before intentionally refreshing catalog deliverables.

## Linux setup

### Prerequisites

- Node.js 18+ (Node.js 20+ is recommended because `package.json` currently declares `>=20.0.0`).
- `npm install`
- `npx playwright install chromium`
- Chrome/Chromium with remote debugging enabled.

### Linux Chrome launch

Launch Chrome or Chromium manually when you want to attach through an existing CDP endpoint:

```bash
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=./data/browser-profiles/gemini \
  --no-first-run --no-default-browser-check
```

On distributions where the binary is named differently, use `chromium`, `chromium-browser`, or the path printed by your package manager.

### Environment variables

```bash
export WAH_CDP_ENDPOINT=http://localhost:9222
export WAH_CONNECT_CDP=true
export WAH_SQLITE_PATH=data/capability-hub.sqlite
```

Useful optional variables:

```bash
export WAH_DEFAULT_PROFILE=gemini
export WAH_DATA_DIR=data
```

### Fresh Linux install flow

```bash
git clone https://github.com/<username>/web-ai-capability-hub.git
cd web-ai-capability-hub
npm install
npx playwright install chromium
npm run build
npm test
```

Then start a visible profile and complete login manually:

```bash
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
```

After login, initialize/import/query capabilities as needed:

```bash
node dist/src/cli.js capability:init-db --json
node dist/src/cli.js capability:import data/gemini_manual_capabilities.json --json
node dist/src/cli.js capability:query --target gemini --text "image generation" --json
```

## Development

```bash
npm run build
npm test
node dist/src/cli.js --help
```

Additional useful commands:

```bash
node dist/src/cli.js mcp:tools --json
node dist/src/cli.js capability:health-check --target gemini --profile gemini --json
node dist/src/cli.js workflow:compile examples/workflows/gemini-image-draft.yaml --json
node dist/src/cli.js workflow:run examples/workflows/gemini-image-draft.yaml --dry-run --json
```

## Safety and data handling

- Keep browser profiles, downloads, screenshots, local SQLite databases, tab registries, logs, and site maps out of git.
- Do not commit `.env` files, cookies, credentials, or exported browser profile data.
- Use fixture-based tests and dry runs whenever possible.
- Stop automation at login walls, CAPTCHAs, access denials, terms prompts, abnormal download warnings, or license-sensitive workflows.

## License

Apache-2.0. See `LICENSE`.
