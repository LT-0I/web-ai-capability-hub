# Consumer Contract

Package: `web-ai-research-automation-hub` v0.6.0
Contract: `consumer-contract-1.4.0`

This document is generated from `configs/consumer-contract.json`, the authoritative public integration contract for packages that consume the hub as a dependency. It does not change the existing safety policy, manual-login boundary, confirmation policy, or CLI/MCP tool behavior.

## Release notes

- consumer-contract-1.4.0 (2026-05-15): chatgpt-codex is live only for the hard-allowlisted `LT-0I/CN-` environment; `submit-task` requires `confirmed=true`, `get-diff` returns code `diff_text` and never clicks Create PR. Webai count remains 37.
- consumer-contract-1.4.0 (2026-05-15): Stream #5 reconciliation confirms 13 pre-existing webai tools → 37 total, 3 new error codes (SENSITIVE_CONTENT_GUARD, SUBMCP_QUOTA_EXHAUSTED, SUBMCP_NOT_PROVISIONED), and model/control parameter updates on existing tools. No phantom tool was added. Sub-MCP modules: claude-design (4 tools, live), gemini-music (3 tools, live), chatgpt-codex (4 tools, live LT-0I/CN- allowlisted).
- Phase C correctness notes (same contract version): `tab_url_contains` is honored as a tab selector/URL hint for Claude send/design and Gemini music/conversation tools; ChatGPT conversation `menu_enumerate` uses the in-chat header options button, `search` uses Control+k, and `share` uses `aria-label="Share"`. Claude Design timeout failures return stable contract codes instead of raw Playwright timeout strings.
- Stream #5 final Claude Design generate note (same contract version): `webai:claude:design:generate` completion is recognized from the served design iframe (`/v1/design/projects/<id>/serve/<file>`) with the existing `?file=<name>.html` URL as a fallback, and timeout/quota envelopes still emit the contracted `status`, `model_used`, `projectUrl`, and `fileName` keys.
- Stream #5 Pulse integration note (same contract version): `webai:chatgpt:pulse:get` and `webai:chatgpt:pulse:onboard` add the live-discovered ChatGPT Pulse surface, increasing `webai_*` command rows from 35 to 37; error code count remains 32.

## Public surfaces

The contract covers three surfaces:

1. **CLI**: colon-style commands, for example `consumer:health`.
2. **MCP**: underscore-style tools/resources, for example `consumer_health`.
3. **TypeScript API**: direct imports from the package barrel, for example `consumerHealth`.

Unlisted commands remain developer/automation surfaces documented elsewhere and are not schema-stable under this consumer contract.

## Consumer-safe health probe

`consumer:health` is the preferred health-check entry point for safe consumers. It returns a deliberately narrow JSON object and must not include forbidden local/browser fields.

```bash
node dist/src/cli.js consumer:health --target chatgpt --profile chatgpt --json
```

```ts
import { consumerHealth } from "web-ai-research-automation-hub";

const result = await consumerHealth({ target: "chatgpt", profile: "chatgpt" });
```

Stable JSON keys are exactly:

| Key | Type | Guarantee |
| --- | --- | --- |
| `ok` | contracted | Always present. |
| `target` | contracted | Always present. |
| `profile` | contracted | Always present. |
| `connected` | contracted | Always present. |
| `pageCount` | contracted | Always present. |
| `loginLikeState` | contracted | Always present. |
| `status` | contracted | Always present. |
| `errorCode` | contracted | Always present. |
| `message` | contracted | Always present. |
| `checkedAt` | contracted | Always present. |

