# Standard MCP Server

`web-ai-research-automation-hub` ships a standard MCP stdio server for consumers that want to install the package as a release artifact and point an MCP client at a dedicated binary.

## Install from the release tarball

From a downloaded GitHub Release artifact:

```bash
npm i -g ./web-ai-research-automation-hub-0.7.0.tgz
web-ai-research-automation-hub-mcp
```

Or run the tarball without a global install:

```bash
npx -y --package ./web-ai-research-automation-hub-0.7.0.tgz web-ai-research-automation-hub-mcp
```

For local development from this repository, build first and run the same server through Node:

```bash
npm run build
node dist/src/mcp/stdio-entry.js
# equivalent legacy route:
node dist/src/cli.js mcp
```

## MCP client configuration

Generic `mcpServers` block:

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

Claude Desktop uses the same shape in `claude_desktop_config.json`:

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

## What the server exposes

The stdio server reports its name and version from `package.json` and exposes the existing MCP registry without changing tool behavior:

- `webai_` tools for ChatGPT, Claude, and Gemini automation.
- `research_` tools for research-database search/filter/export plus the inventory import tool.
- The existing sub-MCP tool family and MCP resources registered by the main server.

The server preserves the repository safety model: visible user-authorized browser sessions, no credential export, no silent fallback, and stable contract errors for blocked actions.
