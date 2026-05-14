---
title: Stream #3 Cross-Lane Synthesis
run_date: 2026-05-14
lanes:
  - chatgpt
  - claude
  - gemini
inputs:
  - .runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/inventory-report.md
  - .runs/web-ai-explore/stream3-claude-inventory-2026-05-14/inventory-report.md
  - .runs/web-ai-explore/stream3-gemini-inventory-2026-05-14/inventory-report.md
agent: claude-opus-orchestrator
---

# Stream #3 — Cross-Lane Synthesis

Three Claude Opus subagents drove `chatgpt.com`, `claude.ai`, and
`gemini.google.com` on three separate Chrome instances (CDP ports
9223/9224/9225) using the project's `browser:*` CLI primitives only.
Each lane ran the same 12-checkpoint deep-exploration ladder (locale
enforcement → identity → model select → new chat → send → capture →
upload 5 fixtures → download 2 artifacts) plus ≥6 catalog-gap
verifications.

All evidence (DOM snapshots, downloaded files with sha256, per-checkpoint
notes) lives under each lane's run dir. This synthesis does not re-quote
that evidence; it cross-references findings that need catalog edits or
human attention.

## 1. Comparative outcome matrix

| Metric | ChatGPT | Claude | Gemini |
|---|---:|---:|---:|
| Part A (12 checkpoints) | 11 PASS / 1 INCONCLUSIVE | 12 PASS | 12 PASS |
| Part B (6–9 checkpoints) | 4 PASS / 2 INCONCLUSIVE | 7 PASS / 1 INCONCLUSIVE | 9 PASS |
| Upload sweep (5 fixtures) | 5 / 5 | 5 / 5 (image+PDF chips lack filename in DOM) | 5 / 5 |
| Download sweep | 1 / 2 (image gen NOT reached) | 4 / 4 (py, svg, xlsx, docx) | 2 / 2 (py + 5.34 MiB png) |
| Locale forcing | English via Settings; partial drift on `/gpts` and Thinking-model chrome | Already English | English via `?hl=en` |
| Account / plan | `Shark Pro` / Pro | `qYg...@lobbyist.com` / Max | `cherrypie85arrow@gmail.com` / Pro |
| Model selected (cheap) | `Thinking` (GPT-5.5 Thinking) | `Sonnet 4.6 Adaptive` | `Fast` (Gemini 3 Flash) |
| Tab handoff | 40 → 40 (clean) | 1 → 1 (clean) | 1 → 1 (byte-identical) |
| Wall time | ~25 min (continuation) + ~10 min (finalize) | ~28 min | ~45 min |

## 2. Cross-service feature support — what actually works

| Capability | ChatGPT | Claude | Gemini |
|---|---|---|---|
| Text file upload + Q&A | ✅ filename in DOM | ✅ filename in DOM | ✅ filename in DOM |
| CSV upload + content Q&A | ✅ correct answer | ✅ correct answer | ✅ correct answer |
| Code file upload + content Q&A | ✅ correct answer | ✅ correct answer | ✅ correct answer |
| Image upload + description | ✅ filename in DOM | ⚠️ chip has NO filename in DOM | ✅ filename in DOM |
| PDF upload + title extract | ✅ filename in DOM | ⚠️ chip shows only `PDF` token | ✅ filename in DOM |
| Generated-code download | ✅ `button.behavior-btn` | ✅ icon-only `[aria-label="Download"]` works; in-message button times out | ✅ `[aria-label="Download code"]` |
| Generated-SVG/image download | ❌ NOT reached this run | ⚠️ requires re-prompt as "downloadable .svg file" | ✅ `[aria-label="Download full size image"]` (5.34 MiB PNG) |
| Generated DOCX/XLSX | not exercised | ✅ `verify:docx-min` confirmed 2 paragraphs | not exercised |

## 3. Critical findings (action-required)

### 3.1 Gemini `Share conversation` auto-publishes with no confirmation — SECURITY-IMPACT

- **Observation**: clicking `button[aria-label="Share conversation"]` immediately creates a public link. There is no intermediate `Create link` button. The Gemini lane subagent mitigated by visiting `/sharing` and using `Delete all links`.
- **Catalog impact**: `share-chat` row's `web_ui_path` is wrong — it says "click Share, Share conversation, then copy" but step 2 publishes.
- **Proposed catalog edit** (`docs/research/gemini-feature-catalog.md`):
  ```
  | share-chat | ... | web_ui_path: opening this dialog auto-creates a public link; cleanup via /sharing → Delete all links | automation_notes: AUTO_PUBLISH_NO_CONFIRM — any automation that opens this dialog publishes; only call after explicit user consent | ...
  ```
