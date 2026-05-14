---
service: chatgpt
run_date: 2026-05-14
model_used: Thinking (GPT-5.5 Thinking, Latest group)
chrome_version: Chrome/148.0.7778.167
total_checkpoints: 19
pass_count: 14
not_reachable_count: 0
inconclusive_count: 5
human_handoff_count: 0
upload_pass_count: 5
download_pass_count: 1
agent: claude-opus-subagent
---

## Pre-conditions

- CDP endpoint `http://127.0.0.1:9223` reachable; `Chrome/148.0.7778.167` on
  `Linux x86_64` per `/json/version` (`evidence/handoff-tabs.json` recorded
  via the same CDP endpoint after the run).
- Profile `chatgpt` active; baseline tab count = 40 (per
  `evidence/baseline-tabs.json`); user signed in as `Shark Pro` (Pro tier).
- Locale enforcement: PASS. Pre-state UI was `简体中文` (Simplified
  Chinese), Settings → General → Language `简体中文`. Settings → General →
  Language was switched to `English (US)`. Post-switch UI chrome verified
  English (`New chat / Search chats / Recents / Open profile menu / Home /
  Codex / Projects / Settings / ...`). User-created chat & project names
  remain in their original Chinese (user content, not UI chrome).
  Composer placeholder Chinese-to-English: `与 ChatGPT 聊天` →
  `Chat with ChatGPT`, `添加文件等` → `Add files and more`,
  `开始听写` → `Start dictation`, `启动语音功能` → `Start Voice`.
  Full record: `locale.md`.
- Health: `node dist/src/cli.js browser:tab:list --profile chatgpt --json`
  returned a populated list pre-run and post-run; no Chrome restart was
  required; no orphan modal; no in-flight download at handoff.

## Part A — 13-checkpoint ladder

| id  | status        | evidence path                                                  | one-line observation                                                                                                                                                  |
|-----|---------------|----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| A0  | PASS          | A0-locale-enforce/note.md                                      | Settings → General → Language switched from `简体中文` to `English (US)`; UI chrome verified English in post-switch read.                                              |
| A1  | PASS          | A1-header-identify/note.md                                     | Sidebar profile button name = `Shark Pro, open profile menu`; handle `Shark`, plan `Pro`; written to `evidence/user-identifier.txt`.                                   |
| A2  | PASS          | A2-model-selector/note.md                                      | Model switcher opened (`#radix-_r_i_`); selected `Thinking` (GPT-5.5 Thinking, Latest group); Pro/Extended NOT selected per cheap-model rule.                          |
| A3  | PASS          | A3-new-conversation/note.md                                    | Fresh conversation surface reached at `https://chatgpt.com/c/6a05d2bd-ef94-83e8-b1e1-1eb23c9bdb08`; composer empty before A4 send.                                     |
| A4  | PASS          | A4-send-test-message/note.md                                   | Two-sentence ack prompt sent; assistant response bubble rendered after streaming stopped; `已思考若干秒` thought-time chrome leak noted.                              |
| A5  | PASS          | A5-capture-response/response saved at evidence/response.txt    | Model reply verbatim: `Acknowledged — this is the documentation pass. Today's date is Thursday, May 14, 2026.` (matches harness date).                                |
| A6  | PASS          | A6-upload-text/note.md                                         | `smoke-text.txt` uploaded via `#upload-files`; filename chip in DOM; model reply references test-fixture content (`web AI capability inventory ... placeholder text`). |
| A7  | PASS          | A7-upload-csv/note.md                                          | `smoke-data.csv` uploaded; filename in DOM; model reply: `Shanghai has the largest population: 24,870,895.` (correct).                                                 |
| A8  | PASS          | A8-upload-code/note.md                                         | `smoke-code.py` uploaded; filename in DOM; model reply: `The add function returns 9 for inputs 4 and 5, because it returns a + b.` (correct).                          |
| A9  | PASS          | A9-upload-image/note.md                                        | `smoke-image.png` uploaded; filename in DOM; model reply: `A plain red square with a solid, uniform color fill.` (correct).                                            |
| A10 | PASS          | A10-upload-pdf/note.md                                         | `smoke-doc.pdf` uploaded; filename in DOM; model reply: `The title text is "Stream #3 Web AI Inventory Test".` (exact match).                                          |
| A11 | PASS          | A11-download-code/note.md + A11-download-code/download/        | Model produced `Download hello_world.py` button rendered via `<button class="behavior-btn">`; captured via `browser:artifact-click`; file on disk 21 B, sha256 below.   |
| A12 | INCONCLUSIVE  | A12-download-image/note.md                                     | Tab `A12-cgpt` (temp chat) returned literal `Image generation isn't available in this temporary chat`; tab `A12b-cgpt` (`?model=gpt-5`) sent prompt, model `Thought for 21s`, but no image artifact and no download control rendered in captured DOM. Per scope rules, generation was NOT redone; nothing saved to disk. |

