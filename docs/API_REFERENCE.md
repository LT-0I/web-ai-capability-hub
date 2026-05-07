# API reference

Primary exports from `src/index.ts`:

- `ManagedBrowserLauncher`
- `ManagedCdpSessionManager` concept is represented by `ManagedBrowserLauncher` plus `BrowserSessionManager` for Playwright sessions.
- `BrowserProfileStore`
- `PageSnapshotReader`
- `CapabilityExtractor`
- `CapabilityDatabase`
- `CapabilityQueryService`
- `CapabilityUpdater`
- `WorkflowCompiler`
- `WorkflowExecutor`
- `AdapterRegistry` concept: `listAdapters`, `listWebAiAdapters`, `getWebAiAdapter`
- `RecipeRegistry` concept: `listRecipes`, `loadRecipeById`
- `SafetyPolicy`
- `ArtifactStore` concept: artifacts table and existing screenshot/download storage helpers
- `SiteRegistryImporter`

## CLI

Run `node dist/src/cli.js --help` for the command list. Every new machine-facing command supports `--json`.

## MCP

See `docs/MCP_INTEGRATION.md`.
