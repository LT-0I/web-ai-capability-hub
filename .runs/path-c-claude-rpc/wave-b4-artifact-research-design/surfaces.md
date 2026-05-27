# Path C Claude Wave B4 surfaces

## Source evidence

- Wave A capture root: `.runs/path-c-claude-rpc/wave-a-captures/`
- B4 mounted-surface probes:
  - `surface-html-artifact-chat.json`
  - `surface-design-project.json`
  - `surface-design-viewer.json`
  - `probe-design-fetch.json`

## `webai_claude_generate_file--csv_artifact`

- Surface: normal Claude chat/new surface, `https://claude.ai/new` or an existing `https://claude.ai/chat/<conversation_id>`.
- Captured/replay-verified endpoint: `POST https://claude.ai/api/organizations/<org>/chat_conversations/<conversation_id>/completion`.
- Download endpoint after streamed `create_file.path`: `GET https://claude.ai/api/organizations/<org>/conversations/<conversation_id>/wiggle/download-file?path=<remote_path>`.
- Mount selectors for live RPC context: `main`, `textarea`, or an existing chat route under `claude.ai`.
- Wave B4 driver: `src/mcp/claude_generate_file_rpc.ts` posts the captured completion shape, parses the SSE tool stream, then downloads the remote file path.

## `webai_claude_generate_file--html_artifact`

- Correct surface: `https://claude.ai/chat/703edfc7-662f-4a00-9f93-ad228335e257` for the Wave A fixture; generated HTML artifacts render inside an isolated iframe (`https://a.claude.ai/isolated-segment.html?...`).
- Wave A failure cause: `TypeError: Failed to fetch` came from evaluating the replay request from the wrong page origin/surface, not from absence of a Claude API route.
- Captured endpoint: same completion route as CSV: `POST /api/organizations/<org>/chat_conversations/<conversation_id>/completion`.
- Mount selectors: `main`, `iframe`, and artifact download/open controls when present.
- Wave B4 driver: same as CSV, but for HTML artifact streams it saves the streamed `visualize:show_widget` `widget_code` inline rather than requiring a download-file request.

## `webai_claude_deep_research--start`

- Surface: normal Claude chat/new surface, `https://claude.ai/new` or `https://claude.ai/chat/<conversation_id>`.
- Captured/replay-verified endpoint: `POST /api/organizations/<org>/chat_conversations/<conversation_id>/completion`.
- Captured distinguishing payload: `create_conversation_params.compass_mode = "advanced"` and `paprika_mode = null`.
- Mount selectors: `main`, `textarea`, and Claude chat composer controls.
- Wave B4 driver: `src/mcp/claude_deep_research_rpc.ts` posts the captured advanced completion shape and returns the DOM-compatible queued task envelope.

## Claude Design group

Canonical DOM driver source: `src/mcp/submcp/claude-design/flow.ts`.

Common mounted surfaces/selectors:

- Root/create surface: `https://claude.ai/design`
  - selectors: `input[placeholder="Project name"]`, `[data-testid="create-project-button"]`
- Project/generate surface: `https://claude.ai/design/p/<project_id>`
  - selectors: `textarea[data-testid="chat-composer-input"]`, `[data-testid="chat-send-button"]`
- Viewer/get_html/present surface: `https://claude.ai/design/p/<project_id>?file=<file.html>`
  - selectors: `iframe[data-testid="html-viewer-iframe"]`, `iframe[src*="claudeusercontent.com"]`, Present button

B4 probe evidence from `surface-design-viewer.json` found the mounted project viewer at:

`https://claude.ai/design/p/6b373bb0-fe5f-4558-8040-ea03c3becb4a?file=index.html`

with iframe:

`https://6b373bb0-fe5f-4558-8040-ea03c3becb4a.claudeusercontent.com/_bootstrap`

The correct same-origin RPC surface is Claude Design's Omelette Connect API under `https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/*`, not `https://claude.ai/api/*`.

### `webai_claude_design_get_html--existing_project`

- RPC status: `CAPTURED` / implemented.
- DOM-nav prelude: go to `https://claude.ai/design/p/<project_id>?file=<file.html>` and wait for the HTML viewer iframe to mount.
- RPC endpoint: `POST https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile`.
- Request body: `{"projectId":"<project_id>","path":"<file.html>","raw":true}`.
- Response: JSON with base64 `content`; decoded bytes are the standalone HTML file.
- Evidence: `probe-design-fetch.json` returned HTTP 200 with base64 HTML content for `index.html`.

### `webai_claude_design_create_project--basic`

- RPC status: `RPC_NOT_AVAILABLE` for Wave B4 production routing.
- Reason: B4 did not capture and replay a stable write RPC for create-project semantics/fidelity selection. It remains DOM-only by write-time decision, not runtime fallback.

### `webai_claude_design_generate--html`

- RPC status: `RPC_NOT_AVAILABLE` for Wave B4 production routing.
- Reason: B4 did not capture and replay a stable streaming/write RPC for Claude Design generation. It remains DOM-only by write-time decision, not runtime fallback.

### `webai_claude_design_present--existing_project`

- RPC status: `RPC_NOT_AVAILABLE` for Wave B4 production routing.
- Reason: the observed action is client-side presentation navigation on the mounted viewer/iframe surface, with no required replayable same-origin data RPC. It remains DOM-only by write-time decision, not runtime fallback.
