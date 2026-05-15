# Stream #4 — Interactive Debug R7 (observe-first, live-browser)

Date: 2026-05-15. Method: project CLI (`browser:tab:alloc|free|list`) for tab
hygiene + project-own Playwright `connectOverCDP` instrumentation against the
SAME managed browsers the tool drives (the exact connection path
`runArtifactClick`/the tool uses) for read-only live-DOM observation. NO
Playwright MCP. NO raw codex/omx. NO process kill/launch/restart. All `dbg3-`
tabs freed; verified zero leak on chatgpt (9223) and gemini-9225 (9225).

Result: **BOTH problems fixed to GREEN.** A (Gemini `response_text` chrome
pollution) and B (ChatGPT `generate_image` download) verified by live re-smokes.
Build exit 0, `npm test` 152/152, `consumer-contract-1.3.0` unchanged, no
commit, no regression.

## Starting state (root discovery)

`git diff HEAD` showed **uncommitted, unbuilt** draft fixes in
`src/mcp/tools.ts` + `tests/consumerContract.test.ts` from the prior session.
`dist/` was **stale** (no `GEMINI_LATEST_RESPONSE_SELECTOR` /
`CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR`). The r6 polluted/RED JSONs were produced
by the OLD committed build. So R7 = live-verify the draft selectors, harden,
build, test, re-smoke.

---

## Problem A — Gemini upload_and_query response_text polluted

### Observed root cause (literal live DOM)

`connectOverCDP` to gemini-9225, the r6 conversation
`https://gemini.google.com/app/e0fa7b5dfb6de44c` (a completed answer):

```
modelResponseCount: 1
last <model-response> textContent (101 chars):
  "Show thinking Gemini said The two words on the second line of the file are alpha and beta.   Sources"
.model-response-text  -> found, 66 chars: "The two words on the second line of the file are alpha and beta."
message-content        -> found, 66 chars: (same clean answer)
.markdown              -> found, 66 chars: (same clean answer)
<main> textContent (855 chars):
  "Gemini  File Line Word Identification New chat My stuff  Notebooks  New notebook  Gems  Chats  A simple flat-style green..."
```

The OLD build returned `<main>` textContent (855 chars of nav sidebar +
cross-conversation history + all prior turns) because Gemini's
`assistantMessageSelector` / `GEMINI_RESPONSE_SELECTOR` was literally `"main"`.
That is exactly the ~700-char chrome prefix in
`resmoke-r6-gemini-upload-and-query.json`. The clean answer lives ONLY in the
latest `<model-response>`'s `.model-response-text` (== `message-content` ==
`.markdown`), 66 chars, no chrome, no "Gemini said"/"Show thinking"/"Sources"
wrapper.

### Exact change (`src/mcp/tools.ts`)

`responseText()` gemini branch now uses `page.evaluate` scoped to the LAST
`<model-response>` (`GEMINI_LATEST_RESPONSE_SELECTOR = "model-response"`),
preferring inner `GEMINI_RESPONSE_TEXT_INNER_SELECTORS =
[".model-response-text", "message-content", ".markdown"]` (live-observed clean
answer nodes). Fallback stays scoped to that single turn and strips a leading
`"Show thinking"` / `"Gemini said"` and trailing `"Sources"` (all observed in
the bare textContent). Never reads `<main>` / `assistantMessageSelector` for the
returned text. Mirrors how GREEN ChatGPT/Claude scope to `.last()` assistant
message. Honest empty-string → caller emits `COMMAND_TIMEOUT` (no chrome
fallback). Tests: added a source-grounded scoping test; two pre-existing gemini
completion tests updated to drive `page.evaluate` (the new scoped read path)
instead of `locator("main").textContent`.

### Verification — GREEN

`resmoke-r7-gemini-upload-and-query.json` (fixture `/tmp/r7-gemini-probe.txt`,
distinctive line-2 token `ZEBRA-MARMALADE-7741`):

```
response_text: "The exact token on the second line of the file is ZEBRA-MARMALADE-7741."
completion_detected: true   errorCode: null   wait_ms: 12924
```

Correct answer; **NO** "New chat / My stuff / Notebooks / Gems / Chats" chrome,
NO cross-conversation titles, NO "Gemini said" wrapper. Reproduced twice, both
clean.

---

## Problem B — ChatGPT generate_image download (user-provided manual flow)

### Observed root cause + selector discovery (literal live DOM)

Allocated `dbg3-cg` on an existing image conversation
`https://chatgpt.com/c/6a06eb50-23d8-83e8-892e-ff2048c54bab`.

Inline image-hover toolbar buttons (read-only): only
`button[aria-label="Edit image"]` and `button[aria-label="Share this image"]`
— **NO download button** (confirms the prior finding; stopped probing the
inline toolbar). The generated image element:
`img[alt="Generated image: Green circle on white canvas"]`,
`class="absolute top-0 z-1 w-full"`, src `…/backend-api/estuary/content?id=…`.

Followed user-provided **path 1**: clicked
`img[alt^="Generated image" i]` → a fullscreen detail/lightbox view opened:

```
[role="dialog"] class="bg-token-bg-primary pointer-events-auto absolute inset-0 z-[120] flex flex-col …"
dialog button row: Close fullscreen view · Select · Aspect ratio(menu) ·
  Share · **Save** (aria-label="Save", aria-haspopup=null) · Show more(menu) · …
```