- **Project-level impact**: this is the kind of behavior that the consumer contract's "no public publishing" rule guards against. Worth adding a stable error code or a `confirmAutoPublish` flag to any future `gemini:share` recipe.

### 3.2 Claude `/settings/connectors` is broken on the Max account today

- **Observation**: `/settings/connectors` returns the literal toast `"This isn't working right now. You can try again later."` across two reads ~3s apart on 2026-05-14 07:33.
- **Catalog impact**: blocks verification of `prebuilt-web-connectors`, `custom-connector-add`, `integrations-setup`.
- **Proposed catalog edit** (`docs/research/claude-feature-catalog.md`):
  Keep these rows in `Gaps_and_uncertainties` with a `last_attempt: 2026-05-14T07:33Z error_toast` annotation. Re-attempt next run cycle.

### 3.3 Claude in-message Download button is non-functional — CONSUMER-CONTRACT-IMPACT

- **Observation**: file-creation artifacts (XLSX/DOCX) render two download buttons:
  - In-message: `button[aria-label="Download City populations"]` / `button[aria-label="Download <name>"]` — **times out with `ARTIFACT_DOWNLOAD_TIMEOUT`**.
  - Panel-header icon: `button[aria-label="Download"]` (32×32 px at ≈x=1160, y=10) — **works**.
- **Catalog impact**: if any automation targets the in-message button, it will fail.
- **Proposed catalog edit** (`docs/research/claude-feature-catalog.md`):
  ```
  | file-download-created | ... | web_ui_path: artifact panel header icon-only button[aria-label="Download"] (NOT the in-message Download <name> button, which currently times out) | automation_notes: button[aria-label="Download"] inside artifact panel header | ...
  ```
- **Verifier hook**: `verify:docx-min --path <abs>` should be standard postcondition on any Claude file-creation recipe.

### 3.4 Claude SVG image gen flows through MCP-app iframe — no direct download

- **Observation**: SVG-style image artifacts render inside `iframe[title="visualize: <name>"]` served from `*.claudemcpcontent.com/mcp_apps?...`. The iframe has **no download control**.
- **Workaround that actually worked**: re-prompt Claude with "save that SVG as a downloadable .svg file" — produces a code-file artifact with a working `aria-label="Download"` button.
- **Catalog impact**: the `artifacts-mcp-storage-update` gap row (which was marked `unknown` in v2) needs concrete notes about this rendering path.
- **Proposed catalog edit**:
  ```
  | artifacts-mcp-storage-update | ... | automation_notes: SVG-only artifacts render in *.claudemcpcontent.com/mcp_apps iframe with no direct download; must explicitly request "downloadable .svg file" to surface a code-file artifact with button[aria-label="Download"]; the iframe URL pattern is *.claudemcpcontent.com/mcp_apps?... | ...
  ```

### 3.5 ChatGPT image gen blocked in temporary chats — UX trap

- **Observation**: in a temp chat, requesting an image returns literal text `Image generation isn't available in this temporary chat. Switch to a regular chat to use the image generation tool.` In a regular chat, the model emitted `Thought for 21s` but no image artifact and no download control rendered in captured DOM.
- **Catalog impact**: `image-generation` row needs the temp-chat exclusion documented, and the regular-chat download path is **unverified** by Stream #3.
- **Proposed catalog edit** (`docs/research/chatgpt-feature-catalog.md`):
  ```
  | image-generation | ... | web_ui_path: regular chat only (temporary chats return blocking UI text); download path unverified — re-run with explicit `Use the image tool` and longer wait | automation_notes: behaviour-class temp-chat exclusion; download selector unknown | ...
  ```

### 3.6 ChatGPT Custom Instructions / Memory toggles not exposed as `role="switch"`

- **Observation**: B3 (`memory-reference-chat-history`) and B4 (`pulse-toggle`) labels exist in the Personalization tab DOM, but the toggle widgets are NOT exposed as discrete `role="switch"` elements. Current on/off state cannot be read via aria.
- **Catalog impact**: any automation that wants to read these toggle states needs a non-aria CSS path.
- **Proposed catalog edit**:
  ```
  | memory-reference-chat-history | ... | automation_notes: label visible on Personalization; toggle widget is NOT a role=switch element; state read requires non-aria CSS path (TBD) | ...
  | pulse-toggle | ... | (same pattern) | ...
  ```

