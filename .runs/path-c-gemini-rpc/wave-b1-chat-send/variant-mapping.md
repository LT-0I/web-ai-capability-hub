# Path C Gemini Wave B1 send_prompt variant mapping

Source: `.runs/path-c-gemini-rpc/wave-a-captures/webai_gemini_send_prompt--*/`. Body indices are inside the parsed `f.req` inner array (`JSON.parse(JSON.parse(f.req)[1])`). Volatile opaque tokens are redacted from this mapping.

## Registration

- Tool registration: `src/mcp/tools.ts` (`name: "webai_gemini_send_prompt"`).
- Generated manifest mirror: `src/generated/tools/webai-gemini-send-prompt.ts` (read-only for this wave).

## Variants

| Variant | Wave A replay | Args / DOM option | Durable request-body delta vs basic | B1 routing decision |
| --- | --- | --- | --- | --- |
| `basic` | yes | default send | none | RPC StreamGenerate (baseline) |
| `thinking_extended` | yes | `thinking: true` / `thinking_level: "extended"` | `[80] = 2` (Extended thinking); `[3]`, `[4]`, `[59]` are per-request opaque values | RPC StreamGenerate |
| `model_flash` | yes | `model: "3.5-flash"` / Flash aliases | no stable semantic delta from basic in Wave A (both send as Flash); `[3]`, `[4]`, `[59]` vary per request | RPC StreamGenerate using model_flash capture shape |
| `model_flash_lite` | yes | `model: "3.1-flash-lite"` / Flash-Lite aliases | `[79] = 6` (Flash-Lite model selector); `[3]`, `[4]`, `[59]` are per-request opaque values | RPC StreamGenerate |
| `reuse_conversation` | yes | `reuse_conversation: true` (or explicit existing `url` / `tab_url_contains`) | `[2] = [conversation_id,response_id,response_candidate_id,null…context_token]`; `[17] = [[1]]`; `[3]`, `[4]`, `[59]` vary per request | RPC StreamGenerate; refresh conversation tuple from live page when available, otherwise use template tuple |
| `web_search` | no | `web_search: true` | no `payload-template.json`; capture blocked before send (`Google Search` toggle selector missing) | RPC_NOT_AVAILABLE for B1; explicit DOM env override only if ops needs live UI path |
| `thinking_web_search` | no | `thinking: true, web_search: true` | no `payload-template.json`; capture blocked before send (`Google Search` toggle selector missing) | RPC_NOT_AVAILABLE for B1; explicit DOM env override only if ops needs live UI path |

## Raw Wave A delta indices

### `thinking_extended`

- index `3`: basic `<volatile str; len=1559>` → variant `<volatile str; len=1753>`
- index `4`: basic `<volatile str; len=32>` → variant `<volatile str; len=32>`
- index `59`: basic `<volatile str; len=36>` → variant `<volatile str; len=36>`
- index `80`: basic `1` → variant `2`

### `model_flash`

- index `3`: basic `<volatile str; len=1559>` → variant `<volatile str; len=1725>`
- index `4`: basic `<volatile str; len=32>` → variant `<volatile str; len=32>`
- index `59`: basic `<volatile str; len=36>` → variant `<volatile str; len=36>`

### `model_flash_lite`

- index `3`: basic `<volatile str; len=1559>` → variant `<volatile str; len=1691>`
- index `4`: basic `<volatile str; len=32>` → variant `<volatile str; len=32>`
- index `59`: basic `<volatile str; len=36>` → variant `<volatile str; len=36>`
- index `79`: basic `1` → variant `6`

### `reuse_conversation`

- index `2`: basic `["","","",null,null,null,null,null,null,""]` → variant `["c_<captured>","r_<captured>","rc_<captured>",null,null,null,null,null,null,"<context-token len=31>"]`
- index `3`: basic `<volatile str; len=1559>` → variant `<volatile str; len=1680>`
- index `4`: basic `<volatile str; len=32>` → variant `<volatile str; len=32>`
- index `17`: basic `[[0]]` → variant `[[1]]`
- index `59`: basic `<volatile str; len=36>` → variant `<volatile str; len=36>`

## Non-verified classification

- `web_search`: `capture_status=BLOCKED`, `replay_verified=false`; blocker: `Error: No visible selector among [role="menuitemcheckbox"]:has-text("Google Search")`. This is not a separate Gemini surface URL, so DOM-nav-then-RPC is not indicated by the capture. Treat as `RPC_NOT_AVAILABLE` until a Web Search StreamGenerate body is captured; do not silently re-route at runtime.
- `thinking_web_search`: `capture_status=BLOCKED`, `replay_verified=false`; blocker: `Error: No visible selector among [role="menuitemcheckbox"]:has-text("Google Search")`. This is not a separate Gemini surface URL, so DOM-nav-then-RPC is not indicated by the capture. Treat as `RPC_NOT_AVAILABLE` until a Web Search StreamGenerate body is captured; do not silently re-route at runtime.

## Test fixtures

- `fixtures/*.response-stream.txt` are Wave-B1 local replay fixtures derived from Wave A replay/page-text evidence. The `reuse_conversation` replay response carried a stale-conversation Bard error, so its fixture preserves the Wave A observed assistant text (`12`) from `page-text-after.txt` for decoder/body-delta testing while live A/B remains the functional check.