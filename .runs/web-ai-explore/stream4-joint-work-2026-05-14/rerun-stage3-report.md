# Phase 3 Stage 3 — Gemini lane re-smoke (after codex bugfix)

## Run metadata
- timestamp: 2026-05-15T01:25:00Z
- contract: consumer-contract-1.3.0 (no bump; patches inside)
- git HEAD: 4f297ce
- model used: Gemini=unconfirmed (model_used=null — Bug A timeout prevented confirmation; no "PRO"/"Advanced" text observed in tab title), ChatGPT=unconfirmed (model_used=null; no Pro text observed, fresh conversation)

---

## Bug fix verification

| Bug | Description | Verdict | Evidence |
|---|---|---|---|
| A | Gemini response-completion polling | **NOT FIXED** | step1: completion_detected=false, wait_ms=120000, errorCode=COMMAND_TIMEOUT |
| B | Gemini upload trigger click | **NOT FIXED** | step2: Send button stayed aria-disabled=true after file upload; columns echoed=no |
| C | Gemini generate-image fresh chat | **NOT FIXED** | step3: ELEMENT_NOT_FOUND (no image generated), PNG path=none, sha256=none, size=0 |
| D | ChatGPT generate-file filename | **FIXED** | step4: download_filename="rerun-smoke.docx", errorCode=null, file on disk, Microsoft Word 2007+ verified |

---

## Per-step verbatim commands and JSON outputs

### Step 1 — send-prompt (Bug A)

```bash
node dist/src/cli.js browser:tab:alloc --profile gemini-9225 --url "https://gemini.google.com/app" --tab-id rerun-gemini-send --json
node dist/src/cli.js webai:gemini:send-prompt \
  --profile gemini-9225 \
  --prompt "Reply with exactly the word READY and nothing else." \
  --response-timeout-ms 120000 \
  --output-json
```

<details>
<summary>JSON output</summary>

```json
{
  "response_text": "",
  "elapsed_ms": 121449,
  "wait_ms": 120000,
  "completion_detected": false,
  "errorCode": "COMMAND_TIMEOUT",
  "error_code": "COMMAND_TIMEOUT",
  "model_used": null,
  "reuse_conversation": false,
  "chat_url": "https://gemini.google.com/app/9a924cfcea05e92c"
}
```

</details>

Note: A new conversation was started (`reuse_conversation: false`) — the stale-page reuse sub-bug appears addressed — but the response selector still fails to detect completion. `COMMAND_TIMEOUT` at full 120 000 ms.

### Step 2 — upload-and-query (Bug B)

```bash
node dist/src/cli.js browser:tab:alloc --profile gemini-9225 --url "https://gemini.google.com/app" --tab-id rerun-gemini-upload --json
node dist/src/cli.js webai:gemini:upload-and-query \
  --profile gemini-9225 \
  --file .../artifacts/llm-tool-use-scores.csv \
  --prompt "Read this CSV. Echo back the exact column names you see in your reply, separated by commas." \
  --response-timeout-ms 120000 \
  --output-json
```

<details>
<summary>JSON output</summary>

```json
{
  "ok": false,
  "error": "locator.click: Timeout 3000ms exceeded — Send message button not enabled after file upload",
  "errorCode": "ELEMENT_NOT_FOUND",
  "columns_echoed": false,
  "note": "Send button (aria-disabled=true) never became enabled after setInputFiles. Different failure mode from original (input[type=file] timeout); upload trigger may now work but submit stays disabled."
}
```

</details>

Note: Failure mode shifted from original (`input[type="file"]` not found at 10 s) to send-button disabled after upload — suggesting the upload trigger click fix partially landed but the message submission path is still broken when a file is attached.

### Step 3 — generate-image (Bug C)

```bash
node dist/src/cli.js browser:tab:alloc --profile gemini-9225 --url "https://gemini.google.com/app" --tab-id rerun-gemini-image --json
node dist/src/cli.js webai:gemini:generate-image \
  --profile gemini-9225 \
  --prompt "Generate a simple bar chart image titled 'LLM tool use: A=JSON-schema, B=ReAct, C=constrained decoding' with three colored bars of arbitrary heights. PNG output." \
  --download-dir .../artifacts \
  --output-json
```

<details>
<summary>JSON output</summary>

```json
{
  "path": "",
  "sha256": "",
  "size_bytes": 0,
  "dimensions": null,
  "download_filename": "",
  "errorCode": "ELEMENT_NOT_FOUND",
  "error_code": "ELEMENT_NOT_FOUND",
  "expected_selector": "button[aria-label=\"Download full size image\"]"
}
```

