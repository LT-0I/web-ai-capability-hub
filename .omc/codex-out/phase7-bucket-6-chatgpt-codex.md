Phase 7 Bucket 6 — ChatGPT codex_* extension drivers completed.

Changes:
- Added `backend` routing for `webai_chatgpt_codex_submit_task`, `webai_chatgpt_codex_list_envs`, `webai_chatgpt_codex_task_status`, and `webai_chatgpt_codex_get_diff`.
- Extension-assisted path is isolated to the ChatGPT Codex cloud/control-panel surface and reuses the existing Codex allowlist gates.
- Managed-CDP path remains delegated to the existing sub-MCP handlers; no managed-cdp implementation paths were changed.
- Contract/golden/codemod gates updated for optional `backend` without package or contract version bumps.
- Added `tests/phase7-bucket-6/chatgpt-codex-extension.test.ts` covering 4 tools × extension/managed/invalid routing cases.

Validation:
- `npm run build` → pass
- `npm test` → `677/677` pass
- `node --test dist/tests/phase7-bucket-6/chatgpt-codex-extension.test.js dist/tests/golden/listMcpTools.test.js dist/tests/codemodRegression.test.js` → `8/8` pass
- 8-lock held: `pkg 1.0.0`, `consumer-contract-1.10.0`, `191 commands`, `40 webai_`, `121 research_`, `8 wah_`, `39 error_codes`, golden `195`

Live smoke evidence (relaxed stop condition applied):

1. `codex_list_envs` read-only extension smoke:
```json
{
  "status": "ok",
  "envs": [
    {
      "name": "LT-0I/CN-",
      "repo": "LT-0I/CN-",
      "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a",
      "github_url": "https://github.com/LT-0I/CN-",
      "task_count": 16,
      "creator": "cherrypie85arrow@gmail.com",
      "created_at": "May 15, 2026"
    }
  ]
}
```

2. `codex_task_status` extension smoke with prior task id `task_e_6a13e13f1184832d8c1552606b2b95c6`:
```json
{
  "ok": false,
  "status": "failed",
  "errorCode": "INVALID_ARGS",
  "error_code": "INVALID_ARGS",
  "message": "ChatGPT Codex task refused: task page does not prove LT-0I/CN- ownership.",
  "repo": "LT-0I/CN-",
  "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a"
}
```

3. `codex_submit_task` live smoke skipped by bucket instruction to avoid queue noise. CLI help does not expose a webai codex `--dry-run`; routing is covered by npm/B6 tests.

4. `codex_get_diff` live smoke skipped by bucket instruction because it requires real cloud task state. CLI help does not expose a webai codex `--dry-run`; routing is covered by npm/B6 tests.
