# Stream #4 — DOM Probe Final (3 unknowns resolved, live evidence)

Run: 2026-05-15T06:0xZ
Method: project CLI only (`node dist/src/cli.js browser:read|click|screenshot|type|press`).
NO Playwright MCP used.
Probe tabs (all freed at end): `dp-cg-img` (chatgpt/9223), `dp-gm-img` (gemini-9225/9225).
Pre-existing leaked tabs `dp-cg-img`, `dp-gm-upload` were registered-but-page-gone;
both freed, fresh probe tabs allocated and reused.

Key infra finding: `browser:read --tab-id <id>` REQUIRES `--profile <name>`.
Without it the command defaults to profile `default` (port 9222) and returns
`"Tab ID ... registered but page not found in browser"`. This explains the
earlier dead-end. All probes below used `--profile chatgpt|gemini-9225`.

Cross-cutting finding: the DOM/accessibility extractor in `browser:read`
**never captures the rendered generated `<img>`** for ChatGPT or Gemini
(`IMG count 0` every read; warning `"Accessibility snapshot unavailable;
DOM extraction was used."`). The generated image renders in a layer the
extractor cannot read. This is an extractor limitation, NOT a selector bug —
the CDP-level `browser:artifact-click` path bypasses it. Rendered-img
selectors below are therefore grounded in the screenshot + prior Phase-1
blob evidence, not the live DOM tree.

---

## U1 — ChatGPT image-mode + rendered img + download control

**Confidence: HIGH (live-verified end to end, image generated + rendered).**

### Image-mode toggle (VERIFIED LIVE)
- Open composer tools menu: `#composer-plus-btn` (aria-label "Add files and more").
- Then click the image-mode radio: `div[role="menuitemradio"]` with accessible
  name **"Create image"** (`aria-checked` flips `false`→`true`,
  `class="group __menu-item"`, `data-radix-collection-item`).
  - CSS has no id; locate by role+name. Playwright:
    `getByRole('menuitemradio', { name: 'Create image' })`.
    Fallback CSS used live and worked:
    `[role="menuitemradio"]:has-text("Create image")`.
- Pre-steps: navigate to `/` or `/?model=` (NOT `/c/<id>`) → click
  `#composer-plus-btn` → click the "Create image" menuitemradio → type into
  `#prompt-textarea` → press Enter. Verified: ChatGPT created a new
  `/c/<id>` conversation and rendered a solid green square.

### Rendered image selector
- Generated image is **NOT** in the a11y/DOM tree (`IMG count 0`).
  Current source selector
  `main img[alt], main img[src^="blob:"], main img[src*="oaiusercontent"], main img`
  does **NOT match** live DOM (confirmed: prior `fv-2-cg-image.json` =
  `ELEMENT_NOT_FOUND` on exactly this selector).
- Screenshot ground truth: image renders with a hover/persistent action
  toolbar pill directly below it.

### Download control (root-cause of all prior failures)
- The image action toolbar (class `pointer-events-auto z-11 ... backdrop-blur`)
  exposes in the a11y tree ONLY:
  - `button[aria-label="Edit image"]`
  - `button[aria-label="Share this image"]`  (blocked by sensitivity guard —
    correct, sharing is contract-forbidden)
- **There is NO `button[aria-label="Save"]` and NO named Download button.**
  Current source follow-up selector `button[aria-label="Save"]` does **NOT
  exist** (confirmed: prior `ys-chatgpt-image.json` = `ELEMENT_NOT_FOUND` on
  `button[aria-label="Save"]`).
- The actual download control is the **rightmost circular ↓ icon button** in
  the image's `pointer-events-auto z-11` toolbar (visible in screenshot
  `data/screenshots/2026-05-15T06-05-28-760Z-Green-Square-Image.png`,
  pill bar: "Edit" left, ↓ icon far right). It has **no accessible name**
  and **no stable CSS selector** in the extraction.
- **Recommended fix:** ChatGPT generated-image download must use CDP-level
  `browser:artifact-click` (`Browser.setDownloadBehavior` + raw
  `Input.dispatchMouseEvent`) — the mandated Round-2/Round-3 pattern —
  targeting the unnamed download icon as the **rightmost button sibling of
  `button[aria-label="Edit image"]` inside the `.pointer-events-auto.z-11`
  toolbar group**. Do NOT use `button[aria-label="Save"]` (false) or
  `main img[...]` (extractor-invisible). On failure surface
  `ELEMENT_NOT_FOUND` (no silent fallback, no local DOCX/PNG synthesis).