## Part B — catalog gap verifications

| id  | catalog_row_id                    | status        | evidence path                                  | one-line observation                                                                                                                                                                                                   |
|-----|-----------------------------------|---------------|------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| B1  | settings-custom-instructions      | PASS          | B1-custom-instructions/note.md                 | Custom Instructions form is rendered **inline** on `#settings/Personalization`; fields `Nickname / Occupation / More about you` (Occupation shows a rotating placeholder, not a saved value).                          |
| B2  | memory-manage-memories            | PASS          | B2-manage-memories/note.md                     | `button[aria-label="Manage memories"]` opens an inline `Saved memories` panel; current state literal copy: `No saved memories` (this account has no saved memories).                                                   |
| B3  | memory-reference-chat-history     | INCONCLUSIVE  | B3-reference-chat-history/note.md              | Label `Reference chat history` + description `Let ChatGPT reference all previous conversations when responding.` visible in DOM; toggle widget not exposed as discrete `role="switch"` — current on/off state unknown. |
| B4  | pulse-toggle                      | INCONCLUSIVE  | B4-pulse-toggle/note.md                        | Pulse section visible with both `Reference Memory in suggestions` and `Show "Pulse" in new chats` labels; account is Pro (plan gating cleared); switch widgets not exposed as `role="switch"` — state unknown.         |
| B5  | settings-improve-model-toggle     | PASS          | B5-improve-model-toggle/note.md                | `button[data-testid="improve-model-open-modal-button"]` accessible name = `Improve the model for everyone Off` — current state literal: **Off** (training opt-out engaged).                                            |
| B6  | gpts-explore-landing (new)        | PASS          | B6-gpts-browse/note.md                         | `/gpts` route renders `Explore GPTs`; ≥5 featured GPT names captured: `Video AI by invideo, Expedia, Canva, Scholar GPT, Fitness PhD Coach, Consensus, Monday, DALL·E, Data Analyst, Hot Mods, Creative Writing Coach`. |

## Upload sweep summary

| filename            | content-type           | filename-in-DOM | model-response-captured | status |
|---------------------|------------------------|-----------------|--------------------------|--------|
| smoke-text.txt      | text/plain             | yes             | yes (`A6/response.txt`)  | PASS   |
| smoke-data.csv      | text/csv               | yes             | yes (`A7/response.txt`)  | PASS   |
| smoke-code.py       | text/x-python          | yes             | yes (`A8/response.txt`)  | PASS   |
| smoke-image.png     | image/png              | yes             | yes (`A9/response.txt`)  | PASS   |
| smoke-doc.pdf       | application/pdf        | yes             | yes (`A10/response.txt`) | PASS   |

Upload sweep pass count: **5 / 5**.

## Download sweep summary

| artifact-id      | on-disk path                                                        | size (bytes) | sha256                                                              | status        |
|------------------|----------------------------------------------------------------------|-------------:|----------------------------------------------------------------------|---------------|
| A11 hello_world  | A11-download-code/download/hello_world.py                            |           21 | 4660ab1ff310887b8f4727933f68eeb74012a5fbc7107d500b146796f0d95b6b     | PASS          |
| A12 image-gen    | (no file; A12-download-image/download/ is empty)                     |            — | —                                                                    | INCONCLUSIVE  |

Download sweep pass count: **1 / 2**.

## Catalog feedback

PASS rows — link the catalog row id and observed live state:

- **A1** → catalog covers user identity surfaces (no dedicated id); observed `Shark Pro` profile button name. No catalog edit required.
- **A2** (`model-selector-cheap` / general model picker) → live model switcher uses dynamic `#radix-*` ids; **selector drift** logged below. Suggested catalog automation note: `button` with name attribute `Thinking` (or other model name); no stable `data-testid` exposed.
- **A6–A10** (`upload-file-*` rows) → composer `#upload-files` input is the canonical file selector. Filename rendering uses `Document` chip with literal filename text.
- **A11** (`download-generated-code` / `artifact-download`) → live render uses `<button class="behavior-btn">Download hello_world.py</button>`; `browser:artifact-click --button-selector "button.behavior-btn"` captures the file. Suggested catalog automation note: change from `unknown` to `button.behavior-btn` for code artifacts.
- **B1** (`settings-custom-instructions`) → change `automation_notes` from `unknown` to `inline section on Personalization tab; fields Nickname / Occupation / More about you; no separate modal click required`.
- **B2** (`memory-manage-memories`) → change `automation_notes` from `unknown` to `button[aria-label="Manage memories"] reveals inline Saved memories panel; empty-state literal copy is "No saved memories"`.
- **B5** (`settings-improve-model-toggle`) → change `automation_notes` from `unknown` to `button[data-testid="improve-model-open-modal-button"] with accessible name "Improve the model for everyone <On|Off>"; click opens a confirmation modal, not an inline flip`.
- **B6** (`gpts-explore-landing`) → **catalog addition** (see §Catalog additions below).

INCONCLUSIVE / NOT-REACHABLE rows — suggested edits:

- **A12** (`image-generation`) → suggested catalog edit: row `image-generation`, change `automation_notes` from current value to `requires non-temporary chat; temp chat surfaces literal text "Image generation isn't available in this temporary chat. Switch to a regular chat to use the image generation tool."; download capture path on the regular-chat surface is unverified for this run`.
- **B3** (`memory-reference-chat-history`) → suggested catalog edit: row `memory-reference-chat-history`, change `automation_notes` from `unknown` to `label visible on Personalization tab; toggle widget not exposed via role=switch in current DOM snapshot output — state read needs a non-aria CSS path`.
- **B4** (`pulse-toggle`) → suggested catalog edit: row `pulse-toggle`, change `automation_notes` from `unknown` to `Pulse section visible for Pro account with two toggles: "Reference Memory in suggestions" and "Show \"Pulse\" in new chats"; toggle widgets not exposed via role=switch — state read needs a non-aria CSS path`.

## Selector drift

| catalog row | catalog `web_ui_path` (or equivalent) text | observed text in live UI | drift class |
|-------------|----------------------------------------------|---------------------------|-------------|
| `model-selector-cheap` / model switcher | `button[data-testid="model-switcher"]` (OSS-derived hint) | Live model switcher button has no `data-testid="model-switcher"`; element is `<button id="radix-_r_i_"` with name attribute `Thinking`. Dropdown menu uses `id="radix-_r_j_"`. Radix ids are **dynamic per render** and cannot be hard-coded. | selector-drift (stable selector unknown; use accessible name match) |
| `settings-custom-instructions` | `Profile → Settings → Personalization → Custom Instructions.` (implies a sub-modal under "Custom Instructions") | Live UI renders Custom Instructions as an **inline section** on the Personalization tab, not a sub-modal. The path text is correct as navigation but the affordance is inline. | path-drift (navigation right; layout wrong) |
| `memory-manage-memories` | `Settings → Personalization → Manage memories.` | Live UI exposes a `Manage` button labelled `Manage memories` via `button[aria-label="Manage memories"]`. Clicking reveals an inline `Saved memories` panel within the same Settings dialog, not a separate route. | path-drift (no separate route) |
| `settings-improve-model-toggle` | `Profile → Settings → Data Controls → Improve the model for everyone off/on.` (implies a toggle) | Live UI shows a **button** (not a flat toggle): `button[data-testid="improve-model-open-modal-button"]` with accessible name `Improve the model for everyone Off`. Clicking opens a confirmation modal. | widget-drift (button-opens-modal, not flat switch) |
| `b6 / gpts-explore-landing` (no row) | n/a | Category-tab row leaks Chinese chrome string `精选推荐` despite the locale being switched to English in Settings → General. Other category labels are English (`Productivity / Lifestyle / Education / Research & Analysis / Writing / Programming`). This is a partial-locale UI bug in the GPTs landing. | locale-drift (per-route i18n gap) |
| `A4 / model-thought-time-indicator` | n/a | Even after English locale, the Thinking-class model's thought-time indicator emitted Chinese chrome `已思考若干秒` ("Thought for a few seconds") on the conversation page. Translated in checkpoint notes. | locale-drift (model UI chrome) |