## CLI / MCP / TypeScript mapping

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `consumer:health` | `consumer_health` | `consumerHealth` | stable | read | no |
| `browser:status` | `browser_status` | `ManagedBrowserLauncher.status` | stable | read | yes |
| `browser:pages` | `browser_pages` | `ManagedBrowserLauncher.pages` | stable | read | yes |
| `capability:query` | `capability_query` | `CapabilityDatabase.queryCapabilities` | experimental | read | no |
| `capability:export` | `capability_export` | `CapabilityDatabase.exportJson` | experimental | read | yes |
| `capability:library:import` | `capability_library_import` | `CapabilityLibraryImporter.importFile` | experimental | mutate | no |
| `capability:update` | `capability_update` | `CapabilityUpdater.updateFromSnapshot` | experimental | mutate | yes |
| `workflow:compile` | `workflow_compile` | `WorkflowCompiler.compileFile` | experimental | read | yes |
| `workflow:run` | `workflow_run` | `WorkflowExecutor.runFile` | experimental | risky | yes |
| `browser:read` | `browser_read` | `readPageSnapshot` | experimental | read | yes |
| `browser:read --include-portals` | `browser_read.includePortals` | `readPageSnapshot({includePortals:true})` | experimental | read | yes |
| `browser:screenshot` | `browser_screenshot` | `readPageSnapshot` | experimental | read | yes |
| `browser:launch` | `browser_launch` | `ManagedBrowserLauncher.launch` | experimental | mutate | yes |
| `browser:open` | `browser_open` | `BrowserSessionManager.open` | experimental | mutate | yes |
| `mcp:tools` | n/a | `listMcpTools` | stable | read | no |
| `mcp:resources` | n/a | `listMcpResources` | stable | read | no |
| `browser:click` | n/a | `ActionExecutor.execute({type:'click'})` | experimental | mutate | yes |
| `browser:upload` | n/a | `ActionExecutor.execute({type:'upload'})` | experimental | risky | yes |
| `browser:wait` | n/a | `ActionExecutor.execute({type:'wait'})` | experimental | read | yes |
| `browser:hover --dwell-ms --settle-selector` | n/a | `ActionExecutor.execute({type:'hover'})` | experimental | mutate | no |
| `browser:artifact-click` | n/a | `runArtifactClick` | experimental | risky | yes |
| `verify:docx-min` | n/a | `verifyDocxMin` | experimental | read | yes |
| `browser:audit` | n/a | `auditProfiles` | experimental | read | yes |

## Contract 1.4.0 webai MCP tools

Generated from the manifest: 37 current `webai_*` command rows: 13 pre-existing + 13 main-server (+2 Pulse) + 11 sub-MCP. The Stream #5 Pulse surface is 37; no contract/package version bump is included.

### Original/B1 existing webai tools

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

