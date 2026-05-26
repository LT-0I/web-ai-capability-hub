# Post-ship fix wave 3 — ChatGPT extension-driver selector hardening

- Generated: 2026-05-26T06:07:27.445035+00:00
- Backend: `extension-assisted-cdp`
- Scope: ChatGPT ELEMENT_NOT_FOUND cluster (6), `chatgpt-gpts-converse`, `chatgpt-upload-multi`, Codex env fallback, and image mode.
- Fixture setup: `/tmp/explore-2026-05-25/fixtures/fileA.txt`, `fileB.txt`, `fileC.txt`; downloads under `/tmp/explore-2026-05-25/chatgpt`.
- Rate-cap compliance: strict serial runner `.runs/postship-fix-wave-3/run-chatgpt-smokes.sh`; CDP tab cleanup kept only `https://chatgpt.com/` between YAMLs; 20s sleeps between YAMLs; no 429/rate-limit-like output detected, so no 120s cooldown was triggered.
- Gate result: **7/10 PASS** (ship gate: >=6/10).
- Unit validation: `npm test` → **731/731 pass**.

| Workflow | YAML | Result | workflow:run exit | Error | Notes |
| --- | --- | --- | ---: | --- | --- |
| `chatgpt-canvas-create-export-ext` | `examples/workflows/chatgpt-canvas-create-export-ext.yaml` | **FAIL** | `0` | `ELEMENT_NOT_FOUND` | command gate failed: exit_code 1 !== 0; json_path path empty |
| `chatgpt-deep-research-ext` | `examples/workflows/chatgpt-deep-research-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-select-model-thinking-ext` | `examples/workflows/chatgpt-chatgpt-select-model-thinking-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-send-thinking-ext` | `examples/workflows/chatgpt-chatgpt-send-thinking-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-send-web-search-ext` | `examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml` | **FAIL** | `0` | `ELEMENT_NOT_FOUND` | command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}\|May\|5月\|January\|February\|March\|April\|June\|July\|August\|September\|October\|November\|December/ failed; json_path completion_detected  |
| `chatgpt-chatgpt-upload-single-ext` | `examples/workflows/chatgpt-chatgpt-upload-single-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-gpts-converse-ext-fallback` | `examples/workflows/chatgpt-chatgpt-gpts-converse-ext-fallback.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-upload-multi-ext` | `examples/workflows/chatgpt-chatgpt-upload-multi-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `chatgpt-chatgpt-codex-submit-task-ext-fallback` | `examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml` | **FAIL** | `0` | `ELEMENT_NOT_FOUND` | command gate failed: exit_code 1 !== 0; json_path task_id empty |
| `chatgpt-generate-image-ext` | `examples/workflows/chatgpt-generate-image-ext.yaml` | **PASS** | `0` | `` | command gate passed |

## Selector/flow changes
- Added a ChatGPT-specific extension click path that dispatches pointer/mouse/click events through the extension JavaScript bridge; live probing showed vendor `chrome_click` resolved the model/plus buttons but did not open the Radix menus.
- Reused the live-probed ChatGPT model menu shape (`data-testid=model-switcher-gpt-5-5*`) for Thinking/Instant/Pro selection and wired `--thinking` to select Thinking on send-prompt.
- Kept upload input on `input#upload-files` and relaxed pre-prompt attachment readiness so ChatGPT uploads do not require a send button before prompt fill.
- Fail-closed custom GPT URLs (`/g/...`) with `MODEL_SELECTION_DRIFT` instead of trying to converse on unsupported GPT surfaces.
- Loosened ChatGPT Codex allowed-env XPath away from the brittle dialog-only path while preserving the LT-0I/CN- allowlist guard.

## Remaining non-pass observations
- `chatgpt-canvas-create-export-ext`: `ELEMENT_NOT_FOUND` — command gate failed: exit_code 1 !== 0; json_path path empty
- `chatgpt-chatgpt-send-web-search-ext`: `ELEMENT_NOT_FOUND` — command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}|May|5月|January|February|March|April|June|July|August|September|October|November|December/ failed; json_path completion_detected !== true
- `chatgpt-chatgpt-codex-submit-task-ext-fallback`: `ELEMENT_NOT_FOUND` — command gate failed: exit_code 1 !== 0; json_path task_id empty

## Probe artifacts
- `.runs/postship-fix-wave-3/probes/probe-chatgpt-current.json` — Playwright CDP DOM: prompt, send, model menu, plus menu, upload input.
- `.runs/postship-fix-wave-3/probes/probe-chatgpt-extension-selectors.json` — extension path selector/click behavior; vendor click did not open ChatGPT Radix menus.
- `.runs/postship-fix-wave-3/probes/probe-chatgpt-codex-env.json` — Codex environment list shape and allowed LT-0I/CN- row.
