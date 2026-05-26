# Post-ship fix wave 2 v2 — Gemini extension workflow smoke summary

- Generated: 2026-05-26T05:25:04.171020+00:00
- Backend: `extension-assisted-cdp`
- Smoke fixtures created for workflow inputs: `/tmp/explore-2026-05-25/fixtures/fileA.txt`, `/tmp/explore-2026-05-25/fixtures/probe.png`
- Gate result: **10/15 PASS** (ship gate: >=10/15)

| Workflow | YAML | Result | CLI exit | Error | Notes |
| --- | --- | --- | ---: | --- | --- |
| `gemini-deep-research-mgr` | `examples/workflows/gemini-deep-research-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-gems-converse-mgr` | `examples/workflows/gemini-gemini-gems-converse-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-generate-image-ext` | `examples/workflows/gemini-generate-image-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-generate-video-ext` | `examples/workflows/gemini-generate-video-ext.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-music-generate-chain` | `examples/workflows/gemini-music-generate-chain.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-music-generate-ext` | `examples/workflows/gemini-gemini-music-generate-ext.yaml` | **FAIL** | `1` | `CHROME_EXTENSION_NOT_CONNECTED` | Error fetching web content: Tool execution failed: Failed to inject content script in tab 740055769: Frame with ID 0 was removed. |
| `gemini-select-model-flash-mgr` | `examples/workflows/gemini-gemini-select-model-flash-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-send-basic-mgr` | `examples/workflows/gemini-gemini-send-basic-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-send-thinking-mgr` | `examples/workflows/gemini-gemini-send-thinking-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-send-web-search-mgr` | `examples/workflows/gemini-gemini-send-web-search-mgr.yaml` | **FAIL** | `1` | `ELEMENT_NOT_FOUND` | ELEMENT_NOT_FOUND: Gemini Web Search toggle was not found in the live-probed Upload & tools menus |
| `gemini-upload-single-mgr` | `examples/workflows/gemini-gemini-upload-single-mgr.yaml` | **PASS** | `0` | `` | command gate passed |
| `gemini-veo-quota-error-mgr` | `examples/workflows/gemini-gemini-veo-quota-error-mgr.yaml` | **FAIL** | `1` | `COMMAND_TIMEOUT` | command timed out |
| `gemini-canvas-edit-mgr` | `examples/workflows/gemini-gemini-canvas-edit-mgr.yaml` | **FAIL** | `1` | `CHROME_EXTENSION_NOT_CONNECTED` | Error resolving XPath: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received |
| `gemini-canvas-to-docs-mgr` | `examples/workflows/gemini-canvas-to-docs-mgr.yaml` | **FAIL** | `1` | `CHROME_EXTENSION_NOT_CONNECTED` | Error calling tool: Request timed out after 120000ms |
| `gemini-multimodal-mgr` | `examples/workflows/gemini-gemini-multimodal-mgr.yaml` | **PASS** | `0` | `` | command gate passed |

## Remaining non-pass observations
- `gemini-music-generate-ext`: `CHROME_EXTENSION_NOT_CONNECTED` — Error fetching web content: Tool execution failed: Failed to inject content script in tab 740055769: Frame with ID 0 was removed.
- `gemini-send-web-search-mgr`: `ELEMENT_NOT_FOUND` — ELEMENT_NOT_FOUND: Gemini Web Search toggle was not found in the live-probed Upload & tools menus
- `gemini-veo-quota-error-mgr`: `COMMAND_TIMEOUT` — command timed out
- `gemini-canvas-edit-mgr`: `CHROME_EXTENSION_NOT_CONNECTED` — Error resolving XPath: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received
- `gemini-canvas-to-docs-mgr`: `CHROME_EXTENSION_NOT_CONNECTED` — Error calling tool: Request timed out after 120000ms

## Selector/probe notes
- Tool-drawer flows use the live-probed `menuitemcheckbox` toggle path and verify `aria-checked="true"`.
- Flash-Lite gating reads `button[data-test-id="bard-mode-menu-button"]` and switches to `3.5 Flash` before tool-drawer usage.
- Web search intentionally surfaces `ELEMENT_NOT_FOUND` because no separate live-probed tool toggle was found.
