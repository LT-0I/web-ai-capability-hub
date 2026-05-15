# Stream #4 — Interactive Debug R6 (observe-first, live-browser)

Date: 2026-05-15. Method: project CLI (`browser:read|click|type|press|tab:*`)
for observation + project-own Playwright `connectOverCDP` instrumentation
scripts (the SAME connection path the tool uses) to replay exact tool code
sequences with step timing. NO Playwright MCP. NO raw codex/omx. NO
process kills/launches. All `dbg-` tabs freed; verified zero leak on
chatgpt + gemini-9225.

Result: **2 of 3 RED tools fixed to GREEN** (Gemini upload-and-query,
Gemini generate-image). ChatGPT generate-image: Q1 root cause fixed +
verified, but a NEWLY-OBSERVED 4th blocker (no inline download button on
this Pro account's image UI) remains — deliberately NOT speculatively
"fixed". Build green, `npm test` 151/151, contract version unchanged, no
commit.

---

## Q1 — ChatGPT image-mode menu

### Observation (literal DOM, live)
- Account is on **"Extended Pro"** model (composer header
  `"Ready when you are. Extended Pro"`, pill `#radix-_r_0_` = "Extended
  Pro"); `?model=gpt-4o` does NOT switch it.
- `#composer-plus-btn` present (`aria-label="Add files and more"`,
  `aria-haspopup="menu"`). CLI click opens the Radix menu; menu contains
  `[role="menuitemradio"]` **"Create image"** (aria-checked="false",
  no id/testid). dom-probe-r2 §A selectors **CONFIRMED CORRECT**.
- Clicking the radio (via CLI **and** via the tool's exact
  connectOverCDP path) **succeeds in ~175 ms**; the composer then shows
  `button[aria-label="Image, click to remove"]` + "Choose image aspect
  ratio" → **image mode IS active**. Menu has NO entrance animation
  (`animationName:none`, `transform:none`, pointerEvents:auto, hit-test
  resolves to a descendant) — so there is **no Playwright actionability
  problem**.

### Concrete root cause (observed, not guessed)
Instrumenting the tool's exact path showed: after the first
`radio.click()` (175 ms, success) the **Radix menu closes and the
`menuitemradio` is REMOVED from the DOM** (it never flips
`aria-checked="true"` while mounted). The old code
(`activateChatgptImageMode`) verified activation by reading
`radio.getAttribute("aria-checked")` in a `for (attempt<2)` loop:
- `getAttribute` on the now-detached locator re-resolves the selector,
  finds nothing, and blocks ~30 s → returns `undefined` (≠ `"true"`).
- Loop retries; 2nd `radio.click({timeout:15000})` times out for 15 s
  against the vanished element → **raw Playwright error
  `locator.click: Timeout 15000ms exceeded waiting for
  locator('[role="menuitemradio"]:has-text("Create image")').first()`
  leaks unwrapped** (exactly the r5 evidence + the HANDOFF
  contract-violation claim — confirmed).

### Fix applied
`activateChatgptImageMode`: click the radio **once** (timeout 8000,
wrapped → `ELEMENT_NOT_FOUND` on failure, no raw leak), then verify via
the composer pill `CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR =
'button[aria-label="Image, click to remove"], button[aria-label*="image
aspect ratio" i]'`. Removed the detached-element retry loop. Tests
updated (2) to assert the new correct contract.

### Verification
Re-smoke advanced from raw-Playwright-leak → proper `COMMAND_TIMEOUT` →
(after the image-completion fix below) `ELEMENT_NOT_FOUND` on the
**download button**. The menu/activation path is now fully correct and
emits only stable contract codes (no leak). See Q4.

---

## Q1b/Q4 — ChatGPT image completion + download (newly observed)

Step-timed replay of the full chatgpt generate-image path:
- image mode active @ +4.7s, prompt sent @ +4.9s, generation starts
  (`stop:true`) @ +5.7s, **image fully renders @ +35s**
  (`button[aria-label="Edit image"]` present, `stop:false`).
- BUT during/after image render the assistant turn drops out of
  `[data-message-author-role="assistant"]` (`msgCount:1→0`) and its
  `textContent.length` is **0** (an image has no text).

**Root cause:** the ChatGPT/non-gemini Phase-B gate in
`waitForPromptCompletion` requires `textLength > 0`; image responses
never satisfy it → `COMMAND_TIMEOUT` before `waitForGeneratedImageRendered`
is ever reached.

**Fix applied:** `generateImageOnPage` sets `__expectImageResponse:true`;
`sendPromptInExistingPage` then short-circuits the text-based completion
gate after confirming submission (image completion is authoritatively
gated by `waitForGeneratedImageRendered`'s rendered-image toolbar). Also
re-reads `page.url()` AFTER the image renders so the artifact-click stage
targets the settled conversation URL (Gemini/ChatGPT navigate to
`/app|/c/<id>` only after the turn lands).

**Remaining blocker (4th root cause, NOT speculatively fixed):** on this
**Extended Pro** account the rendered image toolbar contains only
`button[aria-label="Edit image"]` and `button[aria-label="Share this
image"]` — **NO download button**. Both buttons themselves carry
`pointer-events-auto z-11`; the `z-11` class is NOT on any shared
ancestor. Current `CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR` =
`button[aria-label="Edit image"] >> xpath=ancestor::*[...pointer-events-auto
AND z-11...][1]//button[last()]` matches nothing → honest
`ELEMENT_NOT_FOUND`. A page-wide scan found no download/save affordance
in the image turn. The real download path on this UI variant (Share
dialog, or image-viewer) is a distinct multi-step flow that requires its
own DOM-grounded design; per project rules (no speculative changes, no
silent fallback, no local synthesis) it is recorded as the remaining
blocker, not patched blind.

---

## Q2 — Gemini liveness + completion gate

### Observation (live, real DOM via tool's connectOverCDP path)
One probe prompt ("Reply with exactly: PROBE_OK") → **Gemini DID
respond** (`lastTxt:"Gemini said PROBE_OK"`). NOT environmental. Polled
the tool's exact Phase-B predicate for 85 s:
- `stopVisible:false`, `regenVisible:true` (regenerate-button present),
  text stable — i.e. response complete and stable — but
  **`sendReady:false` PERSISTENTLY** for the full 85 s.

Direct inspection of `button[aria-label="Send message"]` post-response:
`disabled=false` BUT **`aria-disabled="true"`**.

### Concrete root cause (observed)
The Gemini Phase-B gate required
`regeneratePresent && sendReady && !stopVisible`. After any Gemini
response the composer is empty, so Send is `aria-disabled="true"`
indefinitely; `sendReady = some(!disabled && aria-disabled!=="true")`
is **never true** → predicate never fires → `COMMAND_TIMEOUT`. This is
the single shared root cause of BOTH `gemini_upload_and_query` and
`gemini_generate_image` REDs.

### Fix applied
Dropped the `sendReady` conjunct from the Gemini Phase-B gate. New gate:
`regeneratePresent && !stopVisible && (text stable ≥1500 ms)` — the
proven-sufficient completion signal (dom-probe-r2 §C, confirmed live).
No new selectors; no stale Angular tags.

### Verification — GREEN
`resmoke-r6-gemini-upload-and-query.json`: `files_in_chip:["r6-probe.txt"]`,
conversation created, **`completion_detected:true`, `errorCode:null`,
`wait_ms:5308`**, real answer captured ("…the second line… are alpha and
beta."). Previously timed out at 120000 ms. (A pre-existing upload-trigger
race was also found+fixed — see below.)

---

## Q2b — Gemini upload-trigger race (newly observed, fixed)

First r6 upload re-smoke failed `ELEMENT_NOT_FOUND` on
`button[aria-label="Open upload file menu"]` at `wait_ms:0`,
`chat_url:"https://gemini.google.com/app"`. Live DOM check:
`button[aria-label="Open upload file menu"]` **IS present/visible**.
Root cause: `requireAndClick` does an instant `count()` with no wait;
the Angular composer mounts the upload button AFTER domcontentloaded, so
the check races the render. Fix: bounded
`waitForSelector(GEMINI_UPLOAD_TRIGGER_SELECTOR,{visible,15000})` before
`requireAndClick` (honest `ELEMENT_NOT_FOUND` on true absence). Verified
by the GREEN upload re-smoke above.

---

## Q3 — Gemini image-mode (Gemini confirmed responsive)

Fresh `/app?hl=en`: zero-state chip
`button[aria-label="🖼️ Create image, button, tap to use tool"]`
(class `mat-ripple card card-zero-state`) **present** — matched by
`GEMINI_CREATE_IMAGE_BUTTON_SELECTOR='button[aria-label*="Create image"]'`.
Tools-drawer fallback (`button.toolbox-drawer-button` "Tools") also
present. CLI-clicking the chip flips its label to **"Deselect Create
image"** — exactly the success condition `activateGeminiImageMode`
already checks. **Gemini image-mode activation code is CORRECT and
matches reality — no change needed.** Gemini's image RED was the Q2
`sendReady` completion-gate bug + the post-render conversation-URL
capture, both fixed.

### Verification — GREEN
`resmoke-r6-gemini-generate-image.json`: `errorCode:null`,
`size_bytes:477408`, real PNG on disk
(`Gemini_Generated_Image_qwfabfqwfabfqwfa.png`, `file` →
`PNG image data, 1408 x 768, 8-bit/color RGBA`). Previously
`COMMAND_TIMEOUT`.

---

## Changes (src/mcp/tools.ts + tests/consumerContract.test.ts only)

1. `CHATGPT_IMAGE_MODE_ACTIVE_SELECTOR` added; `activateChatgptImageMode`
   verifies via composer pill, single wrapped radio click, no
   detached-element retry, no raw-error leak. (Q1)
2. `__expectImageResponse` flag: `generateImageOnPage` sets it;
   `sendPromptInExistingPage` skips the text-completion gate for
   image responses (image completion gated by
   `waitForGeneratedImageRendered`). (Q1b/Q4, Gemini image)
3. Post-render `page.url()` re-read in `generateImageOnPage` so
   artifact-click targets the settled conversation URL. (Gemini image)
4. Gemini Phase-B completion gate: dropped `sendReady` conjunct. (Q2)
5. `uploadFilesInExistingPage` Gemini: bounded `waitForSelector` on the
   upload trigger before click. (Q2b)
6. Tests: 2 ChatGPT image-mode tests updated to the corrected contract;
   all other tests unchanged. **151/151 pass.**

No `configs/consumer-contract.json` change; contract version unchanged.
No commit. No silent fallback — all failure paths emit stable contract
codes.

## Re-smoke tally (r6, ONE per tool, evidence = ground truth)

| Tool | Verdict | Evidence |
|---|---|---|
| webai_gemini_upload_and_query | **GREEN** | resmoke-r6-gemini-upload-and-query.json (completion_detected:true, real answer) |
| webai_gemini_generate_image | **GREEN** | resmoke-r6-gemini-generate-image.json (477KB PNG 1408x768 on disk) |
| webai_chatgpt_generate_image | **RED** (Q1 fixed+verified; blocked on 4th cause) | resmoke-r6-chatgpt-generate-image.json (ELEMENT_NOT_FOUND on download btn — no inline download button on this Pro UI) |

## Tab hygiene
Allocated: `dbg-cg` (chatgpt, re-alloc'd several times), `dbg-gm`/
`dbg-gm2` (gemini-9225). ALL freed. Final `browser:tab:list` →
zero `dbg-`-prefixed tabs on chatgpt and gemini-9225. Pre-existing tabs
untouched. No browser/process touched.
