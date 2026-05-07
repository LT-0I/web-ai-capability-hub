# Developer guide

## Local development

```bash
npm install
npm run build
npm test
```

The code avoids direct imports from optional dependencies so TypeScript can build in constrained environments. Runtime integrations use `optionalRequire` and provide clear errors when a real browser/MCP server requires dependencies.

## Adding modules

Keep layers separate. Browser code should not require capability database internals. Database code should not import Playwright. Workflow code should compile without a real browser.

## Fixtures

Add fixture HTML under `fixtures/` for every new adapter or workflow. Tests should use fixtures and mocks, not real logged-in accounts.
