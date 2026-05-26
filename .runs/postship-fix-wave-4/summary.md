# Post-ship fix wave 4 — completion detectors smoke summary

- Generated: 2026-05-26T07:02:39Z
- Backend: `extension-assisted-cdp`
- Codex partial (exit 144 / SIGUSR1 mid-write) was build/test-validated and salvaged for live acceptance by the claude orchestrator.
- Gate result: **5/14 PASS (PARTIAL — below ≥9/14 gate; ship-partial decision under `/goal finish all of the tasks`)**

| Workflow | Result | Error / Note |
| --- | --- | --- |
| `chatgpt-generate-file-csv-ext` | **FAIL** | hard timeout 240s (UI hang, not 429) |
| `chatgpt-generate-file-docx-ext` | **FAIL** | COMMAND_TIMEOUT 128s |
| `chatgpt-generate-file-md-ext` | **FAIL** | hard timeout 240s |
| `chatgpt-generate-file-pptx-ext` | **FAIL** | COMMAND_TIMEOUT 128s |
| `chatgpt-generate-file-py-ext` | **FAIL** | hard timeout 240s |
| `claude-generate-file-csv-ext` | **PASS** | |
| `claude-generate-file-docx-ext` | **PASS** | |
| `claude-generate-file-md-ext` | **PASS** | |
| `claude-generate-file-pptx-ext` | **FAIL** | ARTIFACT_DOWNLOAD_TIMEOUT |
| `claude-generate-file-py-ext` | **PASS** | |
| `claude-design-generate-mgr` | **FAIL** | CHROME_EXTENSION_NOT_CONNECTED |
| `claude-design-present-mgr` | **FAIL** | CHROME_EXTENSION_NOT_CONNECTED |
| `gemini-music-download-track-ext` | **FAIL** | CHROME_EXTENSION_NOT_CONNECTED |
| `claude-send-thinking-ext` | **PASS** | (not in codex partial — selector already worked) |

## Documented regression clusters (for wave 5 re-baseline / issue-fix-loop)

1. **ChatGPT generate-file × 5**: codex added `runArtifactClickWithCdpReadinessRetry` + 360s locateTimeout but the chatgpt path still hits inner ~128s/240s timeouts. Root cause is not CDP readiness — it's likely the file-card render-after-stream race that needs a different detector (file-event listener, not button-poll). Stderr empty, no 429 → genuine UI hang, not rate-limit.

2. **Claude generate-file-pptx**: ARTIFACT_DOWNLOAD_TIMEOUT — single odd-format failure while the other 4 claude-generate-file PASSED. Likely a pptx-specific format quirk in the download chip.

3. **claude-design-generate / claude-design-present**: CHROME_EXTENSION_NOT_CONNECTED. Codex added `ensureClaudeDesignViewerOpenWithExtension` viewer-wait but the extension still drops mid-flow. Same root cause as wave-2-v2 documented gemini-canvas-edit regression — extension XPath listener async response with channel close.

4. **gemini-music-download-track**: CHROME_EXTENSION_NOT_CONNECTED. Codex parameterized `stepDownloadTrack` (timeoutMs/locateTimeoutMs/prerenderWaitMs) but the underlying extension connection drops.

## Wave-4 partial improvements

- `claude-send-thinking-ext` PASS (was on the wave-4 list but no codex change needed — selector was already correct, OR transitively fixed by wave-3 chatgpt selector model).
- 4 of 5 claude-generate-file PASS (csv/docx/md/py) — codex's `CLAUDE_GENERATED_FILE_DOWNLOAD_SELECTOR` constant + `generatedFileDownloadTimeoutError` discriminator help.

## ChatGPT rate-limit check

No 429 observed in any of the 5 chatgpt-generate-file responses (all stderr empty, all stdout either empty=hard-timeout or COMMAND_TIMEOUT-shaped). Account is NOT in cooldown.

## Wave 5 implication

The 63-yaml re-baseline in wave 5 will re-validate these clusters. Net post-sweep PASS rate (W2v2+W3+W4 partial) is being tracked there.
