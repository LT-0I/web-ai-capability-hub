# Resmoke R5 — Final Convergence Live Smoke Report

Date: 2026-05-15
Repo: /home/l1u/workspace/noeticmind/web-ai-capability-hub
Scope: ONE positive live smoke per tool, no retries, no src/test/config edits, no commits.

## Pre-flight (all PASS)
- CDP `:9223/json/version` → Chrome/148.0.7778.167 OK
- CDP `:9225/json/version` → Chrome/148.0.7778.167 OK
- `browser:status --profile chatgpt --json` → `"connected": true`
- `browser:status --profile gemini-9225 --json` → `"connected": true`
- Probe file `/tmp/r5-probe.txt` (45 B) created; `r5-downloads/` created (stayed empty).
- Flags: webai compat CLI exposes `--profile --prompt --download-dir --file --tab-url-contains --output-json`; generic `--timeout-ms` honored (→ `timeout_ms`). No CLI model flag exists for these MCP-compat commands (model/tab selection internal to adapter; accounts untouched). Used `--timeout-ms 180000`.

## Per-tool verdicts

### 1. ChatGPT generate_image — RED
- Evidence: `resmoke-r5-chatgpt-generate-image.json`
- `{"ok":false,"error":"locator.click: Timeout 15000ms exceeded.\n  - waiting for locator('[role=\"menuitemradio\"]:has-text(\"Create image\")').first()"}`
- errorCode: none emitted (raw Playwright error string only — not a contract error code)
- selector failed: `[role="menuitemradio"]:has-text("Create image")`
- wait_ms: 15000 (the actionability-fix timeout) ; completion_detected: n/a (never reached)
- Artifact: none (r5-downloads empty)
- The R5 actionability fix (wait visible + 15000ms click) did NOT resolve it — the menuitemradio is still not clickable/found.

### 2. Gemini generate_image — RED
- Evidence: `resmoke-r5-gemini-generate-image.json`
- `errorCode: COMMAND_TIMEOUT`, message "Image generation did not complete before timeout"
- size_bytes: 0, path "", download_filename "" ; completion_detected: false (implied)
- Artifact: none (r5-downloads empty)
- Either the Create-image activation path (zero-state chip / Tools-drawer menuitemcheckbox) or the completion gate did not converge within 180000ms.

### 3. Gemini upload_and_query — RED (with partial-success signals)
- Evidence: `resmoke-r5-gemini-upload-and-query.json`
- `files_in_chip: ["r5-probe.txt"]` → UPLOAD SUCCEEDED. **NO OS file dialog appeared** (exit 0, no hang) — filechooser interception is NOT regressed.
- `chat_url: https://gemini.google.com/app/007e62c813a0b756?hl=en` (fresh /app, hl=en honored)
- `response_text: ""`, `wait_ms: 120000`, `completion_detected: false`, `errorCode: COMMAND_TIMEOUT`
- Failure is purely the completion gate: the new `button[data-test-id="regenerate-button"]` + Send-enabled + no-"Stop response" gate never fired within 120 s.

## OS dialog / completion notes
- Gemini upload triggered NO OS file dialog (interception verified working).
- NO Gemini response completed (completion gate timed out in both Gemini cases; response_text empty).

## Tab hygiene
- Allocated zero tabs myself; webai adapter reuses internal `session-*` tabs. Nothing to free. Pre-existing tabs untouched. Verified via `browser:tab:list`.

## Final tally: 0/3 GREEN (3 RED)

## Judgement calls
- Used `--timeout-ms 180000` for image gen and upload (generous, within "60-120s" guidance plus margin).
- No model flag exists on these compat commands; did not alter accounts/models (cheap-model rule satisfied by not touching identity).
- One attempt per tool, no retries, per process-safety rules. No browser/process touched.
- Evidence JSON files are ground truth and are committed to the run dir.