### Stream #5 main-server tools (B2-B4 + Pulse)

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:gemini:deep-research` | `webai_gemini_deep_research` | `webAiGeminiDeepResearch` | experimental | mutate | no |
| `webai:gemini:canvas-edit` | `webai_gemini_canvas_edit` | `webAiGeminiCanvasEdit` | experimental | mutate | no |
| `webai:gemini:conversation-manage` | `webai_gemini_conversation_manage` | `webAiGeminiConversationManage` | experimental | mutate | no |
| `webai:gemini:workspace` | `webai_gemini_workspace` | `webAiGeminiWorkspace` | experimental | read | no |
| `webai:chatgpt:canvas-export` | `webai_chatgpt_canvas_export` | `webAiChatgptCanvasExport` | experimental | mutate | yes |
| `webai:chatgpt:pulse:get` | `webai_chatgpt_pulse_get` | `webAiChatgptPulseGet` | experimental | read | no |
| `webai:chatgpt:pulse:onboard` | `webai_chatgpt_pulse_onboard` | `webAiChatgptPulseOnboard` | experimental | mutate | no |
| `webai:chatgpt:deep-research` | `webai_chatgpt_deep_research` | `webAiChatgptDeepResearch` | experimental | mutate | no |
| `webai:claude:deep-research` | `webai_claude_deep_research` | `webAiClaudeDeepResearch` | experimental | mutate | no |
| `webai:chatgpt:conversation-manage` | `webai_chatgpt_conversation_manage` | `webAiChatgptConversationManage` | experimental | mutate | no |
| `webai:claude:conversation-manage` | `webai_claude_conversation_manage` | `webAiClaudeConversationManage` | experimental | mutate | no |
| `webai:chatgpt:workspace` | `webai_chatgpt_workspace` | `webAiChatgptWorkspace` | experimental | read | no |
| `webai:claude:workspace` | `webai_claude_workspace` | `webAiClaudeWorkspace` | experimental | read | no |

### Stream #5 sub-MCP tools (B5-B7)

| CLI name | MCP name | TypeScript API | Maturity | Safety class | Sensitive local fields possible? |
| --- | --- | --- | --- | --- | --- |
| `webai:chatgpt:codex:submit-task` | `webai_chatgpt_codex_submit_task` | `webAiChatgptCodexSubmitTask` | experimental | mutate | no |
| `webai:chatgpt:codex:list-envs` | `webai_chatgpt_codex_list_envs` | `webAiChatgptCodexListEnvs` | experimental | read | no |
| `webai:chatgpt:codex:task-status` | `webai_chatgpt_codex_task_status` | `webAiChatgptCodexTaskStatus` | experimental | read | no |
| `webai:chatgpt:codex:get-diff` | `webai_chatgpt_codex_get_diff` | `webAiChatgptCodexGetDiff` | experimental | read | yes |
| `webai:claude:design:create-project` | `webai_claude_design_create_project` | `webAiClaudeDesignCreateProject` | experimental | mutate | no |
| `webai:claude:design:generate` | `webai_claude_design_generate` | `webAiClaudeDesignGenerate` | experimental | mutate | no |
| `webai:claude:design:get-html` | `webai_claude_design_get_html` | `webAiClaudeDesignGetHtml` | experimental | read | yes |
| `webai:claude:design:present` | `webai_claude_design_present` | `webAiClaudeDesignPresent` | experimental | mutate | no |
| `webai:gemini:music:generate` | `webai_gemini_music_generate` | `webAiGeminiMusicGenerate` | experimental | mutate | no |
| `webai:gemini:music:download-track` | `webai_gemini_music_download_track` | `webAiGeminiMusicDownloadTrack` | experimental | read | yes |
| `webai:gemini:music:task-status` | `webai_gemini_music_task_status` | `webAiGeminiMusicTaskStatus` | experimental | read | no |

### Webai output-key contract

| Tool | Always-present output keys | Optional output keys |
| --- | --- | --- |
| `webai:chatgpt:send-prompt` / `webai_chatgpt_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `reuse_conversation`, `errorCode` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:claude:send-prompt` / `webai_claude_send_prompt` | `conversation_id`, `chat_url`, `response_text`, `elapsed_ms`, `wait_ms`, `completion_detected`, `errorCode` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:gemini:send-prompt` / `webai_gemini_send_prompt` | `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `wait_ms`, `completion_detected`, `errorCode`, `reuse_conversation` | `ok`, `service`, `error_code`, `expected_model` |
| `webai:chatgpt:upload-and-query` / `webai_chatgpt_upload_and_query` | `conversation_id`, `attachment_names`, `response_text`, `wait_ms`, `completion_detected`, `errorCode` | `error_code`, `expected_model` |
| `webai:claude:upload-and-query` / `webai_claude_upload_and_query` | `files_uploaded_count`, `attachment_names`, `response_text`, `wait_ms`, `completion_detected`, `errorCode` | `error_code`, `expected_model` |
| `webai:gemini:upload-and-query` / `webai_gemini_upload_and_query` | `files_in_chip`, `response_text`, `chat_url`, `wait_ms`, `completion_detected`, `errorCode` | `ok`, `error_code`, `selector`, `expected_selector`, `expected_model` |
| `webai:chatgpt:generate-file` / `webai_chatgpt_generate_file` | `path`, `sha256`, `size_bytes`, `suggested_filename`, `errorCode`, `download_filename` | `WARN`, `expected_model` |
| `webai:claude:generate-file` / `webai_claude_generate_file` | `path`, `sha256`, `size_bytes`, `artifact_name`, `errorCode`, `download_filename` | `WARN`, `expected_model` |
| `webai:chatgpt:generate-image` / `webai_chatgpt_generate_image` | `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`, `download_filename` | `error_code`, `expected_selector`, `message`, `expected_model` |
| `webai:gemini:generate-image` / `webai_gemini_generate_image` | `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`, `download_filename` | `error_code`, `expected_selector`, `message`, `expected_model` |
| `webai:gemini:canvas-to-docs` / `webai_gemini_canvas_to_docs` | `docs_url`, `docs_doc_id`, `title`, `errorCode` | `cleanup_attempted`, `expected_model` |
| `webai:gemini:generate-video` / `webai_gemini_generate_video` | `task_id`, `status`, `profile`, `lease_id`, `started_at` | `expected_model` |
| `webai:gemini:deep-research` / `webai_gemini_deep_research` | `task_id`, `status` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:canvas-edit` / `webai_gemini_canvas_edit` | `canvas_opened`, `edit_applied`, `ai_action_applied` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:conversation-manage` / `webai_gemini_conversation_manage` | _(none)_ | `items`, `dialog_opened`, `results`, `ok`, `errorCode`, `error_code`, `reason`, `message`, `action` |
| `webai:gemini:workspace` / `webai_gemini_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:chatgpt:codex:submit-task` / `webai_chatgpt_codex_submit_task` | `task_id`, `task_url`, `repo`, `env`, `env_id`, `status` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:chatgpt:codex:list-envs` / `webai_chatgpt_codex_list_envs` | `status`, `envs` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:codex:task-status` / `webai_chatgpt_codex_task_status` | `task_id`, `repo`, `env_id`, `status`, `done`, `status_text` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:codex:get-diff` / `webai_chatgpt_codex_get_diff` | `task_id`, `repo`, `env_id`, `status`, `files`, `diff_text`, `create_pr_available` | `ok`, `errorCode`, `error_code`, `message` |
| `webai:chatgpt:canvas-export` / `webai_chatgpt_canvas_export` | `path`, `sha256`, `format`, `byteSize` | `errorCode`, `error_code` |
| `webai:chatgpt:pulse:get` / `webai_chatgpt_pulse_get` | `route`, `status`, `generated_hint` | `digest_text`, `ok`, `errorCode`, `error_code` |
| `webai:chatgpt:pulse:onboard` / `webai_chatgpt_pulse_onboard` | `route`, `onboarded`, `news_topic_selected`, `final_status` | `note`, `ok`, `errorCode`, `error_code`, `reason` |
| `webai:chatgpt:deep-research` / `webai_chatgpt_deep_research` | `task_id`, `status` | `ok`, `service`, `errorCode`, `error_code`, `expected_model` |
| `webai:claude:deep-research` / `webai_claude_deep_research` | `task_id`, `status` | `ok`, `service`, `errorCode`, `error_code`, `expected_model` |
| `webai:chatgpt:conversation-manage` / `webai_chatgpt_conversation_manage` | _(none)_ | `dialog_opened`, `conversationId`, `url`, `surface`, `items`, `results`, `ok`, `errorCode`, `error_code`, `reason` |
| `webai:claude:conversation-manage` / `webai_claude_conversation_manage` | _(none)_ | `results_count`, `action`, `dialog_opened`, `conversationId`, `ok`, `errorCode`, `error_code`, `reason`, `message` |
| `webai:chatgpt:workspace` / `webai_chatgpt_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:claude:workspace` / `webai_claude_workspace` | `surface`, `url`, `summary` | `ok`, `errorCode`, `error_code`, `reason`, `action` |
| `webai:claude:design:create-project` / `webai_claude_design_create_project` | `projectUrl`, `projectId` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:generate` / `webai_claude_design_generate` | `status`, `model_used`, `projectUrl`, `fileName` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:get-html` / `webai_claude_design_get_html` | `iframeArtifactSha256`, `savedPath`, `byteSize` | `ok`, `errorCode`, `error_code` |
| `webai:claude:design:present` / `webai_claude_design_present` | `presentUrl` | `ok`, `errorCode`, `error_code` |
| `webai:gemini:music:generate` / `webai_gemini_music_generate` | `task_id`, `status`, `conversation_url` | `ok`, `errorCode`, `error_code`, `message`, `action` |
| `webai:gemini:music:download-track` / `webai_gemini_music_download_track` | `savedPath`, `sha256`, `byteSize`, `format` | `ok`, `errorCode`, `error_code` |
| `webai:gemini:music:task-status` / `webai_gemini_music_task_status` | `status`, `download_ready` | `ok`, `errorCode`, `error_code` |
| `webai:task-status` / `webai_task_status` | `status` | `progress_label`, `result`, `errorCode` |

