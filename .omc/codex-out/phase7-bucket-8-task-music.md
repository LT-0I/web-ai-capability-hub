# Phase 7 Bucket 8 — task_status + Gemini Music polling extension drivers

Status: implemented and verified.

## Scope delivered

- Added `backend` routing for:
  - `webai_task_status`
  - `webai_gemini_music_download_track`
  - `webai_gemini_music_task_status`
- Kept `managed-cdp` as the default path.
- Added `extension-assisted-cdp` driver path for Gemini Music task polling/download.
- `webai_task_status` can poll Gemini Music task handles via extension when given a `gemini_music_*` task id or Gemini conversation URL context.
- No package version bump, no `contract_version` bump, no new commands, no new error codes, no graceful fallback, and no managed-CDP path change.

## Files changed

- `src/mcp/tools.ts`
- `configs/consumer-contract.json`
- `tests/golden/listMcpTools.195.json`
- `tests/codemodRegression.test.ts`
- `tests/phase7-bucket-8/task-music-extension.test.ts`
- `.runs/phase7-bucket-8/smoke-webai-task-status.json`
- `.runs/phase7-bucket-8/smoke-gemini-music-task-status.json`
- `.runs/phase7-bucket-8/smoke-gemini-music-download-track.json`

## Validation

- `npm run build` → pass via final `npm test` build step.
- `npm test` → pass: `677/677`, duration `270302.200311ms`.
- Bucket 8 targeted coverage:
  - `node --test dist/tests/phase7-bucket-8/task-music-extension.test.js dist/tests/golden/listMcpTools.test.js dist/tests/codemodRegression.test.js` → pass: `8/8`.
  - Covers all 3 tools across extension-assisted routing, managed/default preservation, and invalid backend cases.
- Generated clean check:
  - `git diff -- src/generated` → empty.
- 8-lock held:
  - package version: `1.0.0`
  - contract version: `consumer-contract-1.10.0`
  - commands: `191`
  - `webai_`: `40`
  - `research_`: `121`
  - `wah_`: `8`
  - error codes: `39`
  - MCP golden tools: `195`

## Live smokes — Gemini only, ChatGPT-free

Reused prior completed Gemini Music task because one existed:

- task id: `gemini_music_1779683236609`
- conversation URL: `https://gemini.google.com/app/119b2a177a8017ef`
- profile: `gemini-9225`

Smoke artifacts:

- `.runs/phase7-bucket-8/smoke-webai-task-status.json`
  - exit: `0`
  - result: `status=complete`, `download_ready=true`, `errorCode=null`
- `.runs/phase7-bucket-8/smoke-gemini-music-task-status.json`
  - exit: `0`
  - result: `status=complete`, `download_ready=true`, `errorCode=null`
- `.runs/phase7-bucket-8/smoke-gemini-music-download-track.json`
  - exit: `0`
  - result: `format=mp3`, `byteSize=724547`, `sha256=bdc86976edd5ef2b2082491672403e44c09d54ffd2ff562abe48bb78950503c7`

Live smoke failures: none.

## Notes

- Fresh in-bucket Gemini Music generation was not required because a completed prior Gemini Music task handle was available.
- The downloaded MP3 binary was not retained in the commit; the smoke JSON captures the saved-path metadata, size, hash, and result envelope.
- Existing unrelated dirty files from prior buckets were intentionally left unstaged.
