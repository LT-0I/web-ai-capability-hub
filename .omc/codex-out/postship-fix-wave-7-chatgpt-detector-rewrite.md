# Post-ship FIX wave 7 — ChatGPT detector rewrite + selector live-probe

## Result

SHIP gate passed: **6/8 ChatGPT workflows PASS** under the required serialized rate-cap run.

## Code changes

- `src/mcp/tools.ts`
  - Replaced ChatGPT generated-file readiness with a live-probed assistant-message file/control detector and a 5s settle before artifact click.
  - Extended ChatGPT generated-file locate budget to 120s default / 180s for pptx.
  - Scoped Canvas export download selector to the live-probed `main` Download menu button.
  - Broadened Web-search active-pill selector to the live-probed Search/remove aria-label shape.
  - For Codex submit, wait for the live-probed composer/env controls and skip the env dialog when `LT-0I/CN-` is already selected.

## Live probes recorded

- `.runs/postship-fix-wave-7/probes/file-chip-selectors.json`
  - Live generated-file control: `[data-message-author-role="assistant"] button.behavior-btn`
  - The originally proposed attachment/download selectors were absent on the probed response.
- `.runs/postship-fix-wave-7/probes/canvas.json`
  - Live Canvas export selector: `main button[aria-haspopup="menu"]:has-text("Download")`
- `.runs/postship-fix-wave-7/probes/codex-submit.json`
  - Live Codex selectors: env `button[aria-label="View all code environments"]`, composer `#prompt-textarea`, submit `button[aria-label="Submit"]`.
- `.runs/postship-fix-wave-7/probes/web-search.json`
  - Live Web-search active selector: `button[aria-label="Search, click to remove"]` plus case-insensitive Search/remove variant.

## Validation

- `rm -rf dist && npm run build` — PASS.
- `npm test` — PASS, **731/731**.
  - Latest post-follow-up log: `.runs/postship-fix-wave-7/npm-test-after-followup.txt`.
- Serialized 8-YAML ChatGPT smoke — PASS gate, **6/8**.
  - Summary: `.runs/postship-fix-wave-7/workflows/summary.md`.
  - No 429 encountered.
  - Tabs were closed between YAMLs; log: `.runs/postship-fix-wave-7/workflows/chatgpt-tab-discipline.jsonl`.

## 8-YAML smoke results

| Workflow | Result | Notes |
|---|---:|---|
| chatgpt-generate-file-csv-ext | PASS | Downloaded `.csv`. |
| chatgpt-generate-file-docx-ext | PASS | Downloaded `.docx`. |
| chatgpt-generate-file-md-ext | PASS | Downloaded `.md`. |
| chatgpt-generate-file-pptx-ext | FAIL | Pre-follow-up run hit `COMMAND_TIMEOUT`; final code now gives pptx prompt completion the 180s generated-file budget, but no extra YAML was run after the 8-YAML cap. |
| chatgpt-generate-file-py-ext | PASS | Downloaded `.py`. |
| chatgpt-canvas-create-export-ext | PASS | Exported Markdown. |
| chatgpt-codex-submit-task-ext-fallback | FAIL | Pre-follow-up run missed env selector; final code now accepts already-selected `LT-0I/CN-`, but no extra YAML was run after the 8-YAML cap. |
| chatgpt-send-web-search-ext | PASS | Response completed with 2026 dated items. |

## Constraint audit

- No package version, contract version, error code, golden listMcpTools, consumer contract test, or managed-CDP driver changes.
- Code touch was limited to ChatGPT dispatch/driver logic in `src/mcp/tools.ts`.
- No graceful alternate action path was added for generated-file download; the detector surfaces `ELEMENT_NOT_FOUND` if the live-probed ready selector misses.
- 8-YAML cap was respected; no additional ChatGPT YAMLs were run after the required serialized wave.

## Remaining risk / deferred

- `chatgpt-generate-file-pptx-ext` and `chatgpt-codex-submit-task-ext-fallback` were not re-run after the small follow-up patch because the ChatGPT wave cap was already consumed.
- Gate still passes at 6/8, so this wave is shippable per acceptance threshold.