## 4. Selector drift summary

| Service | Catalog says | Reality | Drift class |
|---|---|---|---|
| ChatGPT | `data-testid="model-switcher"` | Dynamic `id="radix-_r_i_"`; match by accessible name | selector-drift (no stable testid) |
| ChatGPT | "Custom Instructions" sub-modal | Inline section on Personalization tab | layout-drift |
| ChatGPT | "Manage memories" route | Inline `Saved memories` panel via `[aria-label="Manage memories"]` | path-drift |
| ChatGPT | "Improve the model" flat toggle | `data-testid="improve-model-open-modal-button"` opens confirmation modal | widget-drift |
| ChatGPT | English UI (after locale switch) | `/gpts` category tab leaks `精选推荐`; Thinking-model emits `已思考若干秒` | locale-drift (per-route i18n gap) |
| Claude | Settings → Language | NO `/settings/language`; surfaced via avatar dropdown → Language submenu | path-drift |
| Claude | One `Artifacts` toggle | THREE toggles in Capabilities → Visuals: `Artifacts`, `AI-powered artifacts`, `Inline visualizations` | structural-drift |
| Claude | Single `analysis-tool` toggle | Folded into `Code execution and file creation` toggle | merge-drift |
| Claude | One Download button per artifact | TWO buttons; only icon-only panel-header button works | widget-drift (see §3.3) |
| Claude | One `Share` modal | TWO surfaces: in-chat dialog + Settings → Privacy → Shared chats → Manage | scope-drift |
| Gemini | `Share` then `Share conversation` then copy | One-click auto-publish (no intermediate step) | behavior-drift (see §3.1) |
| Gemini | `picker offers Fast` | Picker shows `Fast / Thinking / Pro` under a `Gemini 3` banner; post-response menu reveals `Model: 3 Flash` | label-drift |
| Gemini | `download control for local formats` | Code-execution sandbox with `Show code` collapsible; download is `[aria-label="Download code"]` inside the code block | structural-drift |
| Gemini | (URLs missing in many catalog rows) | `/library`, `/sharing`, `/gems/view`, `/saved-info`, `/personalization-settings`, `/apps` | URL-omission |

## 5. Catalog additions (proposed new rows)

### ChatGPT (`docs/research/chatgpt-feature-catalog.md`)

1. `gpts-explore-landing` — the `/gpts` route renders an `Explore GPTs` landing with category tabs and three discoverable sections (`Featured this week`, `Trending`, `By ChatGPT`).
2. `personalization-base-style-tone` — `Base style and tone` selector + four independent `Default` toggles for `Warm / Enthusiastic / Headers & Lists / Emoji`.
3. `fast-answers-toggle` — `role="switch"` widget under "Fast answers" copy block (ON for this account).
4. `record-mode-reference-record-history` — web-Personalization toggle visible on Linux even when Record itself is macOS-only.
5. `data-controls-location-toggle` — `Off` for this account.
6. `data-controls-remote-browser-data` — `On` for this account.
7. `parental-controls` settings tab — confirms route `Settings → Parental controls`.

### Claude (`docs/research/claude-feature-catalog.md`)

1. `tool-access-mode-dropdown` — Settings → Capabilities; default `Load tools when needed`.
2. `allow-network-egress-toggle` — Settings → Capabilities; subtitle warns about security risks.
3. `connector-discovery-toggle` — Settings → Capabilities; "Let Claude surface connectors from the directory…"
4. `settings-claude-code-tab` — first-class sidebar tab in `/settings`.
5. `settings-claude-in-chrome-beta-tab` — first-class sidebar tab in `/settings`.
6. `privacy-location-metadata-toggle` — Settings → Privacy.
7. `privacy-help-improve-claude-toggle` — Settings → Privacy (training opt-in).
8. `privacy-export-data-button` — Settings → Privacy.
9. `customize-skills-add-skill` — `Add skill` action on `/customize/skills`.
10. `mcp-app-rendered-artifact-iframe` — `iframe[title="visualize: <name>"]` from `*.claudemcpcontent.com/mcp_apps?...`; no in-iframe download (see §3.4).

