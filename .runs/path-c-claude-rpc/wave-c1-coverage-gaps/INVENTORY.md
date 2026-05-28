# Path C Claude Wave C1 — RPC coverage gap closure inventory

Re-captured the 4 variants left as `RPC_NOT_AVAILABLE` after Wave B4. Wave A
had filtered network traffic to `claude.ai/api/*` only and missed the
Omelette RPC namespace (`claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/*`).

## Per-variant verdict

| variant | wave_a_blocker | wave_c1_finding | wave_c1_verdict |
|---------|----------------|-----------------|-----------------|
| `webai_claude_design --op=create_project` | NO_MATCHING_RPC (filter missed Omelette) | Omelette `CreateProject` accepts `application/json` Connect-unary; minimal body `{"name":"<text>"}` returns `{"projectId":"<uuid>"}` with HTTP 200 | **RPC_AVAILABLE — IMPLEMENTED** |
| `webai_claude_design --op=generate` | NO_MATCHING_RPC | Omelette `Chat` is `application/connect+proto` streaming; Connect+JSON envelope accepted but body validator requires `messages_request` as TYPE_BYTES (nested proto). Without proto schema we cannot encode this; only byte-for-byte capture replay would work, which is brittle for generation (UUIDs, timestamps embedded). | **TRUE_RPC_NOT_AVAILABLE — DOM remains** |
| `webai_claude_design --op=present` | NO_MATCHING_RPC | Present button fires only `TrackEvent` + `UpdateProjectData` (telemetry/state-sync, not the presentation transition). The transition itself is client-side route nav via window.open or React state; no replayable Present RPC. | **TRUE_RPC_NOT_AVAILABLE — DOM remains** |
| `webai_claude_generate_file --variant=html_artifact` | page.evaluate: TypeError: Failed to fetch (harness-side) | Wave A captured the full SSE response (`response-stream.txt` 4.9K with widget_code tool_use); the existing `webAiClaudeGenerateFileRpc` already extracts widget HTML via the same `completion` endpoint used by `csv_artifact`. Driver shape was already correct, only capture-replay harness failed. | **RPC_AVAILABLE — already shipped Wave B4; no change** |

## Endpoint table

| variant | endpoint | encoding | replay shape |
|---------|----------|----------|--------------|
| create_project | `POST https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/CreateProject` | `application/json` (Connect-unary, `connect-protocol-version: 1`) | request: `{"name":"<text>"}`; response: `{"projectId":"<uuid>"}` |
| generate | `POST .../Chat` | `application/connect+proto` (streaming) | not replayable without proto schema |
| present | n/a (client-side route nav) | n/a | n/a |
| html_artifact | already covered by `webai_claude_generate_file` RPC (chat_conversations/completion + extractClaudeGeneratedFileArtifacts widget path) | `text/event-stream` | covered in `tests/claudeGenerateFileRpc.test.ts` |

## Net result

- 1 new RPC driver shipped: `create_project`
- 2 confirmed TRUE_RPC_NOT_AVAILABLE: `generate`, `present` — write-time DOM routing in `tools.ts` retained
- 1 already RPC under Wave B4 (`html_artifact`)

## Captures

- `webai_claude_design_create_project--basic/` — CreateProject + GetProject + ListFiles + GetProjectData + McpListTools + MintPreviewToken (post-create chain)
- `webai_claude_design_generate--html/` — Chat streaming (proto), turn-title, RenewTurn, ListFiles
- `webai_claude_design_present--existing_project/` — TrackEvent + UpdateProjectData only (no Present RPC)

## Probes

- `probe-design-root.mjs` — DOM probe confirming `input[placeholder="Project name"]` + `[data-testid="create-project-button"]`
- `probe-json-rpc.mjs` — JSON-encoding probe: CreateProject + GetProject accept application/json
- `probe-chat-json.mjs` — Chat JSON probe: shows accept-post header listing all supported encodings
- `probe-chat-connect-framed.mjs` — Chat Connect+JSON framed envelope probe: reveals `messages_request` is TYPE_BYTES
- `probe-chat-messages-bytes.mjs` — confirms TYPE_BYTES requires proto schema we don't have
- `probe-present-button.mjs` — Present click does not change URL or open new tab in same-origin probe (UI requires a real user gesture path)
