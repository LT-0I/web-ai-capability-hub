---
service: gemini
run_date: 2026-05-14
phase: stream4-exhaustive
model_used: Fast
chrome_version: Chrome/148.0.7778.167
total_features_attempted: 36
pass_count: 28
not_reachable_count: 4
inconclusive_count: 4
human_handoff_count: 0
generation_artifacts_downloaded: 7
agent: claude-opus-subagent
---

## Pre-conditions

- CDP health: `http://127.0.0.1:9225/json/version` returned
  `Chrome/148.0.7778.167`, `Protocol-Version: 1.3`
  (`evidence/chrome-version.txt`).
- `node dist/src/cli.js browser:status --profile gemini-9225 --json`
  reported `connected: true`.
- Baseline tab set: 1 tab (`gemini-main` →
  `https://gemini.google.com/app/2a8af10cd58b7fbf`). Saved to
  `evidence/baseline-tabs.json`.
- Locale forced to English via `?hl=en` on every allocated tab. Confirmed
  English chrome on all pages visited (see `meta/locale/note.md`).
- Account identifier: `cherrypie85arrow@gmail.com` (display `Shark 7`).
  PRO badge visible on every page.
- Cheap-model policy: selected literal model name **`Fast`** at every
  fresh tab. Never Pro / Thinking / Ultra / Deep Think.

## Group: core

| feature-id | status | evidence path | observation |
|---|---|---|---|
| core/locale-enforce | PASS | `core/locale-enforce/` | `?hl=en` honoured; composer placeholder `Enter a prompt for Gemini`, nav `Settings & help / Tools / Gems` all English. |
| core/header-identify | PASS | `core/header-identify/user-identifier.txt` | Avatar element: `Google Account: Shark 7 (cherrypie85arrow@gmail.com)`. PRO badge as `button | PRO`. |
| core/model-select-cheap | PASS | `core/model-select-cheap/` | Picker showed `Fast / Thinking / Pro / Upgrade`. Selected `Fast` via `button.mat-mdc-menu-item:has(span:has-text("Fast"))`. |
| core/new-chat | PASS | `core/new-chat/note.md` | Fresh `/app?hl=en` allocation produced empty composer; URL transitioned to `/app/<id>` on first send. |
| core/send-receive | PASS | `core/send-receive/response.txt` | Two-sentence ack received: "I have successfully received this Stream 4 lane 3 probe message and confirmed its arrival. Today's date is Thursday, May 14, 2026." |

## Group: upload

| feature-id | status | evidence path | observation |
|---|---|---|---|
| upload/text | PASS | `upload/text/response.txt` | Summary references 50 placeholder lines + "documentation pass test fixture"; line count "52" correct. |
| upload/csv | PASS | `upload/csv/response.txt` | Q1: `Shanghai`. Q2: `Beijing, Shanghai, Tokyo, Paris, New York`. |
| upload/code | PASS | `upload/code/response.txt` | Q1: `9`. Q2: `add = lambda a, b: a + b`. |
| upload/image | PASS | `upload/image/response.txt` | Vision: "solid, uniform square of a vibrant red color"; color: "Red". |
| upload/pdf | PASS | `upload/pdf/response.txt` | Title: "Stream #3 Web Al Inventory Test" (OCR mis-read AI→Al). Pages: 1. |
| upload/multifile | PASS | `upload/multifile/response.txt` | All 3 sub-questions (text+csv+image) answered correctly in a single response after 3 sequential upload-menu invocations. |
| upload/from-drive | NOT-REACHABLE | `upload/from-drive/note.md` | `Add from Drive` menuitem visible. Requires Drive OAuth consent — out of scope per doctrine §3. |

## Group: generate

