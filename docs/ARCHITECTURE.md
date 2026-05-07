# Architecture

The package is layered so local agents can use browser capability data without depending on fragile selectors or private browser state.

## Layers

1. **Managed CDP Browser Layer**: `ManagedBrowserLauncher`, `BrowserProfileStore`, executable discovery, CDP health checks, page listing, safe close/disconnect. Profiles live under `data/browser-profiles/<profile>`.
2. **Page Observation Layer**: `PageSnapshotReader`, DOM extraction, accessibility summary, selector candidates, redaction, screenshots. Existing `reader/*` modules remain for backward compatibility; `observe/*` wraps the new API names.
3. **Capability Intelligence Layer**: `CapabilityExtractor` transforms snapshots into normalized capabilities such as `enter_prompt`, `open_image_generation`, `upload_file`, `download_or_export`, `enter_search_query`, and `read_results_metadata`.
4. **Capability Database Layer**: `CapabilityDatabase` initializes SQLite schema/migrations when `better-sqlite3` is installed and otherwise uses a local JSON fallback with the same repository API for constrained environments.
5. **Adapter and Recipe Layer**: Web AI adapters for ChatGPT, Claude, Gemini; research registry importer and generic research database adapter; legacy recipe engine preserved.
6. **Workflow Compiler Layer**: `WorkflowCompiler` loads YAML/JSON workflows and resolves abstract `use_capability` steps against the latest database records.
7. **Workflow Executor Layer**: `WorkflowExecutor` runs dry-runs without a browser or executes plans through `ActionExecutor` with safety gates.
8. **Integration Layer**: CLI, MCP tools/resources, and TypeScript exports from `src/index.ts`.

## Data flow

```text
visible browser -> page snapshot -> capability extractor -> capability database
capability database + workflow YAML -> compiler -> action plan -> executor -> run_events/artifacts/policy_events
```

## Storage layout

```text
data/browser-profiles/<profile>/   Persistent browser profile data; never copy cookies between profiles
data/capability-hub.sqlite         SQLite DB when better-sqlite3 is installed; JSON fallback in constrained envs
data/exports/                      JSON exports for other packages
data/site-maps/                    Snapshot-based UI maps for adapter maintenance
data/screenshots/                  Optional screenshots/evidence
data/downloads/                    Official browser downloads
```

## Boundaries

Browser-specific code does not import database code except in integration commands. Database code does not require Playwright. Workflow compilation can run offline against fixture-populated capability data. Safety policy is centralized in `src/workflows/safetyPolicy.ts` and `src/actions/confirmationPolicy.ts`.