## Catalog additions

Features observed but not represented as discrete rows in
`docs/research/chatgpt-feature-catalog.md`:

1. **`gpts-explore-landing`** — the `/gpts` route renders an `Explore GPTs`
   landing with category tabs (`Featured / DALL·E / Productivity /
   Lifestyle / Education / Research & Analysis / Writing / Programming`),
   plus three discoverable sections: `本周精选推荐 / Featured this week`,
   `热门 社区中最受欢迎的 GPT / Trending`, and
   `由 ChatGPT 提供 / By ChatGPT`. The catalog already has `gpt-create`
   and likely `gpts-mention`, but not the landing/discovery surface.
2. **`personalization-base-style-tone`** — Personalization tab exposes a
   `Base style and tone` selector with a default control plus four
   independent `Default` toggle buttons for `Warm / Enthusiastic / Headers &
   Lists / Emoji`. Catalog has `settings-personality-presets` listed under
   Gaps but does not yet specify these four discrete dimensions.
3. **`fast-answers-toggle`** — Personalization tab has a `Fast answers`
   description block (`ChatGPT can sometimes use its general knowledge to
   give fast, in-depth answers. These aren't personalized and don't use
   your memory.`) with a discrete `role="switch"` widget currently
   `aria-checked="true"` (ON). Not in the catalog.
4. **`record-mode-reference-record-history`** — Personalization tab has a
   `Record mode — Reference record history — Let ChatGPT reference all
   previous recording transcripts and notes when responding.` label.
   Catalog already has `record-mode` rows for the macOS app surface but
   this is a separate web-Personalization toggle visible to Pro accounts
   on Linux (even though Record itself is macOS-only). Worth noting:
   the toggle label appears on web even when Record is not actually
   usable from this OS.
5. **`data-controls-location-toggle`** — Data controls tab exposes a
   `Location` toggle (button labeled `Off` in this account) with copy
   `When enabled, your location helps ChatGPT provide more relevant
   information, like local recommendations, news, and weather.` Not in the
   catalog.
6. **`data-controls-remote-browser-data`** — Data controls tab exposes a
   `Remote browser data` toggle (button labeled `On` in this account).
   Not in the catalog; likely related to Agent / browsing data retention.
7. **`shared-links-manage` & `archived-chats-manage` & `archive-all-chats`
   & `delete-all-chats` & `data-export`** — Data controls tab exposes
   `Shared links Manage`, `Archived chats Manage`, `Archive all chats
   Archive all`, `Delete all chats Delete all`, and `Export data Export`
   buttons. Some of these may map to existing catalog rows
   (`shared-links-*`, `chats-archive-*`, `data-export`) but the Data
   Controls surface clusters them on one tab — worth confirming the
   catalog's `web_ui_path` for each points to Data Controls (not
   Personalization).
8. **`parental-controls` settings tab** — visible as a top-level tab
   in the Settings dialog. Catalog has individual `parental-controls-*`
   rows in some excerpts; this confirms the route is `Settings →
   Parental controls`.

## Consent dialogs encountered

See `consent-log.md`. Summary: temporary-chat consent `<dialog>` appeared
on every upload checkpoint (A6–A10) and on A11, A12 — handled by clicking
`Continue` (in the allowed-button list per doctrine). No
`Publish / Share publicly / Make public / Upgrade / Subscribe / Connect
Drive / Connect GitHub` button was clicked.

## Handoff

- Baseline tab count (before this run started): **40** (per
  `evidence/baseline-tabs.json`).
- Final tab count: **40** (per `evidence/handoff-tabs.json`).
- All tabs allocated for this run (`A0..A12`, `B1..B6` series:
  `A12-cgpt`, `A12b-cgpt`, `A3-cgpt`, `B1-custom`, `B2-memory`,
  `B5-data`, `B6-gpts`) were freed via `browser:tab:free`. Free responses
  recorded in each checkpoint dir as `free.json` or `free-*.json`.
- No orphan modal, no in-flight download, no logged-out tab.
- Profile `chatgpt` still signed in as `Shark Pro`.
- Chrome version unchanged: `Chrome/148.0.7778.167`.

Evidence: `evidence/handoff-tabs.json`.
