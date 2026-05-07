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

- `browser:launch --profile <name> [--url <url>] [--cdp-port <port>] [--json]` — launch or reuse a visible managed browser profile.
- `browser:open <url> [--tab-id <id>] [--json]` — open a URL in the active browser/session or registered tab.
- `browser:read [--url <url>] [--tab-id <id>] [--json]` — capture a structured snapshot of the active page.
- `browser:screenshot [--url <url>] [--tab-id <id>] [--json]` — capture a page snapshot with screenshot output.
- `browser:status --profile <name> [--json]` — inspect managed browser executable/profile/CDP state.
- `browser:pages --profile <name> [--json]` — list browser pages/tabs visible through the managed CDP connection.
- `browser:tab:alloc --profile <name> --url <url> --tab-id <id> [--json]` — allocate a named tab for parallel work.
- `browser:tab:list --profile <name> [--json]` — list registered tab sessions.
- `browser:tab:free --tab-id <id> [--json]` — release a registered tab.
- `browser:close --profile <name> --mode disconnect|close-process|leave-open [--json]` — disconnect from, preserve, or close a managed browser process.
- `browser:profiles [--json]` — list stored profile metadata.

### Capability commands

- `capability:init-db [--json]` — initialize the SQLite/JSON capability database.
- `capability:update --target <id> --profile <name> [--kind web-ai|research-database] [--fixture <html>] [--tab-id <id>] [--json]` — discover capabilities from a live page or fixture and store them.
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

## Gemini capability database

This repository includes a pre-cataloged Gemini capability set for migration and query workflows:

- 612 Gemini capabilities are pre-cataloged.
- 603 capabilities were manually explored across Gemini UI areas such as canvas, image generation, video generation, audio, Deep Research, guided learning, Gems, personalization, sharing/export, and related workflows.
- 9 DOM-discovered capabilities include selector-backed records for automation and health checking.
- Source: T6-T9 deep exploration sessions, with later T30 validation artifacts.

Tracked catalog files:

- `data/gemini_full_catalog.json`
- `data/gemini_canvas_deepresearch_catalog.json`
- `data/gemini_unexplored_catalog.json`
- `data/gemini_remaining_catalog.json`
- `data/gemini_manual_capabilities.json`
- `data/t30_article.txt`

Ignored regenerated/runtime files include SQLite databases, browser profiles, screenshots, downloads, logs, site maps, tab runtime state, and other bulky data artifacts.

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
