# Consumer Contract

Package: `web-ai-research-automation-hub` v0.5.0
Contract: `consumer-contract-1.3.0`

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
| `browser:audit` | n/a | `auditProfiles` | experimental | read | yes |
| `browser:read` | `browser_read` | `readPageSnapshot` | experimental | read | yes |
| `browser:screenshot` | `browser_screenshot` | `readPageSnapshot({ screenshot: true })` | experimental | read | yes |
| `browser:launch` | `browser_launch` | `ManagedBrowserLauncher.launch` | experimental | mutate | yes |
| `browser:open` | `browser_open` | `BrowserSessionManager.open` | experimental | mutate | yes |
| `browser:click` | n/a | `ActionExecutor.execute({type:"click"})` | experimental | mutate | yes |
| `browser:upload` | n/a | `ActionExecutor.execute({type:"upload"})` | experimental | risky | yes |
| `browser:wait` | n/a | `ActionExecutor.execute({type:"wait"})` | experimental | read | yes |
| `browser:artifact-click` | n/a | `runArtifactClick` | experimental | risky | yes |
| `mcp:tools` | n/a | `listMcpTools` | stable | read | no |
| `mcp:resources` | n/a | `listMcpResources` | stable | read | no |



### Contract 1.3.0 webai MCP tools

Contract 1.3.0 adds 13 experimental webai tools, implemented as service-specific CLI commands, MCP tools, and TypeScript exports. Design source: `.runs/web-ai-explore/stream4-mcp-design.md`.

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:chatgpt:send-prompt` | `webai_chatgpt_send_prompt` | `webAiChatgptSendPrompt` | experimental | read | no |
| `webai:claude:send-prompt` | `webai_claude_send_prompt` | `webAiClaudeSendPrompt` | experimental | read | no |
| `webai:gemini:send-prompt` | `webai_gemini_send_prompt` | `webAiGeminiSendPrompt` | experimental | read | no |
| `webai:chatgpt:upload-and-query` | `webai_chatgpt_upload_and_query` | `webAiChatgptUploadAndQuery` | experimental | mutate | no |
| `webai:claude:upload-and-query` | `webai_claude_upload_and_query` | `webAiClaudeUploadAndQuery` | experimental | mutate | no |
| `webai:gemini:upload-and-query` | `webai_gemini_upload_and_query` | `webAiGeminiUploadAndQuery` | experimental | mutate | no |
| `webai:chatgpt:generate-file` | `webai_chatgpt_generate_file` | `webAiChatgptGenerateFile` | experimental | mutate | no |
| `webai:claude:generate-file` | `webai_claude_generate_file` | `webAiClaudeGenerateFile` | experimental | mutate | no |
| `webai:chatgpt:generate-image` | `webai_chatgpt_generate_image` | `webAiChatgptGenerateImage` | experimental | mutate | no |
| `webai:gemini:generate-image` | `webai_gemini_generate_image` | `webAiGeminiGenerateImage` | experimental | mutate | no |
| `webai:gemini:canvas-to-docs` | `webai_gemini_canvas_to_docs` | `webAiGeminiCanvasToDocs` | experimental | mutate | no |
| `webai:gemini:generate-video` | `webai_gemini_generate_video` | `webAiGeminiGenerateVideo` | experimental | risky | no |
| `webai:task-status` | `webai_task_status` | `webAiTaskStatus` | experimental | read | no |

`webai:gemini:generate-video` is asynchronous. It returns `{ task_id, status, profile, lease_id, started_at }` immediately; callers poll `webai:task-status --task-id <id>` / `webai_task_status({ task_id })` for `{ status, progress_label?, result?, errorCode? }`. The v1.3.0 registry is in-memory only: restarting the MCP server abandons in-flight task metadata. Mutating webai tools serialize per profile; a concurrent same-profile mutation returns `PROFILE_LEASE_BUSY`, while different profiles may proceed in parallel.

Webai send-prompt outputs always include `wait_ms` and `completion_detected`; ChatGPT and Gemini send-prompt also include `reuse_conversation`. Gemini completion is detected from Gemini response containers plus streaming-indicator disappearance, not ChatGPT DOM selectors. If `completion_detected` is false, callers must treat `errorCode`/`error_code` as authoritative and must not interpret `response_text` as a partial answer. Login prechecks return structured `LOGIN_REQUIRED` failures before prompt-input locator waits.

Per-tool send-prompt output keys:

| Tool | Always-present output keys | Structured-failure optional keys |
| --- | --- | --- |
| `webai:chatgpt:send-prompt` / `webai_chatgpt_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `reuse_conversation`, `errorCode` | `ok`, `service`, `error_code` |
| `webai:claude:send-prompt` / `webai_claude_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `elapsed_ms`, `wait_ms`, `completion_detected`, `errorCode` | `ok`, `service`, `error_code` |
| `webai:gemini:send-prompt` / `webai_gemini_send_prompt` | `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `reuse_conversation`, `errorCode` | `ok`, `service`, `error_code` |