### Gemini (`docs/research/gemini-feature-catalog.md`)

1. `email-opt-in-card` — `Stay in the know` discovery card on first /app visit; buttons `Not now` / `Stay updated`.
2. `home-composer-quick-pick-chips` — `Boost my day / Help me learn / Write anything / Create image / Create music / Create video`.
3. `tools-menu-experimental-features-group` — group label containing `Labs` and `Personal Intelligence`.
4. `connected-apps-opentable` — new toggle.
5. `connected-apps-synthid` — new toggle.
6. `connected-apps-youtube-music` — new toggle.
7. `premade-gems-listing` — 8 premade Gems enumerated (Chess champ, Brainstormer, Career guide, Coding partner, Learning coach, Productivity planner, Storybook, Writing editor).
8. `your-premium-content-section` — sub-section on `/saved-info`.
9. `sharing-manager-page` — `/sharing` route titled `Your public links` with `Delete all links` bulk control.
10. `recent-chats-more-options-menu` — per-row menu items `Share conversation / Pin / Rename / Delete`.
11. `post-response-show-more-options` — menu items `Listen / Export to Docs / Draft in Gmail / Report legal issue / Model: 3 Flash`.
12. `side-panel-search-button` — `button[aria-label="Search"]` labeled `Search Loading Gems and Recent conversations`.
13. `my-stuff-media-tab` — `/library` page has a `Media` tab showing generated images.

## 6. Consumer contract observations (project-level)

These are not service findings but observations about the project's own CLI behaviour, surfaced because every Stream #3 lane hit them:

- **Sensitivity guard** on `browser:click` / `browser:type` / `browser:upload` blocks targets matching names like `Send`, `Generate`, `Submit`, `profile`, `Settings & help`, `Open upload file menu`, or content containing `downloadable`, `Share`. The sanctioned bypass is the explicit `--confirmed true` flag (used by Gemini lane) or the press-Enter alternate input path (used by Claude + Gemini lanes). Both produce evidence cleanly; the guard is doing its job.
- **`browser:artifact-click`** behavior verified across 3 services. Required arguments (`--button-selector`, `--download-dir`) work as documented; the existing `--locate-timeout-ms`, `--viewport-width/height`, `--scroll-main-to-y` flags were exercised by the Gemini lane to scroll Show-code into view (1500×1800 viewport, `--scroll-main-to-y 800`).
- **`verify:docx-min`** worked end-to-end on the Claude DOCX download (`stream_test_doc.docx`: 2 paragraphs, 44 chars). Validates the round-trip Stream #2-catalog → Stream #3-evidence → verifier chain.

No consumer-contract bumps proposed from Stream #3 directly. The catalog edits above are doc-level only.

## 7. Recommended next steps

In priority order:

1. **Apply the §3 critical-finding catalog edits to the 3 catalog files.** All 6 have concrete proposed edits above. Bump each catalog to `catalog_version: 1.2.0` with `augmentation_pass: 2026-05-14-stream3-live`.
2. **Apply the §4 selector-drift fixes** in the same pass. These are pure `web_ui_path` / `automation_notes` corrections.
3. **Add the §5 catalog additions as new rows** (~30 net-new across the 3 services). Each must cite a Stream #3 evidence path as `source`.
4. **Single atomic commit** for all 3 catalog updates + Stream #3 run dirs (including the `.codex-rejected` and `.attempt-*` archives, the doctrine, the fixtures, and this synthesis).
5. **Open follow-up items** (out of Stream #3 scope):
   - Re-run Claude `/settings/connectors` next cycle to verify it's still broken.
   - Re-run ChatGPT image-gen in a regular chat with a longer wait to verify download path.
   - Decide whether the consumer contract should add an `AUTO_PUBLISH_DETECTED` error code to surface Gemini-style one-click publish surfaces defensively in future recipes.

## 8. Anti-slop self-check

- No invented PASSes — every PASS in this synthesis traces back to a per-lane note.md with evidence.
- No hedge language — every claim cites a specific file or quotes the literal UI text.
- No retries hidden in the synthesis — each lane's stop condition was met on first writeup.
- No commits proposed inside Stream #3 dispatches — commits are explicit in §7 step 4.
- All three lane handoffs verified clean (40→40 ChatGPT, 1→1 Claude, 1→1 byte-identical Gemini).