## MCP resources

| Resource URI | TypeScript API | Maturity | Safety class | Sensitive local fields possible? | Always-present output keys | Optional output keys |
| --- | --- | --- | --- | --- | --- | --- |
| `capabilities://targets` | `readMcpResource` | experimental | read | no | _(none)_ | `target_id`, `display_name`, `kind`, `base_url` |
| `capabilities://target/{targetId}` | `readMcpResource` | experimental | read | no | _(none)_ | `id`, `target_id`, `category`, `name`, `description`, `selectors`, `status` |
| `capabilities://target/{targetId}/latest` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `target_id`, `url`, `title`, `captured_at`, `artifact_refs` |
| `workflows://definitions` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `target_id`, `name`, `definition`, `created_at` |
| `workflows://runs` | `readMcpResource` | experimental | read | yes | _(none)_ | `id`, `workflow_id`, `status`, `started_at`, `finished_at` |
| `browser-profiles://list` | `readMcpResource` | experimental | read | yes | _(none)_ | `profileName`, `browserType`, `profileDir`, `executablePath`, `cdpEndpoint`, `cdpPort`, `processId`, `lastStatus` |
| `site-registry://sites` | `readMcpResource` | experimental | read | no | _(none)_ | `site_id`, `display_name`, `kind`, `base_url` |
| `capability-library://features` | `readMcpResource` | experimental | read | no | _(none)_ | `feature_id`, `service`, `name`, `status`, `mcp_tool`, `raw`, `imported_at` |