Artifact download outputs now include `download_filename` when the browser suggested filename is materialized on disk. If Chrome omits `suggestedFilename`, generate-file paths use `download-<sha256[:12]>.<expected-ext>` and include a `WARN` field. Gemini upload selector failures include `selector` / `expected_selector`; Gemini image download failures include `expected_selector`.

Webai outputs are redacted by schema: they must not include account email, local browser profile paths, CDP/websocket endpoints, cookies/tokens, screenshot bytes/paths, raw DOM, raw HTML, or conversation URLs except the explicitly contracted `chat_url` fields. Prompt text requesting public publishing, collaborator invites, connector enablement, billing/account changes, or scheduled actions returns `POLICY_APPROVAL_REQUIRED`. Publish-class labels such as `Share conversation`, `Create public link`, `Publish`, `Make public`, and `Share Canvas` are denied before click with `AUTO_PUBLISH_DETECTED`. Gemini export-adjacent flows perform a post-export sharing scan and return `AUTO_PUBLISH_DETECTED` if a new public link is observed.

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


### `browser:artifact-click` and action postconditions

Contract 1.1.0 adds the CLI primitive `browser:artifact-click` for Chromium-CDP artifact capture and extends `browser:click`, `browser:upload`, and `browser:wait` with postcondition flags: `--until`, `--until-selector`, `--until-content-regex`, `--until-stable-ms`, `--until-download`, and `--until-timeout-ms`.

`browser:artifact-click` returns local artifact metadata including `path`, `sha256`, `size`, `suggestedFilename`, `downloadGuid`, `frameUrl`, `bbox`, and `elapsedMs`. Safe consumers must treat `path`, `frameUrl`, and `profile-id` as sensitive local fields. `sha256` is a fingerprint and is generally acceptable to log when artifact logging is allowed.


### Contract 1.2.0 resumability, profile leases, and redaction

Contract 1.2.0 adds `workflow:run --resume <run-id>` with `--confirm-replay` for non-idempotent replay risk, `browser:close --release-lease [--force]`, `browser:audit --output-json`, and default redaction for persisted run-event evidence and CLI JSON error evidence. `--no-redact` is a trusted-local debugging opt-out and may expose profile ids, conversation URLs, and absolute paths.

`browser:audit` returns an array of profile lifecycle entries with `profileId`, `profileDir`, `chromePid`, `chromeAlive`, `cacheSizeBytes`, `lastUsedAt`, `staleLockFiles`, and optional `lease`. Safe consumers must treat `profileDir`, lease `user_data_dir`, process IDs, and page URLs as local-sensitive fields.

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
- `IFRAME_NOT_FOUND`
- `ELEMENT_NOT_FOUND`
- `ELEMENT_OUT_OF_VIEWPORT`
- `ARTIFACT_DOWNLOAD_TIMEOUT`
- `ARTIFACT_VERIFICATION_FAILED`
- `POSTCONDITION_TIMEOUT`
- `MODE_UNCERTAIN`
- `HUMAN_HANDOFF_REQUIRED`
- `RESUME_REQUIRES_CONFIRMATION`
- `IDEMPOTENCY_MISMATCH`
- `PROFILE_LOCKED`
- `PROFILE_LEASE_BUSY`
- `UNKNOWN`



New in contract 1.3.0:

- `AUTO_PUBLISH_DETECTED` — refused a publish/share-public action or detected a new public link after an export-adjacent flow.
- `ARTIFACT_MODE_UNSUPPORTED` — service returned or would return the wrong artifact mode for the requested file shape.
- `MODEL_SELECTION_DRIFT` — observed model did not match the requested model hint.
- `PLAN_OR_QUOTA_REQUIRED` — service feature is blocked by plan tier or quota exhaustion.
- `SAFE_OUTPUT_REDACTION_REQUIRED` — a tool response would expose a forbidden safe-consumer field and must be fixed before returning.
- `PROFILE_LEASE_BUSY` — a same-profile mutation lease is already active.

`message` remains human-readable and may change wording within a contract major version. Consumers should branch on `errorCode`, not `message`.

## Backward compatibility promise

Within contract major version `1.x`, stable command/tool/resource schemas will not remove always-present keys, rename keys, or change enum values. Optional keys may be added only when they do not expose forbidden fields on safe surfaces. Experimental surfaces can change across minor package releases and should be wrapped with local sanitization and tolerant parsing.