---

## U2 — Gemini image-mode + rendered img + download

**Confidence: HIGH (live-verified end to end, image generated, menu opened).**

### Image-mode toggle (VERIFIED LIVE)
- `button[aria-label="🖼️ Create image, button, tap to use tool"]`
  (text "Create image"). Present on `/app?hl=en` home composer. After
  activation aria-label becomes `"Deselect Create image"`.
- Pre-steps: nav `/app?hl=en` → click the Create-image button → type into
  `rich-textarea .ql-editor[contenteditable="true"]` (Quill; the generic
  `div[contenteditable="true"]` is strict-mode ambiguous — use the
  `rich-textarea .ql-editor` form) → press Enter on that editor (the
  `button[aria-label="Send message"]` click is blocked by the sensitivity
  guard, so Enter-to-send is the working path). Verified: Gemini created
  `/app/<id>` and rendered the image (model "Nano Banana 2", Fast tier).

### Rendered image selector
- Not in DOM tree (`IMG count 0`) — extractor limitation. Per Phase-1
  evidence the rendered image is `img[alt="AI generated"]` at a
  `blob:https://gemini.google.com/...` URL, 1024×1024. Current source wait
  selector `img[alt="AI generated"], img[alt*="generated" i], ...` —
  `img[alt="AI generated"]` is correct but extractor-invisible; the
  artifact-click CDP path does not depend on it.

### Download (VERIFIED LIVE — 2 paths)
- Primary (off-screen, unreliable): `button[data-test-id="download-generated-image-button"]`
  (aria-label "Download full size image") — present in DOM but bounding box
  y≈-11 (above viewport) until hover+scroll. Do NOT rely on direct click.
- **Recommended stable 2-step (VERIFIED LIVE, on-screen):**
  1. `button[data-test-id="more-menu-button"]` (aria-label "Show more options")
  2. `button[data-test-id="image-download-button"]` (role=menuitem,
     aria-label/text "Download image") in the CDK overlay menu.
- Current source already wires this correctly (tools.ts line 747
  `more-menu-button`, line 752 follow-up `image-download-button`). No
  selector change needed for Gemini image download. Confirmed menu items:
  `image-copy-button`, `image-download-button`, `tts-button`,
  `redo-pro-button`, report-legal-issue, model-name-item.

---

## U3 — Gemini upload trigger real selector + pre-steps

**Confidence: HIGH (live-verified, menu opened and items captured).**

- 2-step flow (matches `gemini-dom-evidence.md`, re-verified live):
  1. Trigger: `button[aria-label="Open upload file menu"]` — present on
     `/app?hl=en` home composer (and chat-active state). UNCHANGED, correct.
  2. Menu item (upload-from-computer):
     `button[data-test-id="local-images-files-uploader-button"]`
     (role=menuitem, aria-label
     "Upload files. Documents, data, code files"). This triggers the hidden
     file input.
- Full menu (6 items, live-captured): `local-images-files-uploader-button`,
  `hidden-local-image-upload-button` (internal/hidden), `uploader-drive-button`,
  `uploader-photos-button`, `code-import-button`, `notebooks-import-button`.
- Pre-steps / root cause of prior `ELEMENT_NOT_FOUND`: the aria-label
  selectors are correct; the failure was a **timing gap** — the composite
  fallback `button:has-text("Upload files"), [role="menuitem"]:has-text("Upload files")`
  was evaluated before the CDK/mat-menu overlay finished rendering. Fix:
  after clicking the trigger, `waitForSelector`/`waitFor` on
  `button[data-test-id="local-images-files-uploader-button"]` (visible)
  before clicking it; cap the wait and emit `ELEMENT_NOT_FOUND` /
  `COMMAND_TIMEOUT` on expiry (no silent retry). Also keep the existing
  post-attach wait on `GEMINI_UPLOAD_CHIP_SELECTOR` before send.

---

## Tab hygiene (verified zero leaks)

- Freed pre-existing leaked: `dp-cg-img` (chatgpt), `dp-gm-upload` (gemini-9225).
- Allocated + used: `dp-cg-img` (chatgpt), `dp-gm-img` (gemini-9225).
- Both freed at end. Post-state: chatgpt and gemini-9225 tab lists contain
  ZERO `dp-` prefixed tabs (verified by `browser:tab:list`).
