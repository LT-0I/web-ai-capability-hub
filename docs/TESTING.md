# Testing

Run:

```bash
npm run build
npm test
```

Tests avoid real web AI accounts and paid databases. They cover:

- Browser launch argument construction.
- Executable discovery with mocked executable path.
- CDP `/json/version` and `/json/list` parsing with a mock HTTP server.
- Browser profile store persistence.
- Snapshot extraction from mock web AI and research database fixtures.
- Capability extraction, database CRUD, text query, JSON export/import, and version records.
- Site registry import from uploaded reference path when present or fixture copy otherwise.
- Workflow YAML parsing, compilation, safety gates, and dry-run execution.
- MCP tool schemas.
- Legacy actions, adapters, recipes, downloads, page registry, and site-map diff.

Real browser tests are manual because they require installed Chrome/Edge, visible browser display, and user login.