## Stable JSON output guarantees

Command rows define `required_args`, `output_keys.always_present`, and `output_keys.optional` in `configs/consumer-contract.json`. Safe consumers should treat always-present keys as the compatibility floor and optional keys as additive, tolerant-parse fields.

## Sensitive local fields

| Field | Handling |
| --- | --- |
| `artifact_click.path` | Local filesystem path; treat as sensitive local metadata. |
| `artifact_click.sha256` | Content fingerprint; acceptable to log when artifact logging is allowed. |
| `artifact_click.frameUrl` | May contain conversation IDs or tenant-specific URLs; treat as sensitive. |
| `profile-id` | Opaque browser profile identifier; do not expose outside trusted local logs. |
| `run_events.evidence` | Redacted by default; use --no-redact only for trusted local debugging. |
| `profile_lease.user_data_dir` | Local browser profile path; treat as sensitive local metadata. |
| `canvas_export.path` | Local filesystem path to exported ChatGPT Canvas artifact; treat as sensitive local metadata. |
| `claude_design.savedPath` | Local filesystem path to saved Design artifact; treat as sensitive local metadata. |
| `gemini_music.savedPath` | Local filesystem path to saved Gemini music artifact; treat as sensitive local metadata. |
| `pulse.digest_text` | Plain ChatGPT Pulse visible page text; safe for contract output but classify because it can contain user-curated topics. |
| `pulse.status` / `pulse.final_status` | Pulse readiness state; safe account feature state. |
| `pulse.route` / `pulse.generated_hint` | Pulse route and generated timing hint; safe route/page metadata. |
| `pulse.onboarded` / `pulse.news_topic_selected` | Pulse onboarding and Quick news recap selection booleans; safe preference metadata. |

### Phase C artifact readiness guarantees

