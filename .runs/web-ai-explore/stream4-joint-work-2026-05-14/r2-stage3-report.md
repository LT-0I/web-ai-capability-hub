# Phase 3 Stage 3 — Gemini re-smoke (round 2, after selector fix)

## Run metadata
- timestamp: 2026-05-15T02:30:00Z
- git HEAD: 4f297ce
- contract: consumer-contract-1.3.0

---

## Bug fix verification (round 2)

| Bug | Description | Verdict round 2 | wait_ms / evidence |
|---|---|---|---|
| A | Gemini response-completion polling | **FIXED** | step1: completion_detected=true, wait_ms=27, errorCode=null |
| B | Gemini upload trigger + send-ready wait | **NOT FIXED** | step2: ELEMENT_NOT_FOUND on `button[aria-label="Open upload file menu"]` — two-step menu trigger not present in live DOM |
| C | Gemini generate-image (depends on A) | **NOT FIXED** | step3: ELEMENT_NOT_FOUND `button[aria-label="Download full size image"]`, PNG path=none, sha256=none, size=0 |

---

## Pre-run build check

`dist/src/cli.js` was present at 48.2K but did not contain the new selector strings —
because tsc compiles to per-module files. The actual implementation lives in
`dist/src/mcp/tools.js`, which **does** contain the correct `Stop response` /
`Send message` selectors (grep confirmed 1 match). The build was already current;
no rebuild was needed.

---

## Per-step JSON outputs

### Step 1 — send-prompt (Bug A)

```json
{
  "response_text": " Gemini PRO New chat  My stuff  Notebooks  New notebook  Gems  Chats  Model Name and Simple Math  AI Automation Reliability: Challenges and Solutions  Red Ball Bounces on White Floor  File Summary and Paragraph Count  SVG: Yellow Circle on Blue Square  Model Comparison Research Plan  Web AI Automation Stability Brief  Creating Downloadable Capital Cities CSV  Stream 4 Web AI Feature Briefing  A solid yellow circle centered on a deep blue background, 1024x1024.  Python Script for First 10 Primes  File Analysis and Information Extraction  Extracting PDF Title Text  Settings & help  Conversation with Gemini  Hi Shark  Where should we start?  🖼️ Create image  🎸 Create music  Write anything  Boost my day  Help me learn  Create video Reply with exactly the word READY and nothing else.ToolsFast",
  "elapsed_ms": 2085,
  "wait_ms": 27,
  "completion_detected": true,
  "errorCode": null,
  "model_used": null,
  "reuse_conversation": false,
  "chat_url": "https://gemini.google.com/app"
}
```

Notes:
- `completion_detected: true`, `wait_ms: 27` — polling loop now correctly detects completion via `button[aria-label="Stop response"]` / `button[aria-label="Send message"]` selector pair. Bug A is **FIXED**.
- `response_text` is the entire page sidebar (sidebar navigation + chat history text), not just the assistant reply. The response selector `GEMINI_RESPONSE_SELECTOR = "main"` grabs the full `<main>` element including nav. This is a separate response-extraction quality issue, not the completion-polling bug.
- Model check: `response_text` ends with "Fast" confirming Gemini Fast (not Pro/Advanced). No MODEL_SELECTION_DRIFT.

### Step 2 — upload-and-query (Bug B)

```json
{
  "ok": false,
  "files_in_chip": [],
  "errorCode": "ELEMENT_NOT_FOUND",
  "error_code": "ELEMENT_NOT_FOUND",
  "selector": "button[aria-label=\"Upload files. Documents, data, code files\"], button:has-text(\"Upload files\"), [role=\"menuitem\"]:has-text(\"Upload files\")",
  "expected_selector": "button[aria-label=\"Upload files. Documents, data, code files\"], button:has-text(\"Upload files\"), [role=\"menuitem\"]:has-text(\"Upload files\")",
  "response_text": "",
  "chat_url": "https://gemini.google.com/app/73ada85ccb7a1d3d"
}
```

Notes:
- ELEMENT_NOT_FOUND on `button[aria-label="Open upload file menu"]` (GEMINI_UPLOAD_TRIGGER_SELECTOR, step 1 of the two-step upload flow). The live Gemini DOM does not expose a menu-trigger button with that aria-label.
- The codex bugfix added a `waitForGeminiSendReadyAfterUpload` function and rewrote completion polling but did **not** fix the upload trigger selector. The two-step flow (`Open upload file menu` → `Upload files. Documents, data, code files`) does not match the current Gemini UI.
- Bug B remains NOT FIXED. Root fix needed: discover the real upload entry point in live DOM (likely a direct file-input, an attachment icon, or a different aria-label).

### Step 3 — generate-image (Bug C)

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

PNG count before=0, after=0.

Notes:
- ELEMENT_NOT_FOUND on `button[aria-label="Download full size image"]`. The image generation prompt appears to be submitted (completion polling is now fixed via Bug A), but the download button is not reached.
- This could mean: (a) Gemini did not generate an image for this prompt on this model tier, (b) the image was generated but the download button has a different aria-label in the current UI, or (c) the generate-image command does not navigate to the correct page/tool first.
- Bug C is NOT FIXED, though its root cause may now be independent of Bug A (since Bug A is fixed). A separate investigation of the image generation flow and download selector is needed.

---

## Forbidden-field leak check

| Step | cdpEndpoint | webSocketDebuggerUrl | profileDir | cookies/tokens/dom/html/screenshot | Result |
|---|---|---|---|---|---|
| Step 1 (send-prompt) | absent | absent | absent | absent | **PASS** |
| Step 2 (upload-and-query) | absent | absent | absent | absent | **PASS** |
| Step 3 (generate-image) | absent | absent | absent | absent | **PASS** |

---

## Tab leak count

allocated: 3 (r2-send, r2-upload, r2-image), freed: 3, leaked: 0

Verified via `browser:tab:list` — only `gemini-main` and `check-gemini` remain.

---

## Updated stability verdict

- Phase 3 original: **YELLOW**
- Round 1 re-smoke: **YELLOW** (1/4 fixed — Bug D only)
- Round 2 re-smoke (this run): **YELLOW**

**Justification**: Round 2 delivers one additional confirmed fix — Bug A (Gemini response-completion polling) is now working correctly with `wait_ms=27` and `completion_detected=true`, confirming that the `button[aria-label="Stop response"]` + `button[aria-label="Send message"]` selector pair from Phase 1 evidence matches the live DOM. The overall tally is now 2/4 bugs fixed (A + D). Bug B (upload trigger) remains broken because the two-step menu-trigger flow (`Open upload file menu` → `Upload files`) does not exist in the current Gemini UI — a live DOM inspection of the actual upload entry point is required for the next codex dispatch. Bug C (generate-image) is not yet fixed; with Bug A resolved its root cause is now independent and needs a separate targeted investigation of the image-generation flow and download button selector. The joint pipeline still cannot produce a Gemini file upload or image artifact, so the verdict stays YELLOW. A third targeted codex dispatch addressing Bug B's upload selector (live DOM discovery) and Bug C's download button selector is the recommended next step.
