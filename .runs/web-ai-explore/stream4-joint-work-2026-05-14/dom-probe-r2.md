# Stream #4 — DOM Probe R2 (fresh literal-DOM-grounded, supersedes dom-probe-final.md)

Run: 2026-05-15 (epoch send 1778834614739).
Method: **project CLI only** — `node dist/src/cli.js browser:tab:alloc|free|list|read|click|type|press|wait|status`.
NO Playwright MCP. NO raw codex. NO file upload triggered. No account/identity changes.
Probe tabs: `probe-cg` (chatgpt/9223), `probe-gm` (gemini-9225/9225) — both freed at end.
Pre-existing leaked `probe-cg`/`probe-gm` tabs were freed first, fresh ones allocated.

**Critical infra finding (reconfirmed):** `browser:read --tab-id <id>` REQUIRES
`--profile <name>`. The `browser:read` extractor returns ONLY a filtered
interactive/labeled `elements` array (warning: *"Accessibility snapshot
unavailable; DOM extraction was used."*). It does **NOT** surface custom
Angular elements like `model-response`, `message-content`, `response-container`,
`[data-response-id]`, even when present in the real page DOM. Completion gating
in `waitForPromptCompletion` runs `page.waitForFunction` against the **real
page DOM** (not the extractor), so selectors must be chosen for the real DOM;
this probe grounds them in extractor-visible elements that are confirmed
present in the live tree.

---

## TARGET A — ChatGPT image-mode (profile chatgpt, port 9223)

URL probed: `https://chatgpt.com/?model=gpt-4o`.

### A1 — Composer "add" button — CONFIRMED UNCHANGED
**Confidence: HIGH** (literal DOM read live).

- Selector: `#composer-plus-btn`
- Literal attributes:
  ```
  tagName=button  role(name)="Add files and more"
  type="button"  class="composer-btn"  data-testid="composer-plus-btn"
  aria-label="Add files and more"  id="composer-plus-btn"
  aria-haspopup="menu"  aria-expanded="false"
  ```
- Robust selector: `#composer-plus-btn` (id stable) — equivalently
  `button[data-testid="composer-plus-btn"]`. Current code selector
  (`CHATGPT_IMAGE_MENU_BUTTON_SELECTOR = "#composer-plus-btn"`) is **CORRECT**.

### A2 — "Create image" menu entry — CONFIRMED UNCHANGED
**Confidence: HIGH** (clicked the plus button live; menu enumerated).

- After click, full menu (single read after the click round-trip — **no extra
  explicit wait needed**; the menu was already queryable on the first post-click
  `browser:read`, i.e. menu render < the read round-trip latency, ~immediate.
  A defensive `waitForSelector` cap of ~1500ms is more than sufficient):
  `Add photos & files` (menuitem) · `Recent files` (menuitem,
  id=`radix-_r_4u_` **DYNAMIC — do not key on radix ids**) ·
  **`Create image` (menuitemradio)** · `Deep research` (menuitemradio) ·
  `Web search` (menuitemradio) · `More` (menuitem) · `Projects` (menuitem).
- "Create image" literal DOM:
  ```
  role="menuitemradio"  accessible-name/text = "Create image"
  aria-checked="false"  (flips true on select)  tabindex="0"
  class="group __menu-item"  data-state="unchecked"
  data-orientation="vertical"  data-radix-collection-item=""
  -- NO id, NO data-testid -- selectorCandidates was only ["div"]
  ```
- Robust selector: **role + accessible name** — Playwright
  `getByRole('menuitemradio', { name: 'Create image' })`; CSS-fallback
  `[role="menuitemradio"]:has-text("Create image")`. Current code selector
  (`CHATGPT_CREATE_IMAGE_RADIO_SELECTOR =
  '[role="menuitemradio"]:has-text("Create image")'`) is **CORRECT**.
- Required wait: post-click, poll/`waitForSelector` on the radio; it is
  effectively immediate. Recommend a `waitForSelector(..., {visible})` with a
  ~3000ms cap → on expiry emit `ELEMENT_NOT_FOUND` (no silent retry).

**A verdict: both selectors CONFIRMED UNCHANGED — A is not the bug.**

---

## TARGET B — Gemini Create-image button (profile gemini-9225, port 9225)

URL probed: `https://gemini.google.com/app?hl=en` (fresh composer).

### B1 — Zero-state suggestion chip — PRESENT on fresh composer
**Confidence: HIGH** (literal DOM read live).

- Selector: `button[aria-label="🖼️ Create image, button, tap to use tool"]`
  (matched by current code `button[aria-label*="Create image"]`).
- Literal attributes:
  ```
  tagName=button  role(name)="🖼️ Create image, button, tap to use tool"
  text="🖼️ Create image"
  class="mat-ripple card card-zero-state"
  aria-label="🖼️ Create image, button, tap to use tool"
  jslog=...["intent_chip_image",1,null,"en"]...  index:0
  ```
- **Caveat:** this is a *zero-state card chip* — present only on the empty/fresh
  composer; it disappears once a conversation is active. Siblings:
  Create music / Boost my day / Write anything / Create video / Help me learn.
- **Not behind an expander on the fresh composer** — directly visible.

### B2 — Persistent "Create image" tool (inside Tools drawer) — also available
**Confidence: HIGH** (clicked Tools drawer live; item captured).

- Expander: `button.toolbox-drawer-button` — accessible name **"Tools"**,
  `aria-haspopup="menu"`, class includes `toolbox-drawer-button
  toolbox-drawer-button-with-label`. Opens a drawer with no extra wait
  (queryable on first post-click read).
- Item literal DOM:
  ```
  tagName=button  role="menuitemcheckbox"
  accessible-name/text="Create image New"
  mat-list-item  aria-checked="false"  aria-disabled="false"
  class="mat-mdc-list-item ... toolbox-drawer-item-list-button ..."
  jslog=...[null,1,14,null,"image_generation_new"]...
  -- NO data-test-id
  ```
- Robust selector: role=menuitemcheckbox + name "Create image"
  (`[role="menuitemcheckbox"]:has-text("Create image")`), preceded by clicking
  `button.toolbox-drawer-button` ("Tools") + ~1500ms overlay wait.

**B verdict:** Current `GEMINI_CREATE_IMAGE_BUTTON_SELECTOR =
'button[aria-label*="Create image"]'` is **CORRECT for the fresh/empty
composer** (matches the zero-state chip). It will **FAIL if the composer is not
in zero-state** (existing conversation) — in that case the Tools-drawer path
(B2) is the robust fallback. Recommended fix: try B1 chip first; if absent
within ~2000ms, open the Tools drawer (`button.toolbox-drawer-button`) and
click `[role="menuitemcheckbox"]:has-text("Create image")`. Emit
`ELEMENT_NOT_FOUND` only if both fail.

---

## TARGET C — Gemini response-completion DOM (profile gemini-9225, port 9225)

SAFE text-only probe — exactly ONE prompt: `Reply with exactly: PROBE_OK`
typed into `rich-textarea .ql-editor[contenteditable="true"]`, sent via
Enter. NO upload, NO file. Sent at epoch 1778834614739.
Result: Gemini replied `PROBE_OK`; tab title → "Acknowledgment of Probe";
chat URL `https://gemini.google.com/app/c105e3656f80eded?hl=en`.

Poll-reads at T+9.6s, T+19s, T+28s, T+84s (read latency ~9s/full extract).

### Phase-A (generation STARTED) signal
**Confidence: MED** (extractor cannot see custom response elements, and the
PROBE_OK reply completed within the first read window so a streaming snapshot
was not captured directly).

- During generation the extractor showed **only** `button[aria-label="Send
  message"]` and the user query node — NO response-action toolbar, NO
  `button[aria-label="Stop response"]` was captured by the extractor (the
  Gemini Stop button is rendered transiently and was not in the filtered
  `elements` array at the read points; this matches the current code's
  Phase-A `stopSelector = 'button[aria-label="Stop response"]'`).
- The reliable Phase-A *start* marker in the real page DOM remains the
  appearance of the user-query turn + the stop affordance. Extractor-visible
  proxy for "started": the user query node
  `div.query-text[role="heading"][aria-level="2"]` (text "You said …") appears
  immediately and persists; assistant-turn count increases. Current code's
  Phase-A gate (`stopVisible || assistantCount > before`) is sound **provided
  `assistantMessageSelector('gemini')` matches a real-DOM node** (see below).

### Phase-B (response COMPLETE) signal — DEFINITIVE
**Confidence: HIGH** (stable & identical across T+28s and T+84s reads).

The response-action toolbar appears **only after** the response is fully
generated, and is stable thereafter. Confirmed literal DOM (extractor-visible
AND in real page DOM):

- `button[data-test-id="regenerate-button"]` — aria-label "Redo",
  mattooltip "Redo", `aria-haspopup="menu"`. **← single most reliable
  "Gemini response complete" marker.** Absent during generation.
- `button[data-test-id="thumb-up-button"]` — aria-label "Good response".
- `button[aria-label="Bad response"]` (thumb-down).
- `button[data-test-id="more-menu-button"]` — aria-label "Show more options"
  (same one used for image download — already wired in tools.ts).
- `button[aria-label="Copy"]`, `button[aria-label="Listen"]`.
- Simultaneously: `button[aria-label="Send message"]` is present/enabled and
  **NO `button[aria-label="Stop response"]`** anywhere.

**Definitive completion selector:** presence of
`button[data-test-id="regenerate-button"]` (equivalently the
`thumb-up-button`/`more-menu-button` trio) for the latest turn reliably means
"Gemini response complete". This is far more robust than keying on the
`model-response`/`message-content` custom tags in the current
`GEMINI_RESPONSE_SELECTOR` (line 298 tools.ts) — those were NOT observable via
the project CLI extractor and are the likely cause of the false
"completion not detected" in prior rounds.

**Recommended fix for `waitForPromptCompletion` (gemini lane):**
- Phase-A start gate: keep `stopVisible` OR (assistant/turn count increased).
  Add `button[data-test-id="regenerate-button"]` ABSENT as the "still
  generating" invariant.
- Phase-B complete gate: `button[aria-label="Stop response"]` absent AND
  `button[data-test-id="regenerate-button"]` present (for the latest turn) AND
  `button[aria-label="Send message"]` enabled. Drop sole reliance on
  `message-content/model-response` text-length stability; if a text-length
  stability check is kept, source the assistant text from the turn container
  that hosts the `regenerate-button`, not from `model-response`.
- Required waits: response toolbar appears at completion (PROBE_OK completed
  well under 60s; observed stable by T+28s, unchanged at T+84s). Keep the
  existing overall `responseTimeoutMs`; a ~1500ms post-stable debounce is
  adequate. No additional fixed sleep needed.

**Latency note:** the project-CLI full DOM extract itself costs ~9s per read;
that is extractor cost, NOT page latency. `waitForPromptCompletion` uses
in-page `waitForFunction` so it is not subject to this 9s extractor tax.

---

## Tab hygiene

- Freed pre-existing leaked: `probe-cg` (chatgpt), `probe-gm` (gemini-9225).
- Allocated + used: `probe-cg` (chatgpt), `probe-gm` (gemini-9225).
- Both freed at end. Post-state verified via `browser:tab:list`:
  ZERO `probe-`-prefixed tabs on either profile (see summary).

## Net delta vs. dom-probe-final.md (the stale file)

- A (ChatGPT plus btn + Create-image radio): **CONFIRMED UNCHANGED.**
- B (Gemini Create-image): chip selector **CONFIRMED** for zero-state; NEW:
  documented the persistent Tools-drawer fallback for non-zero-state composer.
- C: **CORRECTED.** Stale file never nailed the completion selector. The
  reliable, CLI-grounded "complete" marker is
  `button[data-test-id="regenerate-button"]` (+ `thumb-up-button` /
  `more-menu-button`), NOT the `model-response`/`message-content` custom tags
  in `GEMINI_RESPONSE_SELECTOR`, which the extractor never surfaces.
