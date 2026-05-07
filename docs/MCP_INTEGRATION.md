# MCP integration

Start the MCP server:

```bash
npm run mcp
```

Tools:

- `browser_launch`
- `browser_status`
- `browser_open`
- `browser_pages`
- `browser_read`
- `capability_update`
- `capability_query`
- `capability_export`
- `workflow_compile`
- `workflow_run`
- `site_registry_import`
- `site_capture_map`

Resources:

- `capabilities://targets`
- `capabilities://target/{targetId}`
- `capabilities://target/{targetId}/latest`
- `workflows://definitions`
- `workflows://runs`
- `browser-profiles://list`
- `site-registry://sites`

Example local client configuration:

```json
{
  "mcpServers": {
    "web-ai-research-automation-hub": {
      "command": "node",
      "args": ["/absolute/path/to/web-ai-research-automation-hub/dist/src/cli.js", "mcp"],
      "env": { "WAH_DEFAULT_PROFILE": "gemini" }
    }
  }
}
```
