# Capability database

`CapabilityDatabase` exposes a local repository API and migrations for these tables:

- `browser_profiles`
- `service_targets`
- `page_captures`
- `ui_elements`
- `capabilities`
- `capability_versions`
- `workflow_definitions`
- `workflow_runs`
- `run_events`
- `artifacts`
- `site_registry_entries`
- `scheduled_jobs`
- `policy_events`

When `better-sqlite3` is installed, migrations in `src/capabilities/migrations.ts` create SQLite tables and an FTS5 table. In the Web GPT environment, external npm install was unavailable, so the same API uses a local JSON fallback at `WAH_SQLITE_PATH` for tests and offline commands. The fallback is intentionally documented so the package remains buildable in constrained environments.

## Commands

```bash
node dist/src/cli.js capability:init-db --json
node dist/src/cli.js capability:query --target gemini --text "image generation" --json
node dist/src/cli.js capability:export --target gemini --out data/exports/gemini-capabilities.json --json
```

## JSON export/import

Exports include schema version, targets, captures, UI elements, capabilities, versions, workflow runs/events, artifacts, site registry entries, jobs, and policy events. Other local systems can read the exported JSON without linking against SQLite.
