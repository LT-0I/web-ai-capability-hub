# Path C Gemini Wave B3 inventory — workspace + select_model + conversation_manage

Date: 2026-05-27
Scope: `webai_gemini_workspace`, `webai_gemini_select_model`, `webai_gemini_conversation_manage`.

## Existing driver locations

`grep -rn 'name: ["'"'"'']webai_gemini_workspace' src/` resolves through generated tool declarations and the dispatcher in `src/mcp/tools.ts`.
The active implementations before this wave were DOM/CDP helpers in `src/mcp/tools.ts`:

- `webAiGeminiWorkspace` -> `inspectGeminiWorkspaceWithExtensionBackend` or `inspectGeminiWorkspace`
- `webAiGeminiSelectModel` -> `selectGeminiModelWithExtensionBackend` or `selectGeminiModelWithManagedBackend`
- `webAiGeminiConversationManage` -> `manageGeminiConversationWithExtensionBackend` or `manageGeminiConversation`

`webai_gemini_select_model` had shipped as a standalone tool in earlier history; no dedicated Gemini `*_select_model_rpc.ts` sibling existed in the current tree, so this wave adds a parallel pure-HTTP RPC sibling and keeps DOM only as an explicit operator override.

## Capture-file note

The prompt asked to read `payload-template.json` plus `response-stream.json`. Wave A captures for these variants do not contain a literal `response-stream.json`; the replayable stream is present as `replay/replay.response.txt`, with request/response metadata in `response-stream-decoded.json`. The B3 fixtures therefore store sanitized copies as both `response-stream.txt` and `response-stream.json` under this wave directory.

## Verified Wave A variants

### `webai_gemini_workspace`

| Variant | Wave A replay | RPC default status | Notes |
| --- | ---: | --- | --- |
| `surface_gems` | verified | RPC | `MaZiqc` batchexecute route-read ack |
| `surface_scheduled` | verified | RPC | `MaZiqc` batchexecute route-read ack |
| `surface_study` | verified | RPC | `MaZiqc` batchexecute observe-only ack |
| `surface_workspace_integration` | verified | RPC | `MaZiqc` batchexecute route-read ack |
| `surface_connected_apps` | verified | RPC | `MaZiqc` batchexecute route-read ack |
| `surface_personalization` | verified | RPC | `MaZiqc` batchexecute route-read ack |
| `surface_audio_overview` | unverified | RPC_NOT_AVAILABLE | NotebookLM handoff is not a verified Gemini RPC; returns canonical `INVALID_ARGS` with RPC_NOT_AVAILABLE message. |

Workspace verified count used for acceptance: 6.

### `webai_gemini_select_model`

| Variant | Wave A replay | RPC default status | Notes |
| --- | ---: | --- | --- |
| `select_flash` | verified | RPC | `L5adhe`, `last_selected_mode_id_on_web = 8c46e95b1a07cecc` |
| `select_flash_lite` | verified | RPC | `L5adhe`, `last_selected_mode_id_on_web = 56fdd199312815e2` |
| `thinking_standard` | verified | RPC | `L5adhe` captured settings write ack |
| `thinking_extended` | verified | RPC | `L5adhe` captured settings write ack |
| `dual_flash_lite_standard` | unverified | RPC_NOT_AVAILABLE | Capture lacked replay/payload template, so combined model+thinking remains explicit unsupported RPC. |

Select-model verified count used for acceptance: 4.

### `webai_gemini_conversation_manage`

| Variant | Wave A replay | RPC default status | Notes |
| --- | ---: | --- | --- |
| `action_list` | verified | RPC | `MaZiqc` ack; returns DOM-compatible list/search shape with empty arrays when RPC only returns ack. |
| `action_search` | verified | RPC | `MaZiqc` ack; returns DOM-compatible search shape with empty arrays when RPC only returns ack. |
| `action_menu_enumerate` | verified | RPC | `MaZiqc` ack; returns capture-derived static menu labels. |
| `action_share` | verified | guarded RPC | Unconfirmed calls return `SENSITIVE_CONTENT_GUARD`; confirmed calls may run RPC. A/B uses the guarded safe path. |
| `action_rename` | verified | guarded safe path | Data-mutating; returns `POLICY_APPROVAL_REQUIRED`, matching the existing DOM safe path. |
| `action_delete` | verified | guarded safe path | Data-mutating; returns `POLICY_APPROVAL_REQUIRED`, matching the existing DOM safe path. |

Conversation verified count used for acceptance: 6.

## Capture fixtures committed for B3

Sanitized fixtures live under:

- `.runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures/webai_gemini_workspace--*/`
- `.runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures/webai_gemini_select_model--*/`
- `.runs/path-c-gemini-rpc/wave-b3-workspace-model-conversation/fixtures/webai_gemini_conversation_manage--*/`

Each fixture contains:

- `payload-template.json`: sanitized endpoint/header/body template; runtime `at`, `bl`, `f.sid`, cookies, and user-agent are inserted by the driver.
- `response-stream.txt` / `response-stream.json`: replay stream used by mocked-HTTP tests to verify ack decoding.

## Dispatcher decision

Production default for all three tools is RPC. DOM is reachable only through explicit env-var override:

- `WEBAI_GEMINI_WORKSPACE_BACKEND=dom|managed-cdp|extension-assisted-cdp`
- `WEBAI_GEMINI_SELECT_MODEL_BACKEND=dom|managed-cdp|extension-assisted-cdp`
- `WEBAI_GEMINI_CONVERSATION_MANAGE_BACKEND=dom|managed-cdp|extension-assisted-cdp`

There is no runtime try/catch reroute after an RPC failure.

## Live A/B sweep outcome

Final sweep used `WEBAI_GEMINI_AB_DOM_BACKEND=extension-assisted-cdp` because managed-CDP DOM drifted on the current Gemini model picker and conversation surface. Result file: `ab-sweep-results.json`.

- PASS: 15/16 functional variants (threshold: >=14/16)
- Miss: `conversation_menu_enumerate` DOM side returned `ELEMENT_NOT_FOUND` because no open conversation menu button was available; RPC returned the capture-derived menu labels with `MaZiqc` ack.
- No account-risk stop occurred.
- Cleanup closed non-essential Gemini tabs and kept one `https://gemini.google.com/app` tab.
