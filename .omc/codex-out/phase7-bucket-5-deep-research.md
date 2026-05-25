# Phase 7 Bucket 5 — deep_research extension drivers

Status: completed driver scaffold, routed and tested; live smoke submissions did not reach success condition and are recorded below per relaxed Slice B stop conditions.

## Scope / files

- `src/mcp/tools.ts` — added explicit `backend: "extension-assisted-cdp"` dispatch for:
  - `webai_chatgpt_deep_research`
  - `webai_claude_deep_research`
  - `webai_gemini_deep_research`
- `configs/consumer-contract.json` — documented optional `backend` input and optional `chat_url` output for the 3 tools; no package or contract version bump.
- `tests/golden/listMcpTools.195.json` — added optional backend enum to the 3 MCP schemas; golden count remains 195.
- `tests/codemodRegression.test.ts` — allowed backend in the 185-superset regression normalization for these 3 tools.
- `tests/phase7-bucket-5/deep-research-extension.test.ts` — routing coverage for 3 services × 3 cases.

Out of scope honored: no managed-cdp path edits, no new error codes, no pkg/contract_version bump.

## Gates

- `npm run build` → pass.
- `node --test dist/tests/phase7-bucket-5/*.test.js` → pass, `3/3` tests.
- `npm run verify:contract-version` → pass.
- `npm run verify:golden` → pass.
- `node --test dist/tests/codemodRegression.test.js` → pass, `4/4` tests.
- `npm test` → pass, `677/677` tests.

## 8-lock contract

Held:

```json
{
  "package_version": "1.0.0",
  "contract_package_version": "1.0.0",
  "contract_version": "consumer-contract-1.10.0",
  "commands": 191,
  "golden_tools": 195,
  "webai": 40,
  "research": 121,
  "wah": 8,
  "error_codes": 39
}
```

Only the allowed contract/golden surfaces changed; `package.json` and lockfiles were not modified.

## Live smokes

Command shape used: extension-assisted backend, short prompt, `--response-timeout-ms 180000`, JSON output captured under `.runs/phase7-bucket-5/`. The requested smoke success condition was `errorCode: null` plus `task_id` or `chat_url`; all 3 live smokes failed before that condition and are intentionally non-blocking under the relaxed directive.

| Service | Capture | Exit | errorCode | task_id | chat_url | Message |
| --- | --- | ---: | --- | --- | --- | --- |
| ChatGPT | `.runs/phase7-bucket-5/smoke-chatgpt.json` | 1 | `ELEMENT_NOT_FOUND` | `task_1779711054726_a2c3e49e5b75` | `https://chatgpt.com/` | `ELEMENT_NOT_FOUND: ChatGPT model option was not found: Thinking` |
| Claude | `.runs/phase7-bucket-5/smoke-claude.json` | 1 | `ELEMENT_NOT_FOUND` | `task_1779711087584_6e638a52a6f4` | `https://claude.ai/new` | `ELEMENT_NOT_FOUND: Claude composer plus menu button was not found` |
| Gemini | `.runs/phase7-bucket-5/smoke-gemini.json` | 1 | `ELEMENT_NOT_FOUND` | `task_1779711103761_12968d09916d` | `https://gemini.google.com/app` | `ELEMENT_NOT_FOUND: Gemini Deep research menuitemcheckbox was not found` |

Full report generation was intentionally not awaited in smoke.
