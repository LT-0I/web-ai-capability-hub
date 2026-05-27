# Path C Claude Wave B1 send_prompt variant mapping

Source capture dirs: `.runs/path-c-claude-rpc/wave-a-captures/webai_claude_send_prompt--<variant>/`.
Primary files inspected per variant: `request-body.txt`, `payload-template.json`, `response-stream.json`.
`model_sonnet` primary `response-stream.json` is empty, but its replay stream is verified in `replay/response-stream.txt` / `capture-summary.json`.

## Shared completion RPC

All variants use:

- `POST /api/organizations/<org>/chat_conversations/<conversation_id>/completion`
- `accept: text/event-stream`
- JSON body with `prompt`, `timezone`, `personalized_styles`, `locale`, `model`, `tools`, `turn_message_uuids`, `attachments`, `files`, `sync_sources`, `rendering_mode`
- New-conversation variants include `create_conversation_params`
- Reuse-conversation omits `create_conversation_params` and includes `parent_message_uuid`

## Basic baseline

Variant `basic` body characteristics:

- `model`: `claude-sonnet-4-6`
- `create_conversation_params.model`: `claude-sonnet-4-6`
- `create_conversation_params.paprika_mode`: `null`
- `create_conversation_params.compass_mode`: `null`
- `create_conversation_params.is_temporary`: `false`
- `create_conversation_params.enabled_imagine`: `true`
- `personalized_styles[0]`: Normal/Default style
- `tools`: visual/widget/artifacts/repl tools; no `web_search` entry unless `web_search` is enabled
- `attachments`, `files`, `sync_sources`: empty arrays

## Variant deltas vs basic

| Variant | Input flag(s) | Request-body delta | Flow delta | Captured assistant text |
| --- | --- | --- | --- | --- |
| `basic` | none | Baseline body. | New generated conversation id. | ` OK` |
| `thinking` | `thinking: true` | `create_conversation_params.paprika_mode = "extended"`. Text decoder must ignore `thinking_delta` / `thinking_summary_delta` and emit only text blocks. | New generated conversation id. | ` OK` |
| `web_search` | `web_search: true` | Include `{ "type": "web_search_v0", "name": "web_search" }` in `tools` after `read_me`; baseline omits it. | New generated conversation id. | ` OK` |
| `style_concise` | `style: "concise"` | `personalized_styles[0]` becomes Claude's built-in Concise style: `key/name = "Concise"`, `nameKey = "concise_style_name"`, `summaryKey = "concise_style_summary"`, `isDefault = false`. | New generated conversation id. | ` OK` |
| `style_explanatory` | `style: "explanatory"` | `personalized_styles[0]` becomes Claude's built-in Explanatory style: `key/name = "Explanatory"`, `nameKey = "explanatory_style_name"`, `summaryKey = "explanatory_style_summary"`, `isDefault = false`. | New generated conversation id. | ` What would you like explained?` in primary stream; replay stream produced a longer equivalent clarification. |
| `incognito` | `incognito: true` | No completion-body delta in capture; `create_conversation_params.is_temporary` remains `false`. | Navigate/create from `https://claude.ai/new?incognito=` before same-origin fetch. | ` OK` |
| `model_haiku` | `model: "Haiku 4.5"` | `model = "claude-haiku-4-5-20251001"`; `create_conversation_params.model` same. | New generated conversation id. | ` OK` |
| `model_sonnet` | `model: "Sonnet 4.6"` | `model = "claude-sonnet-4-6"`; `create_conversation_params.model` same. | New generated conversation id. | Primary stream empty; replay stream decoded ` OK`. |
| `reuse_conversation` | `reuse_conversation: true` plus target conversation | Omit `create_conversation_params`; include `parent_message_uuid` resolved from `current_leaf_message_uuid`; keep `model = "claude-sonnet-4-6"`. | Reuse target `conversation_id` and fetch conversation tree before completion when `parent_message_uuid` is not supplied. | ` OK` |
| `attachment_mode_none` | no files / attachment none | Ensure `attachments = []`, `files = []`, `sync_sources = []`. No special body key beyond baseline empty arrays. | New generated conversation id. | ` OK` |

## Implementation notes

- RPC errors must return existing canonical `ConsumerErrorCodes` only; no DOM fallback on RPC error.
- `response_text`, `conversation_id`, `chat_url`, `model_used`, `errorCode`, `error_code`, and `http_status` stay in the RPC output shape.
- The high-level dispatcher may use `WEBAI_CLAUDE_SEND_BACKEND=dom` as an emergency DOM override, but must not catch RPC failures and retry DOM.