The **ChatGPT image Download control = `[role="dialog"] button[aria-label="Save"]`**
(ChatGPT labels image download "Save"; it is a direct button, no
`aria-haspopup`). Bounding box `{x:1184, y:9.5, w:36, h:36}` — `y=9.5` is
inside the artifact-click `inViewport` y-range `[0,1000]`, so it is clickable
via raw CDP. Path 2 (bottom-right share box) was NOT needed — path 1's detail
view has the Download/Save button. Share-to-link was NOT used (forbidden). The
dialog closes cleanly on Escape (state restored, 0 dialogs after — no residue).

### Exact change (`src/mcp/tools.ts`)

Replaced the old speculative xpath-ancestor hack
(`button[aria-label="Edit image"] >> xpath=ancestor::*[…pointer-events-auto…
z-11…]//button[last()]`, which matched nothing → r6 ELEMENT_NOT_FOUND) with a
two-step CDP `browser:artifact-click`:
`CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR = 'img[alt^="Generated image" i]'`
(buttonSelector, opens the viewer) →
`CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR = '[role="dialog"] button[aria-label="Save"]'`
(followUpSelector, the Save button) — the mandated
`Browser.setDownloadBehavior` + `Input.dispatchMouseEvent` path (download
behavior armed before the first click, so no OS dialog). Gemini's image path
(`more-menu-button` → `image-download-button`) is unchanged. Honest
`ELEMENT_NOT_FOUND`/`COMMAND_TIMEOUT` only, no synthesis. Tests: the
"enters image mode" test now asserts the new buttonSelector/followUpSelector;
the stale-selector guard now asserts the old xpath hack is gone and the new
viewer/Save selectors are present.

### Verification — GREEN

`resmoke-r7-chatgpt-generate-image.json` (prompt "a single solid red square,
flat color, no text"):

```
path: …/r7-downloads/ChatGPT Image May 15, 2026, 03_34_29 AM.png
size_bytes: 807693   sha256: d8965b71583cdb74e266af317890217fab57467d670a2ad8bd80cd61316263ce
errorCode: null
file: PNG image data, 1254 x 1254, 8-bit/color RGB, non-interlaced
PNG magic header: 8950 4e47 0d0a 1a0a  (valid)
```

Real PNG on disk, size > 0, valid PNG header, downloaded via path-1 detail-view
**Save** button. (JSON `path` shows `<home>` because trace redaction is on by
default — correct safe behavior; the real file is on disk.)

Note: a 300s shell `timeout` killed the first foreground attempt (fresh-composer
nav + image-mode + ~render + ≤90s download exceeded 300s on this account). Re-run
backgrounded with the tool's own internal timeouts → succeeded. This is the ONE
re-smoke for this tool.

---

## Changes (src/mcp/tools.ts + tests/consumerContract.test.ts only)

1. `GEMINI_LATEST_RESPONSE_SELECTOR` / `GEMINI_RESPONSE_TEXT_INNER_SELECTORS`;
   `responseText()` gemini branch scopes to latest `<model-response>` via
   `page.evaluate`, hardened fallback strips Show thinking/Gemini said/Sources. (A)
2. `CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR = 'img[alt^="Generated image" i]'`,
   `CHATGPT_IMAGE_DOWNLOAD_BUTTON_SELECTOR = '[role="dialog"] button[aria-label="Save"]'`;
   `generateImageOnPage` ChatGPT path = two-step open-viewer → click-Save
   artifact-click. (B)
3. (Also present from prior session, kept & verified: Gemini Phase-B
   `sendReady` drop, `__expectImageResponse` short-circuit, post-render URL
   re-read, Gemini upload-trigger bounded wait, ChatGPT image-mode pill
   verification — all live-consistent, no regression.)
4. Tests: +1 new (gemini responseText scoping, source-grounded); 4 updated to
   the corrected live contract (2 gemini completion mocks → page.evaluate,
   chatgpt image-mode order/selectors, stale-selector guard). **152/152 pass.**

No `configs/consumer-contract.json` change; `consumer-contract-1.3.0`
unchanged. No commit.

## Quality gates

- `npm run build` → exit 0 (tsc clean).
- `npm test` → **152 tests, 152 pass, 0 fail** (coverage not reduced; +1 test).
- `consumer-contract-1.3.0` unchanged (file untouched in git).
- Regression check: filechooser interception
  (`page.waitForEvent("filechooser",{timeout:15000})` at tools.ts:731) intact;
  verified `gemini_generate_image` path (`more-menu-button` →
  `image-download-button` follow-up at tools.ts:964) unchanged; all
  ChatGPT/Claude upload + send paths untouched. No regression.

## Re-smoke tally (r7, ONE per tool, evidence = ground truth)

| Tool | Verdict | Evidence |
|---|---|---|
| webai_gemini_upload_and_query | **GREEN** | resmoke-r7-gemini-upload-and-query.json (clean scoped answer, no chrome, completion_detected:true) |
| webai_chatgpt_generate_image | **GREEN** | resmoke-r7-chatgpt-generate-image.json (807693-byte valid PNG 1254x1254 on disk, via path-1 viewer Save) |

## Tab hygiene

Allocated: `dbg3-gm` (gemini-9225, r6 conv — read-only DOM probe), `dbg3-cg`
(chatgpt, existing image conv — read-only DOM probe + Escape to restore).
Both freed. Final `browser:tab:list` → **zero `dbg3-` tabs** on chatgpt and
gemini-9225. Pre-existing tabs (incl. another session's `dbg2-*`,
`session-*`) untouched. No browser/chrome/tmux/codex/omx process
killed/launched/restarted.
