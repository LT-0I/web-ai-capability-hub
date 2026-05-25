# C9 blocker — ChatGPT conversation_manage + workspace

Both requested C9 capabilities failed their close-loop gates under the current managed-CDP CLI contract.

- `chatgpt-conversation-manage-ext-fallback`: FAIL_CLOSED_UNSUPPORTED (`HUMAN_HANDOFF_REQUIRED`)
  - Gate: rename `ok === true` AND delete `ok === true`
  - Current behavior: `webai_chatgpt_conversation_manage` returns `HUMAN_HANDOFF_REQUIRED` for `rename` and `delete` before browser execution.
  - Evidence: `.runs/capability-explore-2026-05-25/chatgpt/chatgpt-conversation-manage-ext-fallback.json`
- `chatgpt-workspace-ext-fallback`: FAIL_CLOSED_UNSUPPORTED (`INVALID_ARGS`)
  - Gate: `workspaces` array non-empty OR `{ok:true,count:N}`
  - Current behavior: `webai_chatgpt_workspace` requires `--surface` and rejects unsupported `--action list` at schema validation.
  - Evidence: `.runs/capability-explore-2026-05-25/chatgpt/chatgpt-workspace-ext-fallback.json`

Per bucket rule, this is a bucket-level blocker condition (2/2 caps failed).

Generated: 2026-05-24T19:26:26.985399Z
