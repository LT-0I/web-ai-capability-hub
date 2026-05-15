# Round-4 Re-smoke Report
Date: 2026-05-15
Tester: Claude Code (orchestrator, no src/tests/configs edits)

## Sanity checks
- CDP 9223 (chatgpt): responding, `browser:status` → connected:true
- CDP 9225 (gemini-9225): responding, `browser:status` → connected:true
- No browser relaunches performed.

---

## Tool 1: webai_chatgpt_generate_image

**Verdict: RED**

Command:
```
node dist/src/cli.js webai:chatgpt:generate-image \
  --profile chatgpt \
  --prompt "a solid blue square, flat color, no text" \
  --download-dir .runs/.../r4-downloads \
  --tab-url-contains "chatgpt.com" \
  --output-json
```

Evidence JSON (resmoke-r4-chatgpt-generate-image.json):
```json
{"ok":false,"error":"locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('[role=\"menuitemradio\"]:has-text(\"Create image\")').first()"}
```

- errorCode: implicit timeout (locator.click timeout at 5000ms)
- Selector: `[role="menuitemradio"]:has-text("Create image")`
- The round-2 fix added `waitForSelector` before clicking the menuitemradio, but the 5000ms budget was still exceeded — the menu either didn't render, or the `+` button click itself did not open a menu containing that item in the current ChatGPT UI state.
- No image file produced. r4-downloads is empty.

---

## Tool 2: webai_gemini_generate_image

**Verdict: RED**

Command:
```
node dist/src/cli.js webai:gemini:generate-image \
  --profile gemini-9225 \
  --prompt "a solid blue square, flat color, no text" \
  --download-dir .runs/.../r4-downloads \
  --tab-url-contains "gemini.google.com" \
  --output-json
```

Evidence JSON (resmoke-r4-gemini-generate-image.json):
```json
{
  "path": "",
  "sha256": "",
  "size_bytes": 0,
  "dimensions": null,
  "download_filename": "",
  "errorCode": "COMMAND_TIMEOUT",
  "error_code": "COMMAND_TIMEOUT",
  "message": "Image generation did not complete before timeout"
}
```

- errorCode: `COMMAND_TIMEOUT`
- The fix navigates to fresh `https://gemini.google.com/app?hl=en` and waits for `button[aria-label*="Create image"]`, but image generation did not complete within the command timeout.
- Possible causes: (a) the `button[aria-label*="Create image"]` activation wait timed out silently before generation started, or (b) generation started but the download/detection loop timed out before the image appeared.
- No image file produced.

---

## Tool 3: webai_gemini_upload_and_query

**Verdict: RED**

Command:
```
node dist/src/cli.js webai:gemini:upload-and-query \
  --profile gemini-9225 \
  --file /tmp/r4-probe.txt \
  --prompt "Reply with only the exact sentence contained in this file." \
  --tab-url-contains "gemini.google.com" \
  --output-json
```

Evidence JSON (resmoke-r4-gemini-upload-and-query.json):
```json
{
  "files_in_chip": ["r4-probe.txt"],
  "chat_url": "https://gemini.google.com/app/d8bdb660b9aeffd0?hl=en",
  "response_text": "",
  "wait_ms": 120000,
  "completion_detected": false,
  "errorCode": "COMMAND_TIMEOUT",
  "error_code": "COMMAND_TIMEOUT"
}
```

- errorCode: `COMMAND_TIMEOUT`
- `files_in_chip: ["r4-probe.txt"]` — filechooser interception worked; the file was attached successfully (no OS file dialog appeared).
- `completion_detected: false` — the response selector (`model-response` / `[data-response-id]`) never fired within 120000ms wait_ms.
- `response_text: ""` — no answer captured.
- OS file dialog: **NOT triggered** — filechooser interception is functioning correctly.
- The regression in upload itself is fixed; the remaining failure is on response completion detection (the new selectors `model-response`/`[data-response-id]` are not matching the live Gemini DOM in time, or Gemini is not completing the response within 120s).

---

## Final Tally

| Tool | Result | errorCode / artifact |
|------|--------|----------------------|
| webai_chatgpt_generate_image | RED | locator.click timeout 5000ms — `[role="menuitemradio"]:has-text("Create image")` not found |
| webai_gemini_generate_image | RED | `COMMAND_TIMEOUT` — image generation did not complete |
| webai_gemini_upload_and_query | RED | `COMMAND_TIMEOUT` — upload succeeded (no OS dialog), response completion_detected=false after 120s |

**0/3 GREEN**

---

## Judgement calls

1. **ChatGPT generate_image**: The menu-render timing fix (waitForSelector before click) is present in code but the 5000ms budget is insufficient for the current live UI — the `#composer-plus-btn` may need a longer settle or the menuitemradio selector may have drifted again. Root cause is NOT the original race; it is either the timeout budget or a selector drift.

2. **Gemini generate_image**: The fix (fresh composer URL + waitForSelector on `button[aria-label*="Create image"]`) may be partially correct, but the command-level timeout fires before the image appears. Need to determine if: (a) the aria-label selector found the button and clicked it but Gemini was slow, or (b) the selector itself did not match and the tool silently timed out the activation step. Evidence JSON does not distinguish — next round should add a pre-activation log field.

3. **Gemini upload_and_query**: This is the closest to GREEN — filechooser interception is confirmed working (no OS dialog, file chip present). The only remaining bug is response completion detection: `model-response`/`[data-response-id]` selectors are not matching within 120s. This may need a broader selector sweep of the live Gemini response DOM, or a longer wait budget.

4. No browsers were restarted, no pkill/kill issued, no src/tests/configs edited, no commits made. One attempt per tool, period.
