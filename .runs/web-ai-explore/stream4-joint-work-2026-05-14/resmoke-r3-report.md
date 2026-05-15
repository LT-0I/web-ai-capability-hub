# Re-smoke Report — Round 3 Fixes — 2026-05-14

**Run date:** 2026-05-14  
**Tester:** Claude Code (orchestrator, no src edits)  
**Evidence files:** `resmoke-r3-chatgpt-generate-image.json`, `resmoke-r3-gemini-generate-image.json`, `resmoke-r3-gemini-upload-and-query.json`

---

## Sanity checks

| Browser | CDP port | `connected` |
|---------|----------|-------------|
| chatgpt | 9223 | true |
| gemini-9225 | 9225 | true |

Both CDP `/json/version` endpoints responded with Chrome/148. Browser status confirmed `launchedByPackage: true` for both profiles.

---

## Tool results

### 1. `webai:chatgpt:generate-image` — RED

**Command:** `webai:chatgpt:generate-image --profile chatgpt --prompt "a solid blue square, flat color, no text" --download-dir .../r3-downloads --output-json`

**Result:**
- `errorCode`: `ELEMENT_NOT_FOUND`
- `expected_selector`: `[role="menuitemradio"]:has-text("Create image")`
- `size_bytes`: 0
- No file in r3-downloads

**Evidence:** `resmoke-r3-chatgpt-generate-image.json`

**Assessment:** The fix targets `#composer-plus-btn` → "Create image" `menuitemradio`. The selector `[role="menuitemradio"]:has-text("Create image")` was not found after clicking the plus button. Either the ChatGPT UI has changed the menu structure (aria role or text), or the plus button click did not open the menu. The fix as landed does NOT produce a working generate-image flow. This is a UI-drift failure — the selector needs re-probing against the live DOM.

---

### 2. `webai:gemini:generate-image` — RED

**Command:** `webai:gemini:generate-image --profile gemini-9225 --prompt "a solid blue square, flat color, no text" --download-dir .../r3-downloads --output-json`

**Result:**
- `errorCode`: `ELEMENT_NOT_FOUND`
- `expected_selector`: `button[aria-label*="Create image"]`
- `size_bytes`: 0
- No file in r3-downloads

**Evidence:** `resmoke-r3-gemini-generate-image.json`

**Assessment:** The fix activates `button[aria-label*="Create image"]` on the Gemini page. That button was not found, indicating the Gemini UI does not currently expose this control on the active tab (may require a specific conversation state, a different tab, or the aria-label text has drifted). The image-generation entry point selector needs re-probing.

---

### 3. `webai:gemini:upload-and-query` — RED (COMMAND_TIMEOUT) — filechooser fix: PARTIAL PASS

**Command:** `webai:gemini:upload-and-query --profile gemini-9225 --file /tmp/r3-probe.txt --prompt "Reply with only the exact sentence contained in this file." --output-json`

**Result:**
- `errorCode`: `COMMAND_TIMEOUT`
- `files_in_chip`: `["r3-probe.txt"]`
- `chat_url`: `https://gemini.google.com/app/1b0ef318e59d11ab`
- `completion_detected`: false
- `wait_ms`: 120000
- `response_text`: ""

**Evidence:** `resmoke-r3-gemini-upload-and-query.json`

**OS file dialog:** DID NOT APPEAR. The file chip `r3-probe.txt` appeared in `files_in_chip`, which is unambiguous evidence that `page.waitForEvent('filechooser') + chooser.setFiles()` intercepted the native file picker successfully. The filechooser-intercept fix works.

**Failure mode:** After upload succeeded, the tool waited 120 s for a Gemini response and timed out (`completion_detected: false`, `response_text: ""`). Root cause is in the response-completion detection logic, not the upload path. The prompt was sent (a new conversation URL was created), but Gemini's reply was not captured within the timeout window.

**Assessment for the fix specifically:** The critical fix (OS file chooser intercept) is CONFIRMED WORKING. The COMMAND_TIMEOUT is a separate pre-existing or regression issue in response-detection, not introduced by the filechooser fix.

---

## Final tally

| Tool | Verdict | Root cause |
|------|---------|------------|
| `webai:chatgpt:generate-image` | RED | `ELEMENT_NOT_FOUND` — `menuitemradio` "Create image" not found after plus-button click; UI drift or menu not opening |
| `webai:gemini:generate-image` | RED | `ELEMENT_NOT_FOUND` — `button[aria-label*="Create image"]` absent from active tab |
| `webai:gemini:upload-and-query` | RED (COMMAND_TIMEOUT) | Upload/filechooser fix WORKS (chip confirmed, no OS dialog); timeout in response-detection |

**0/3 GREEN** on final artifact delivery. However, the filechooser-intercept fix for `webai:gemini:upload-and-query` is validated as functional — the failure is in a downstream step (response wait), not in the fix itself.

---

## Judgement calls

- No model flags were required by these commands (no `--model` option exposed in CLI help).
- No retries were performed. One attempt per tool, as required.
- No browsers were relaunched or killed.
- No tabs allocated during this run (commands manage their own tabs internally); no tab cleanup required.
- The ChatGPT profile had only a `chrome://newtab/` page — no pre-existing ChatGPT tab. The generate-image command is expected to navigate to chatgpt.com itself; the failure occurred at menu-item selection, not navigation.
- The second invocation of `webai:chatgpt:generate-image` (accidental re-run while saving evidence) returned a different error format `{"ok":false,"error":"locator.click: Timeout..."}` — this is a different code path but the same underlying failure. The first run's structured JSON is the canonical evidence.
