# Path C Claude Wave B3 inventory

Source captures: `.runs/path-c-claude-rpc/wave-a-captures/`.

Dispatcher entry-points located by `grep -rn 'name: ["'"'"'\''"'"']webai_claude_*' src/`:

- Tool spec registrations: `src/mcp/tools.ts`
  - `webAiClaudeSelectModel` (high-level dispatcher)
  - `webAiClaudeConversationManage` (high-level dispatcher)
  - `webAiClaudeWorkspace` (high-level dispatcher)
- Manifest-backed generated specs also exist, but are not the default runtime branch for this Wave B3 dispatcher migration:
  - `src/generated/tools/webai-claude-select-model.ts`
  - `src/generated/tools/webai-claude-conversation-manage.ts`
  - `src/generated/tools/webai-claude-workspace.ts`

## Captured endpoint map

| Tool family | Variant | Captured primary method/path | Variant-specific RPC request(s) used |
| --- | --- | --- | --- |
| workspace | `surface_projects` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then `GET /api/organizations/<org>/projects_v2?limit=30&offset=0&filter=is_creator&order_by=latest_activity&searchQuery=&is_archived=false` |
| workspace | `surface_integrations` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` read |
| workspace | `surface_skills` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then `GET /api/organizations/<org>/skills/list-skills` |
| workspace | `surface_appearance` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then `GET /api/organizations/<org>/experiences/claude_web?locale=en-US` |
| workspace | `surface_style_presets` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then `GET /api/organizations/<org>/list_styles` |
| select_model | `haiku` | `GET /api/organizations/<org>/model_configs/claude-haiku-4-5-20251001` | captured model-config GET, then captured settings PATCH bodies `{"paprika_mode":null}` and `{"default_model":"claude-haiku-4-5-20251001"}` |
| select_model | `sonnet` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then captured settings PATCH bodies `{"paprika_mode":null}` and `{"default_model":"claude-sonnet-4-6"}` |
| select_model | `adaptive_on` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then captured settings PATCH body `{"paprika_mode":"extended"}` |
| conversation_manage | `action_list` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then `GET /api/organizations/<org>/chat_conversations_v2?limit=30&starred=false&consistency=eventual` |
| conversation_manage | `action_search` | `GET /api/organizations/<org>/sync/settings` | captured `sync/settings` probe, then conversation-list GET filtered locally by query |
| conversation_manage | `action_share` | captured setup was `POST /api/organizations/<org>/chat_conversations/<id>/completion` with safe prompt body | production RPC preserves existing sensitive-content guard unless `confirmed:true`; it never performs public-share mutation |
| conversation_manage | `action_sidebar_options` | `GET /api/organizations/<org>/sync/settings` | production RPC preserves existing `HUMAN_HANDOFF_REQUIRED` for Radix sidebar kebab |

## Driver files

- `src/mcp/claude_workspace_rpc.ts`
- `src/mcp/claude_select_model_rpc.ts`
- `src/mcp/claude_conversation_manage_rpc.ts`

All three connect to the existing `claude-9224` CDP profile and issue same-origin `page.evaluate(fetch(..., { credentials: "include" }))` calls. RPC is the production default after dispatcher flip; environment variables are the only DOM override path.
