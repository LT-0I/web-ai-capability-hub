# Consumer Contract

Package: `web-ai-research-automation-hub` v0.2.0  
Contract: `consumer-contract-1.0.0`

This document is the versioned public integration contract for packages that consume the hub as a dependency. It adds a small consumer-safe layer without changing the existing safety policy, manual-login boundary, confirmation policy, or any existing CLI/MCP tool behavior.

## Public surfaces

The contract covers three surfaces:

1. **CLI**: colon-style commands, for example `consumer:health`.
2. **MCP**: underscore-style tools/resources, for example `consumer_health`.
3. **TypeScript API**: direct imports from the package barrel, for example `consumerHealth`.

Unlisted commands remain developer/automation surfaces documented elsewhere and are not schema-stable under this consumer contract.

## Consumer-safe health probe

`consumer:health` is the preferred health-check entry point for NoeticBraid and other safe consumers. It reads managed browser status/page metadata and returns a deliberately narrow JSON object. It must not include CDP endpoints, websocket debugger URLs, browser profile directories, executable paths, cookies, tokens, account identifiers, DOM/HTML, screenshots, or raw snapshots.

```bash
node dist/src/cli.js consumer:health --target chatgpt --profile chatgpt --json
```

TypeScript:

```ts
import { consumerHealth } from "web-ai-research-automation-hub";

const result = await consumerHealth({ target: "chatgpt", profile: "chatgpt" });
```

Stable JSON keys are exactly:

| Key | Type | Guarantee |
| --- | --- | --- |
| `ok` | boolean | Always present; true only when the target page appears available and unblocked. |
| `target` | string | Always present; echoes the requested target id. |
| `profile` | string | Always present; echoes the requested profile name. |
| `connected` | boolean | Always present; true when the managed CDP endpoint is reachable. |
| `pageCount` | number | Always present; count only, never page URLs or titles. |
| `loginLikeState` | `healthy` \| `unhealthy` \| `not_implemented` | Always present; conservative login-like signal from safe metadata only. |
| `status` | `ok` \| `missing` \| `blocked` \| `needs_review` | Always present; consumer summary status. |
| `errorCode` | error code or null | Always present; one of the taxonomy below, or null when healthy. |
| `message` | string | Always present; short safe human-readable text. |
| `checkedAt` | ISO-8601 string | Always present. |

## CLI / MCP / TypeScript mapping

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `consumer:health` | `consumer_health` | `consumerHealth` | stable | read | no |
| `browser:status` | `browser_status` | `ManagedBrowserLauncher.status` | stable | read | yes |
| `browser:pages` | `browser_pages` | `ManagedBrowserLauncher.pages` | stable | read | yes |
| `capability:query` | `capability_query` | `CapabilityDatabase.queryCapabilities` | experimental | read | no |
| `capability:export` | `capability_export` | `CapabilityDatabase.exportJson` | experimental | read | yes |
| `capability:update` | `capability_update` | `CapabilityUpdater.updateFromSnapshot` | experimental | mutate | yes |
| `workflow:compile` | `workflow_compile` | `WorkflowCompiler.compileFile` | experimental | read | yes |
| `workflow:run` | `workflow_run` | `WorkflowExecutor.runFile` | experimental | risky | yes |
| `browser:read` | `browser_read` | `readPageSnapshot` | experimental | read | yes |
| `browser:screenshot` | `browser_screenshot` | `readPageSnapshot({ screenshot: true })` | experimental | read | yes |
| `browser:launch` | `browser_launch` | `ManagedBrowserLauncher.launch` | experimental | mutate | yes |
| `browser:open` | `browser_open` | `BrowserSessionManager.open` | experimental | mutate | yes |
| `mcp:tools` | n/a | `listMcpTools` | stable | read | no |
| `mcp:resources` | n/a | `listMcpResources` | stable | read | no |

## MCP resources

| Resource URI | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- |
| `capabilities://targets` | `readMcpResource` | experimental | read | no |
| `capabilities://target/{targetId}` | `readMcpResource` | experimental | read | no |
| `capabilities://target/{targetId}/latest` | `readMcpResource` | experimental | read | yes |
| `workflows://definitions` | `readMcpResource` | experimental | read | yes |
| `workflows://runs` | `readMcpResource` | experimental | read | yes |
| `browser-profiles://list` | `readMcpResource` | experimental | read | yes |
| `site-registry://sites` | `readMcpResource` | experimental | read | no |

## Stable JSON output guarantees

### `consumer:health` / `consumer_health` / `consumerHealth`

Always returns the exact keys listed in the health-probe table above. Optional raw browser fields are never included.

### `browser:status` / `browser_status` / `ManagedBrowserLauncher.status`

This is a raw compatibility surface. Always-present keys: `profile`, `profileDir`, `cdpEndpoint`, `cdpPort`, `connected`, `launchedByPackage`. Optional keys: `executablePath`, `processId`, `pages`, `browser`, `webSocketDebuggerUrl`, `lastError`. Safe consumers must strip forbidden fields before logging, storing, or returning this output.

### `browser:pages` / `browser_pages` / `ManagedBrowserLauncher.pages`

Returns an array. Page entries may contain `id`, `type`, `title`, `url`, and `webSocketDebuggerUrl`. Safe consumers must strip page URLs/titles and debugger URLs unless they have an explicit local-only need.

### `mcp:tools` and `mcp:resources`

Return MCP tool/resource definitions for introspection. These definitions do not include runtime browser secrets.

## Forbidden output fields for safe consumers

Safe consumers must strip these fields defensively even when using consumer-safe surfaces:

- `cdpEndpoint`
- `webSocketDebuggerUrl`
- `profileDir`
- `profile_dir`
- `executablePath`
- `executable_path`
- `cookies`
- `cookie`
- `tokens`
- `token`
- `Authorization`
- `authorization`
- `accountEmail`
- `account_email`
- `email`
- `dom`
- `html`
- `screenshot`
- `screenshotPath`
- `rawSnapshot`
- `snapshot`

The safe `consumer:health` surface is designed not to emit those fields, but downstream re-sanitization is still recommended for defense in depth.

## Error code taxonomy

Consumer-stable error codes are:

- `HUB_NOT_BUILT`
- `BROWSER_NOT_LAUNCHED`
- `PROFILE_NOT_FOUND`
- `TARGET_PAGE_MISSING`
- `LOGIN_REQUIRED`
- `CAPABILITY_DB_NOT_INIT`
- `COMMAND_TIMEOUT`
- `INVALID_ARGS`
- `INVALID_JSON`
- `POLICY_APPROVAL_REQUIRED`
- `UNKNOWN`

`message` remains human-readable and may change wording within a contract major version. Consumers should branch on `errorCode`, not `message`.

## Backward compatibility promise

Within contract major version `1.x`, stable command/tool/resource schemas will not remove always-present keys, rename keys, or change enum values. Optional keys may be added only when they do not expose forbidden fields on safe surfaces. Experimental surfaces can change across minor package releases and should be wrapped with local sanitization and tolerant parsing.