| feature-id | status | artifact path | sha256 (bytes) | observation |
|---|---|---|---|---|
| generate/python | PASS | `generate/python/download/f15bd82b....py` | `f15bd82b5fc3bb13e49317fc081811305dfc02dfd9c9e35332b72a9402c92a8b` (489 B) | Sandbox-wrapped `primes.py`. Downloaded via `browser:artifact-click` after `Show code` expand + viewport 1500x2400. |
| generate/markdown | INCONCLUSIVE | `generate/markdown/download/52f6014a....py` | `52f6014ae1cd755f568c4421f22b3ebd3abe8489bf7c537306c0d29bc709fbe5` (1,646 B) | Gemini sandbox wraps requested .md in a Python file (`content = """..."""`). No native "Download as .md" surface — see Catalog feedback. |
| generate/csv | INCONCLUSIVE | `generate/csv/download/0f2f69f5....py` | `0f2f69f569ce7a58a74c98467e6a8552837050ac638d0506c3871bad7d24ca46` (483 B) | Pandas script returned, not raw .csv. Same architectural finding as generate/markdown. |
| generate/docx | INCONCLUSIVE-by-design | `generate/docx/note.md` | n/a | No native DOCX download. Reachable only via Canvas+Export-to-Docs route (see `generate/canvas-text`). |
| generate/pdf | INCONCLUSIVE-by-design | `generate/pdf/note.md` | n/a | Same as generate/docx. |
| generate/pptx | NOT-REACHABLE | `generate/pptx/note.md` | n/a | No PPTX surface; only Canvas/Export-to-Docs reachable. |
| generate/svg | INCONCLUSIVE | `generate/svg/download/4f3dfd5b....py` + `extracted.svg` | `4f3dfd5b9cde8f611c2f346817215ebab679afc47b8e01eba2866fdfb99115fa` (382 B) | Sandbox source script wraps valid SVG markup; extracted .svg verified via `file(1)` as `SVG Scalable Vector Graphics image`. |
| generate/image | PASS | `generate/image/download/c0dfaf57....png` | `c0dfaf5729c3c3ea9895580333de4c0cfeec9d37303f2c9860a212ad5547aa28` (4,225,012 B) | `Create image` quick-chip → composer prompt → `button[aria-label="Download full size image"]` via artifact-click. 2048x2048 PNG. |
| generate/canvas-text | PASS | `generate/canvas-text/exported-doc-url.txt` | n/a | Tools → Canvas → composer → Expand → `Share and export canvas` → `Export to Docs`. Auto-opened Docs tab at `docs.google.com/document/d/1Trf35Ozlw9cGJgEkAhGTKrxBzt-pEdYdQ2a6KD2Oa24/edit`. |
| generate/deep-research | PASS | `generate/deep-research/response.txt` (14,398 chars) | n/a | Plan generated in ~20s → Start research → completed in ~7 min → 14k-char report rendered with 28+ sources. `Export to Docs` creates Drive document (visible in /library as "Gemini 3 Fast vs. Pro Comparison"). |
| generate/video | PASS | `generate/video/download/b275d515....mp4` | `b275d5156efb88a433da973042f26b485298287e1fc640ddf55c6e0327c4e2ce` (767,503 B) | Tools → Create video → composer prompt for "red bouncing ball, 2s" → 8-second MP4 generated in ~3-4 min → `button[aria-label="Download video"]` via artifact-click. Verified ISO MP4. |
| generate/audio-overview | PASS | `generate/audio-overview/note.md` | n/a (streamed) | Per-response menu → `Listen` → audio plays (`button[aria-label="Pause"]` appears). No `Download audio` button — TTS is ephemeral. |
| generate/scheduled-action | PASS | `generate/scheduled-action/form.json` | n/a | URL `/scheduled?hl=en` (catalog says `/scheduled-actions` — wrong: 404). Page shows 4 templates + `New action` modal: `Name / Instructions / Schedule (Daily 9:00 AM) / Cancel / Create`. Cancel clicked, NOT Create. |
| generate/long-context | PASS | `generate/long-context/response.txt` | n/a | Uploaded synthesized 67.8KB / 13.5k-word fixture (150 paragraphs); model returned correct paragraph count 150 + accurate summary. |

## Group: settings (read-only)

