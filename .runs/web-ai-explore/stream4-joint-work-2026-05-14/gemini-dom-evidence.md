# Gemini live DOM evidence (2026-05-14 evening)

Run timestamp: 2026-05-15T05:10Z  
Chrome: 148.0.7778.167 · CDP port 9225 · profile gemini-9225  
Model confirmed: Fast (button text "Fast" + "Deselect Create image" pattern)  
Account: Shark 7 (cherrypie85arrow@gmail.com) · PRO badge present  

---

## Bug B — upload trigger

- **Phase 1 morning selector:** `button[aria-label="Open upload file menu"]`
- **CURRENT real selector (trigger):** `button[aria-label="Open upload file menu"]`  
  — **UNCHANGED. Selector is correct and present in live DOM** on both the home
  screen (`/app?hl=en`) and after typing into the composer (chat-active state).
- **1-step or 2-step:** 2-step (trigger → menu item → file input)
- **Menu item selector for "upload from computer":**
  `button[aria-label="Upload files. Documents, data, code files"]`  
  with `data-test-id="local-images-files-uploader-button"` · role=`menuitem`  
  — **UNCHANGED. This is also correct.**
- **Root cause of ELEMENT_NOT_FOUND in round-2:** The tool's composite fallback
  selector `button:has-text("Upload files"), [role="menuitem"]:has-text("Upload files")`
  was evaluated before the mat-menu overlay finished rendering. The primary
  aria-label selector IS correct; the issue is a timing/wait gap between clicking
  the trigger and the CDK overlay panel becoming interactive. A short
  `waitForSelector` on the menu item before clicking would fix it.
- **Full menu revealed by clicking trigger (6 items):**
  1. `button[aria-label="Upload files. Documents, data, code files"]` · data-test-id=`local-images-files-uploader-button` · role=menuitem
  2. `button.hidden-local-file-image-selector-button` (hidden; internal)
  3. `button[aria-label="Add from Drive. Sheets, Docs, Slides"]` · data-test-id=`uploader-drive-button`
  4. `button[aria-label="Google Photos"]` · data-test-id=`uploader-photos-button`
  5. `button` text="Import code" · data-test-id=`code-import-button`
  6. `button` text="NotebookLM" · data-test-id=`notebooks-import-button`
- **Evidence:** Live Playwright CDP evaluation on page
  `https://gemini.google.com/app?hl=en` (pageId `634B9AFF21A8368C66B62922DF6071A0`);
  upload button clicked, menu captured, Escape pressed to close.

---

## Bug C — generated-image download

- **Phase 1 morning selector:** `button[aria-label="Download full size image"]`
- **CURRENT real selector / path:** The selector is **present** in live DOM after
  image generation completes (`data-test-id="download-generated-image-button"`),
  BUT the button has class `on-hover-button` and its bounding box is `y: -11`
  (partially above viewport). It is NOT reachable by `browser:artifact-click`
  without (a) scrolling the generated image into view AND (b) hovering over the
  image to reveal the toolbar. This is why the tool fails: the button exists but
  is positioned off-screen until hover+scroll.
- **Stable alternative (direct, no hover required):**
  `button[data-test-id="more-menu-button"]` (aria-label="Show more options") →
  then `button[data-test-id="image-download-button"]` (text="Download image") in
  the CDK overlay panel. This menu item is **always visible** when the response
  is in view (bounding box y=457, fully on-screen).
- **Direct or behind-menu:** Primary = hover-revealed (unreliable); recommended
  fix = behind "Show more options" menu (2-step, stable).
- **Full "Show more options" menu items:**
  1. `button[data-test-id="image-copy-button"]` text="Copy image"
  2. `button[data-test-id="image-download-button"]` text="Download image"  ← **USE THIS**
  3. `button[data-test-id="tts-button"]` text="Listen"
  4. `button[data-test-id="redo-pro-button"]` text="Redo with Pro"
  5. `a[aria-label="Report legal issue"]`
  6. `div[aria-label="Model name"]` text="Model: Nano Banana 2"
- **Image generated:** `blob:https://gemini.google.com/c8e991be-8e7f-40c2-bffe-05bcc3013401`
  · alt="AI generated" · 1024×1024 px (confirmed rendered)
- **Evidence:** Playwright CDP evaluation on page
  `https://gemini.google.com/app/034cb1b7a1ad8250?hl=en` after sending prompt
  "Generate a simple solid green square image." with Create image chip active.
  Image rendered in <3s. Download button found at y=-11 (off-screen), more-menu
  at y=457 (on-screen). Menu clicked, items captured, Escape pressed.

---

## Part C — canvas_to_docs

- **Verdict: RED**
- **JSON output verbatim:**
  ```json
  {
    "docs_url": "https://gemini.google.com/app?hl=en",
    "docs_doc_id": null,
    "title": "gd-canvas-smoke",
    "errorCode": null
  }
  ```
- **Interpretation:** The tool returned `errorCode: null` (no error surfaced) but
  `docs_url` is the Gemini app URL (not a `docs.google.com` URL) and
  `docs_doc_id` is null. The Canvas export to Docs did not complete or the
  Docs tab was not detected. The tool silently produced a wrong-URL result
  instead of failing with a contract error code. This is a separate bug from B
  and C — the canvas-to-docs completion detection / Docs-tab monitoring is broken.

---

## Tab leak count

- Allocated this session: gd-upload, gd-img, gd-canvas (3 tabs)
- Freed: all 3
- Leaked: **0**
- Remaining tabs: gemini-main, check-gemini (pre-existing, untouched)
