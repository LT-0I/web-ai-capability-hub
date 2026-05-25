Phase 7 Bucket 7 — canvas, Pulse, and Claude Design extension drivers completed.

Changes:
- Added optional `backend` routing for all 9 requested tools: `webai_chatgpt_canvas_export`, `webai_chatgpt_pulse_get`, `webai_chatgpt_pulse_onboard`, `webai_gemini_canvas_to_docs`, `webai_gemini_canvas_edit`, `webai_claude_design_create_project`, `webai_claude_design_generate`, `webai_claude_design_get_html`, and `webai_claude_design_present`.
- Extension-assisted paths cover ChatGPT Canvas/Pulse, Gemini Canvas, and Claude Design panel interactions while preserving the existing managed-CDP handlers when `backend` is omitted or `managed-cdp`.
- Canvas/iframe and design-panel extraction use extension page scripting / DOM inspection and existing error taxonomy only (`IFRAME_NOT_FOUND`, `ELEMENT_NOT_FOUND`, `POSTCONDITION_TIMEOUT`, `ARTIFACT_VERIFICATION_FAILED`, etc.); no new error codes or graceful fallback were added.
- Contract/golden/codemod gates updated for optional `backend` without package or contract version bumps.
- Added `tests/phase7-bucket-7/canvas-pulse-design-extension.test.ts` covering all 9 tools across extension-assisted, managed-CDP, and invalid-backend routing cases.

Validation:
- `npm run build` → pass
- `npm test` → `677/677` pass
- `node --test dist/tests/phase7-bucket-7/canvas-pulse-design-extension.test.js` → `3/3` pass
- `node --test dist/tests/golden/listMcpTools.test.js dist/tests/codemodRegression.test.js` → `5/5` pass
- `git diff --check -- src/mcp/tools.ts configs/consumer-contract.json tests/golden/listMcpTools.195.json tests/codemodRegression.test.ts tests/phase7-bucket-7/canvas-pulse-design-extension.test.ts` → pass
- 8-lock held: `pkg 1.0.0`, `consumer-contract-1.10.0`, `191 commands`, `40 webai_`, `121 research_`, `8 wah_`, `39 error_codes`, golden `195`

Live smoke evidence (relaxed stop condition applied):

1. `chatgpt_pulse_get` read-only extension smoke:
- Command: `node dist/src/cli.js webai:chatgpt:pulse:get --profile chatgpt --backend extension-assisted-cdp --timeout-ms 60000 --json`
- Result: exit `0`, elapsed `4389ms`
- Output summary: route `https://chatgpt.com/pulse`, status `ready`, digest text returned. Full output captured at `.runs/phase7-bucket-7/smoke-chatgpt-pulse_get.json`.

2. `claude_design_get_html` read-only extension smoke:
- Command: `node dist/src/cli.js webai:claude:design:get-html --profile claude-9224 --backend extension-assisted-cdp --project-url 'https://claude.ai/design/p/baf06427-9e7a-41f7-8d8e-79da1a1ca344?file=index.html' --download-dir /tmp/phase7-bucket-7-claude-design --timeout-ms 60000 --json`
- Result: exit `0`, elapsed `5787ms`
```json
{
  "iframeArtifactSha256": "a7fe83ec64bb23eb28090598db3d166ed98e52e39d1afbbfd74c579553f93e4e",
  "savedPath": "/tmp/phase7-bucket-7-claude-design/baf06427-9e7a-41f7-8d8e-79da1a1ca344-a7fe83ec64bb.html",
  "byteSize": 39
}
```

3. `chatgpt_canvas_export` read-only extension smoke:
- Command: `node dist/src/cli.js webai:chatgpt:canvas-export --profile chatgpt --backend extension-assisted-cdp --tab-url-contains 'https://chatgpt.com/c/6a13f606-c3f4-83e8-b134-633eaaeb38c1' --format md --download-dir /tmp/phase7-bucket-7-chatgpt --timeout-ms 60000 --json`
- Result: exit `1`, elapsed `204ms`
```json
{
  "path": "",
  "sha256": "",
  "format": "md",
  "byteSize": 0,
  "errorCode": "CHROME_EXTENSION_NOT_CONNECTED",
  "error_code": "CHROME_EXTENSION_NOT_CONNECTED",
  "message": "No extension-assisted browser tab is available to claim"
}
```
- Retry command: `node dist/src/cli.js webai:chatgpt:canvas-export --profile chatgpt --backend extension-assisted-cdp --tab-url-contains 'chatgpt.com' --format md --download-dir /tmp/phase7-bucket-7-chatgpt --timeout-ms 60000 --json`
- Retry result: exit `1`, elapsed `9863ms`
```json
{
  "path": "",
  "sha256": "",
  "format": "md",
  "byteSize": 0,
  "errorCode": "ELEMENT_NOT_FOUND",
  "error_code": "ELEMENT_NOT_FOUND",
  "message": "No element matched --button-selector"
}
```

Live smokes deferred to B9 sweep because they are mutating/state-changing or require real setup state:
- `webai_chatgpt_pulse_onboard`
- `webai_gemini_canvas_to_docs`
- `webai_gemini_canvas_edit`
- `webai_claude_design_create_project`
- `webai_claude_design_generate`
- `webai_claude_design_present`