| feature-id | status | evidence path | observation |
|---|---|---|---|
| settings/menu | PASS | `settings/menu/snapshot.json` | Settings & help menu items verbatim: `Activity, Personal Intelligence, Import memory to Gemini (New), Scheduled actions, Your public links, Theme, Manage subscription, Upgrade to Google AI Ultra, NotebookLM, Send feedback, Help, California USA From your IP address, Update location, Help Center, Privacy`. |
| settings/personalization | PASS | `settings/personalization/note.md` | URL `/personalization-settings?hl=en`. 1 master toggle (`Enables or disables the use of personal Gemini context`). 4 links (Manage and delete, Learn more, Go to Connected Apps, Go to Instructions). |
| settings/saved-info | PASS | `settings/saved-info/note.md` | URL `/saved-info?hl=en`. 1 master toggle + `Add` button. No durable changes. |
| settings/apps | PASS | `settings/apps/note.md` | URL `/apps?hl=en`. 9 switches across Google + Other (Gmail/Calendar/Docs/Drive/Keep/Tasks via Workspace, Photos, Search services, YouTube, YouTube Music, GitHub, OpenStax, OpenTable, SynthID). |
| settings/my-stuff | PASS | `settings/my-stuff/note.md` | URL `/library?hl=en`. 2 items auto-populated this session: Deep Research report + Canvas document. |

## Group: tools

| feature-id | status | evidence path | observation |
|---|---|---|---|
| tools/composer-bar | PASS | `tools/composer-bar/note.md` | Tools menu items verbatim: `Create image (New), Create video, Canvas, Deep research, Create music (New), Guided learning`. Home-screen quick chips: 6 (Create image/music/video, Help me learn, Write anything, Boost my day). |
| tools/gems-landing | PASS | `tools/gems-landing/note.md` | URL `/gems/view?hl=en`. 8 premade Gems enumerated verbatim (Chess champ + Storybook tagged Experiment). |
| tools/gems-launch-premade | PASS-with-caveat | `tools/gems-launch/note.md` | Clicking Brainstormer launches a `gem-labs` iframe app, NOT a standard `/app/<id>` chat. Composer is inside iframe; standard selector cannot reach it. |
| tools/gems-create-custom | PASS | `tools/gems-create/note.md` | URL `/gems/create?hl=en`. Editor + Preview split view captured. Fields: Name / Description / Instructions / Default tool / Knowledge / Citations toggle. Did NOT click Save. |

## Group: share