- `webai:claude:design:generate` waits for the Design project URL to acquire the same `?file=<name>.html` readiness signal used by the completed Present flow before reporting `status:"generated"`; a genuine miss returns stable `POSTCONDITION_TIMEOUT`.
- `webai:claude:design:get-html` persists and hashes only verified HTML markup. Bootstrap/loader URL stubs fail with `ARTIFACT_VERIFICATION_FAILED`, are not written as `.html` artifacts, and failed captures clean up newly-created scratch files in the requested download directory.
- `webai:chatgpt:canvas-export` opens the canvas side panel when a canvas tile/control is available, then exports through Download; if no canvas exists it returns stable `ELEMENT_NOT_FOUND`.
- `webai:chatgpt:pulse:get` is read-only: it returns `not_onboarded`, `pending`, or `ready` from the recipe gates and never silently onboards or fabricates `digest_text`.
- `webai:chatgpt:pulse:onboard` requires `--confirmed`, selects `Quick news recap`, and skips Gmail connection.

## Forbidden output fields for safe consumers

Safe consumers must strip these fields defensively even when using consumer-safe surfaces:

- `cdpEndpoint`
- `cdp_endpoint`
- `cdp_port`
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

The safe `consumer:health` surface is designed not to emit those fields, but downstream re-sanitization is still recommended for defense in depth. The MCP tool boundary centrally rejects any final tool result containing forbidden keys with `SAFE_OUTPUT_REDACTION_REQUIRED`; the MCP resource boundary centrally projects forbidden keys out of database-backed resources and then asserts the sanitized payload is clean before returning it.

## Error code taxonomy

Consumer-stable error codes (32):

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
- `DOCX_VERIFICATION_FAILED`
- `POSTCONDITION_TIMEOUT`
- `RESUME_REQUIRES_CONFIRMATION`
- `IDEMPOTENCY_MISMATCH`
- `PROFILE_LOCKED`
- `PROFILE_LEASE_BUSY`
- `SAFE_OUTPUT_REDACTION_REQUIRED`
- `PLAN_OR_QUOTA_REQUIRED`
- `MODEL_SELECTION_DRIFT`
- `ARTIFACT_MODE_UNSUPPORTED`
- `AUTO_PUBLISH_DETECTED`
- `MODE_UNCERTAIN`
- `HUMAN_HANDOFF_REQUIRED`
- `UNKNOWN`
- `SENSITIVE_CONTENT_GUARD`
- `SUBMCP_QUOTA_EXHAUSTED`
- `SUBMCP_NOT_PROVISIONED`

`message` remains human-readable and may change wording within a contract major version. Consumers should branch on `errorCode`, not `message`.

## Backward compatibility promise

Within contract major version `1.x`, stable command/tool/resource schemas will not remove always-present keys, rename keys, or change enum values. Optional keys may be added only when they do not expose forbidden fields on safe surfaces. Experimental surfaces can change across minor package releases and should be wrapped with local sanitization and tolerant parsing.


### Browser hover dwell and portal reads

`browser:hover` keeps its existing instantaneous Playwright hover unless `--dwell-ms` or `--settle-selector` is provided. With those flags it dispatches raw CDP `Input.dispatchMouseEvent` `mouseMoved` steps toward the target, dwells for the requested duration (default 450ms when the dwell path is selected), and optionally requires `--settle-selector` to appear; missing targets or unrevealed submenus surface existing `ELEMENT_NOT_FOUND`/`MODE_UNCERTAIN`-style failures rather than success.

`browser:read --include-portals` is opt-in and includes body-level Radix/command-palette portal roots such as `[data-radix-popper-content-wrapper]`, `[role="menu"]`, `[role="dialog"]`, and `[role="listbox"]`. The default read path remains portal-excluding for compatibility. The MCP `browser_read` tool exposes the same option as `includePortals`; no new MCP/webai tool is added.


## Integration registry surface

`docs/capability-library.json` is the editable seed. `capability:library:import` loads that seed into SQLite `integration_registry`, and `capability-library://features` exposes the authoritative imported rows. Public fields `feature_id`, `service`, `name`, `status`, and `mcp_tool` are classified as safe governance metadata; no forbidden fields are introduced.