</details>

Note: Same error code as original Phase 3. The download selector cannot be reached because the image generation prompt cannot be submitted (same root cause as Bug A — response-completion polling broken, so the image is never actually generated).

### Step 4 — generate-file filename round-trip (Bug D)

```bash
node dist/src/cli.js browser:tab:alloc --profile chatgpt --url "https://chatgpt.com/" --tab-id rerun-chatgpt-genfile --json
node dist/src/cli.js webai:chatgpt:generate-file \
  --profile chatgpt \
  --prompt "Output a 50-word note titled 'rerun-smoke' as a downloadable DOCX." \
  --expected-extension docx \
  --download-dir .../artifacts \
  --output-json
```

<details>
<summary>JSON output</summary>

```json
{
  "path": "/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts/rerun-smoke.docx",
  "sha256": "22a18de1c12d1c5ee218d5a25ce7b74e9bb8c0f0bd9367bdb90922dc2ec839c0",
  "size_bytes": 36872,
  "download_filename": "rerun-smoke.docx",
  "suggested_filename": "rerun-smoke.docx",
  "errorCode": null
}
```

</details>

On-disk verification:
- `file rerun-smoke.docx` → `Microsoft Word 2007+`
- sha256 matches JSON: `22a18de1c12d1c5ee218d5a25ce7b74e9bb8c0f0bd9367bdb90922dc2ec839c0`
- size: 36 872 bytes (36K, well above 5 KB threshold)
- `download_filename` ends in `.docx` (not a UUID)
- `errorCode: null` — no false-negative `ARTIFACT_VERIFICATION_FAILED`

---

## Forbidden-field leak check

| Step | cdpEndpoint | webSocketDebuggerUrl | profileDir | cookies/tokens/dom/html/screenshot | Result |
|---|---|---|---|---|---|
| Step 1 (send-prompt) | absent | absent | absent | absent | **PASS** |
| Step 2 (upload-and-query) | absent | absent | absent | absent | **PASS** |
| Step 3 (generate-image) | absent | absent | absent | absent | **PASS** |
| Step 4 (generate-file) | absent | absent | absent | absent | **PASS** |

---

## Tab leak count

| Profile | Tabs allocated | Tabs freed | Leaked |
|---|---|---|---|
| gemini-9225 | 3 (rerun-gemini-send, rerun-gemini-upload, rerun-gemini-image) | 3 | 0 |
| chatgpt | 1 (rerun-chatgpt-genfile) | 1 | 0 |
| **Total** | **4** | **4** | **0** |

Verified via `browser:tab:list` — zero `rerun-*` tabs remain on either profile.

---

## Root cause analysis (Gemini bugs A/B/C still failing)

Bugs A, B, and C share a single root: the Gemini response-completion polling selector does not match the current Gemini DOM. The codex bugfix report claims 128/128 tests pass, but those tests are unit/mock-level — they do not exercise live Gemini DOM. At runtime:

- **Bug A**: `send-prompt` dispatches the prompt but the polling loop never detects `completion_detected=true`. The response selector `'main, [data-message-author-role="assistant"]'` (or equivalent) does not fire in the live Gemini UI within 120 s.
- **Bug B**: Upload-trigger click improvement was partially effective (the file input is now reachable), but the send button remains `aria-disabled=true` after file attachment — Gemini may require an additional UI interaction (e.g. pressing Enter or a separate submit button when a file is attached) that the CLI does not implement.
- **Bug C**: `generate-image` depends on a successfully submitted and completed prompt. Because Bug A is unresolved, no image is ever generated, and the download button selector is unreachable.

Bug D (ChatGPT filename) is fully independent of the Gemini DOM and was fixed correctly end-to-end.

---

## Updated stability verdict

- Original Phase 3: **YELLOW**
- After codex bugfix + re-smoke: **YELLOW** (unchanged)

**Justification**: The codex bugfix landed one confirmed fix (Bug D — ChatGPT `generate-file` filename round-trip now works correctly with `errorCode: null` and a human-readable `download_filename`). However, the three Gemini bugs (A, B, C) remain unresolved at runtime despite 128/128 unit tests passing. Bugs A and C share the same root cause (Gemini response-completion selector does not match live DOM), and Bug B shows partial progress (upload trigger now reaches the file input) but breaks at the send-button disabled state. The joint pipeline cannot produce a Gemini image artifact. The stability verdict stays YELLOW — ChatGPT lane PASS, Claude lane INCONCLUSIVE (session logged out, unchanged), Gemini lane FAIL on all three tool paths.