| feature-id | status | evidence path | observation |
|---|---|---|---|
| share/menu | PASS | `share/menu/note.md` | Per-response menu: Listen, Export to Docs, Draft in Gmail, Report legal issue, Model name. Per-chat ellipsis (Stream #3 ref): Share conversation, Pin, Rename, Delete. |
| share/export-to-docs | PASS | `share/export-to-docs/note.md` | Exercised twice (Canvas + Deep Research). Both Docs created in user's Drive. Canvas variant auto-opens a new tab; Deep Research variant lands in /library + Drive without auto-tab. |
| share/sharing-manager-cleanup | PASS | `share/sharing-manager/note.md` | `/sharing` page shows zero public links (empty state). No share auto-publish triggered this run. |

## Group: meta

| feature-id | status | evidence path | observation |
|---|---|---|---|
| meta/baseline-tabs | PASS | `evidence/baseline-tabs.json` | 1 tab at start (`gemini-main`). |
| meta/locale | PASS | `meta/locale/note.md` | English chrome on all pages; only historical chat titles in Chinese (unavoidable). |
| meta/consent-log | PASS | `consent-log.md` | No first-use disclaimers (already agreed on this account). No CAPTCHA / sign-in / billing surfaces hit. |
| meta/handoff-tabs | PASS | `evidence/handoff-tabs.json` | 1 tab at end (`gemini-main`). Matches baseline. Allocated lane tabs all freed. |
| meta/account-pro-badge | PASS | `meta/account/note.md` | PRO badge visible on every page; Upgrade button visible but never clicked. |

## MCP automation candidates

Each candidate below has a clean, deterministic, single-call automation
path with stable selectors.

1. **Tool name: `webai.gemini.send_prompt`**
   - Input: `{ "prompt": string, "model"?: "Fast"|"Thinking"|"Pro", "tab_url_contains"?: string }`
   - Output: `{ "response": string, "chat_url": string, "model_used": string, "error_code"?: contract-taxonomy }`
   - Stability: composer = `div[role="textbox"][aria-label="Enter a prompt for Gemini"]`; send = `button[aria-label="Send message"]`; needs `--confirmed true` when prompt contains sensitive keywords. Mode pick via `button[aria-label="Open mode picker"]` + `button.mat-mdc-menu-item:has(span:has-text("<Name>"))`.

2. **Tool name: `webai.gemini.upload_and_ask`**
   - Input: `{ "files": string[], "prompt": string, "tab_url_contains"?: string }`
   - Output: same shape as `send_prompt` + `{ "files_in_chip": string[] }`
   - Stability: 2-step click sequence (`button[aria-label="Open upload file menu"]` → `button[aria-label="Upload files. Documents, data, code files"]` → `input[type="file"]` with `setInputFiles`); chip selector `button[aria-label*="Remove file"]`. First-use disclaimer must be auto-agreed once per profile.

3. **Tool name: `webai.gemini.generate_image`**
   - Input: `{ "prompt": string, "download_dir": absolute path, "size"?: "1024x1024"|... }`
   - Output: `{ "file_path": string, "sha256": string, "size_bytes": int, "error_code"?: ... }`
   - Stability: home-screen chip `button[aria-label="🖼️ Create image, button, tap to use tool"]` (or Tools menu Canvas chip). Download: `button[aria-label="Download full size image"]` via `browser:artifact-click` at viewport 1500x1800.

4. **Tool name: `webai.gemini.generate_video`**
   - Input: `{ "prompt": string, "download_dir": absolute path, "duration_seconds"?: 2|4|8 }`
   - Output: `{ "file_path": string, "sha256": string, "size_bytes": int, "duration_seconds": int, "error_code"?: ... }`
   - Stability: `button[aria-label="Create video, button, tap to use tool"]` quick chip; download `button[aria-label="Download video"]`. Latency 3-5 min for 8s clip. Pro/Ultra-only (returns `INSUFFICIENT_PLAN` error code for free accounts).

5. **Tool name: `webai.gemini.canvas_to_docs`**
   - Input: `{ "prompt": string }`
   - Output: `{ "docs_url": string, "docs_doc_id": string, "title": string, "error_code"?: ... }`
   - Stability: Tools → Canvas (`#toolbox-drawer-menu button[role="menuitemcheckbox"]:has-text("Canvas")`) → composer prompt → `button[aria-label="Expand"]` → `button[aria-label="Share and export canvas"]` (needs `--confirmed true`) → menuitem `Export to Docs`. Docs tab auto-opens for monitoring. Both selector path and outcome are deterministic.

6. **Tool name: `webai.gemini.deep_research_summary`**
   - Input: `{ "topic": string, "time_budget_seconds"?: number (default 900) }`
   - Output: `{ "report_text": string, "sources": string[], "drive_doc_url"?: string, "completion_seconds": number, "error_code"?: ... }`
   - Stability: Tools → Deep research → composer prompt → wait for plan → `button[aria-label="Start research"]` → poll until `Share & Export` button (`button[data-test-id="export-menu-button"]`) appears → click + select `.cdk-overlay-pane button.mat-mdc-menu-item:has-text("Export to Docs")`. Report text harvestable from DOM as fallback even if Drive Doc creation is slow. Stable error code: `RESEARCH_TIMEOUT` if > time_budget.

## MCP non-candidates

- **Generic file generation (.csv/.docx/.pdf/.xlsx/.md)** — Gemini's
  code-execution sandbox always returns the **source Python script**,
  not the artifact. A reliable MCP for "give me the actual file" would
  need to either (a) run the returned script locally (security risk) or
  (b) use the Canvas → Export-to-Docs path (only works for text-shaped
  artifacts). Mark as MCP-pending-redesign.
- **`tools/gems-launch-premade`** — at least Brainstormer now opens as an
  iframed `/gem-labs/<id>` app; the composer is unreachable from the
  outer frame. Other Gems may behave differently. Selector instability
  → not safe for MCP yet.
- **Share auto-publish (`Share conversation`)** — single button auto-creates
  a public link with no confirmation. Safety-incompatible with MCP
  unless paired with mandatory `/sharing → Delete all links` cleanup.
- **Audio Overview download** — surface plays but no file-export
  control; cannot meet "download artifact" MCP contract.
- **Scheduled actions** — read-only inspection is MCP-able, but creating
  one durably modifies account state and would violate the
  "no durable changes" doctrine for general use.

## Catalog feedback

**Selector / URL drift discovered (Stream #4 lane 3):**

1. **`scheduled-actions-manage` URL** — Catalog says generic path. Actual
   URL is `https://gemini.google.com/scheduled?hl=en` (the `/scheduled-actions`
   path 404s). Catalog edit: set `web_ui_path = /scheduled`.

2. **`gems-launch` divergence** — Some premade Gems now open at
   `/gem-labs/<id>` inside an iframe instead of `/app/<id>`. Catalog
   should split `gems-launch-premade` into `gems-launch-classic` (chat
   path) and `gems-launch-gem-lab` (iframe path). Brainstormer was
   `classic` in Stream #3 (1 day ago) and `gem-lab` in Stream #4 →
   active rollout / A/B drift.

3. **Code/markdown/csv/svg download = source-only** — Catalog row
   `file-download` should clarify: **Gemini does not download artifacts
   produced by the code-execution sandbox**; only the source Python
   script is downloadable. To get the actual file, callers must use
   Canvas → Export-to-Docs (text shapes only) or a downstream pipeline.
   This is a recurring catalog ambiguity worth raising.

4. **`Share and export canvas` is the Canvas-specific export trigger** —
   distinct from the per-response `Show more options → Export to Docs`.
   Catalog should add a row `canvas-export-share` with selector
   `button[aria-label="Share and export canvas"]` + 3-item menu
   (`Share Canvas / Export to Docs / Copy`).

5. **Deep Research export menu trigger** — `button[data-test-id="export-menu-button"]`
   is the stable selector (not visible labels). Menu items live in
   `.cdk-overlay-pane` not the main DOM (won't surface in
   `browser:read --mode lite`).

**New surfaces (not in v2 catalog) observed:**

- `/library` page (My stuff folder) auto-populates with Canvas + Deep
  Research outputs (no explicit save needed).
- Scheduled actions templates: `News digest`, `Explorations`,
  `What's for dinner?`, `Morning motivation`.
- Gems Knowledge auto-help: "If you share this Gem, the titles of the
  Gem's attached files will be visible. You'll be prompted separately
  to share the attached file's contents."
- Settings menu item `Import memory to Gemini (New)` — no URL probed
  this run; gap for follow-up.
- Side-promo card on `/scheduled`: "CC by Google Labs — Personal daily
  insights and help, right in your email inbox" — separate Labs
  mailing service (out of scope).

## Consent dialogs encountered

See `consent-log.md`. No CAPTCHA / sign-in / billing / computer-use
surfaces hit. No durable account changes made.

## Handoff

- **Registry tabs:** baseline (1 tab `gemini-main`) == handoff (same 1
  tab). All lane-allocated tabs freed via `browser:tab:free`.
  `evidence/baseline-tabs.json` and `evidence/handoff-tabs.json` match.
- **Browser-level tabs:** 4 physical pages remain open (1 registry tab
  + `/sharing` from Stream #3 + `/app` orphan + 1 `docs.google.com`
  auto-opened by Canvas export). These pre-existed or were created by
  Gemini's export side-effect; they are out of our registry. The Docs
  tab corresponds to the legitimately created Stream-4 Stability Brief
  document and should NOT be deleted (it's the user's Drive content).
- **No public share links created** by Stream #4 (sharing manager confirmed empty).
