---
service: chatgpt
run_date: 2026-05-14
phase: stream4-exhaustive
model_used: Thinking (GPT-5.5 Thinking via ?model=gpt-5-thinking URL hint)
chrome_version: Chrome/148.0.7778.167
total_features_attempted: 32
pass_count: 23
not_reachable_count: 4
inconclusive_count: 5
human_handoff_count: 0
generation_artifacts_downloaded: 7
agent: claude-opus-subagent
---

## Pre-conditions

- CDP endpoint `http://127.0.0.1:9223` reachable; `Chrome/148.0.7778.167`
  on `Linux x86_64` (recorded in `evidence/chrome-version.txt`).
- Profile `chatgpt` connected, signed in as `Shark Pro`
  (email `cherrypie85arrow@gmail.com`).
- Baseline tab count = **40** (`evidence/baseline-tabs.json`). All baseline
  entries are pre-existing leases from earlier sessions (none `s4-*`).
- Locale: English UI chrome confirmed in `core/locale-enforce/read.json`
  (`New chat / Search chats / Open profile menu / Settings / ...`). Chinese
  strings in the read are user-created chat & project names (user content,
  not UI chrome). Stream #3 A0 already switched Settings → General →
  Language to `English (US)`; this run did not re-flip.
- CLI env: `WAH_DEFAULT_PROFILE=chatgpt` exported for all `node dist/src/cli.js
  browser:*` calls that don't accept `--profile` (notably `browser:read`,
  `browser:type`, `browser:click`, `browser:press`, `browser:upload`).
  Without this env var, `browser:read` defaults to profile `default` and
  fails on `Failed to create a ProcessSingleton`.

## Group: core

| feature-id | status | evidence | observation |
|---|---|---|---|
| core/locale-enforce | PASS | core/locale-enforce/note.md | English UI chrome confirmed; Stream #3 switch held |
| core/header-identify | PASS | core/header-identify/note.md | Profile button name `Shark Pro, open profile menu`; email `cherrypie85arrow@gmail.com` |
| core/model-select-cheap | PASS | core/model-select-cheap/note.md | Composer shows `Thinking`; cheap-model policy held |
| core/new-chat | PASS | core/new-chat/note.md | Fresh composer at `https://chatgpt.com/`, empty before send |
| core/send-receive | PASS | core/send-receive/note.md, response.txt | Two-sentence ack returned: `Acknowledged: this is the Stream #4 documentation pass. Today is 2026-05-14.` |

## Group: upload

| feature-id | status | evidence | observation |
|---|---|---|---|
| upload/text | PASS | upload/text/note.md, read-q1/q2.json | Q1=topic OK, Q2=`54` matches `wc -l` |
| upload/csv | PASS | upload/csv/note.md, read-q1c/q2.json | Q1=`Shanghai`, Q2=`Beijing, Shanghai, Tokyo, Paris, New York` |
| upload/code | PASS | upload/code/note.md, read-q1/q2.json | Q1=`9`, Q2=`add = lambda a, b: a + b` |
| upload/image | PASS | upload/image/note.md, read-q1/q2.json | Q1=`A solid red square fills the image.`, Q2=`Red` |
| upload/pdf | PASS (Q1) / INCONCLUSIVE (Q2) | upload/pdf/note.md, read-q1..q2e.json | Q1=`Stream #3 Web AI Inventory Test`; Q2 response bubble never produced visible text after 85s+ |
| upload/multifile | PASS | upload/multifile/note.md, read-q1.json | text+csv+image: all 3 answers correct |
| upload/from-drive | NOT-REACHABLE | upload/from-drive/note.md | Fresh OAuth required; doctrine §3 forbids |

## Group: generate

| feature-id | status | evidence | artifact | sha256 | observation |
|---|---|---|---|---|---|
| generate/python | PASS | generate/python/note.md | first_primes.py (513 B) | d5a3d6300698f6f07cb2f543d2e1d31dd5dcb5f9d7eeef8743057fa9bed15cd1 | Valid Python; behavior-chip download |
| generate/markdown | PASS | generate/markdown/note.md | stream4-brief.md (1405 B, 196 w) | bcb70a456db9c93875008cf33ec2f079fdd71696792b0821ebf229c2b0f22300 | ASCII text, valid MD heading |
| generate/csv | PASS | generate/csv/note.md | capitals.csv (193 B) | 2193503546f380b90aa6a6d967b5a40848e759993cc6c50ba7314278b3f97abd | 5 cities, 4 cols, header correct |
| generate/spreadsheet-xlsx | INCONCLUSIVE | generate/xlsx/note.md | -- | -- | Model selector flipped to `Instant`; stuck in `Stop answering` >170 s; no download chip |
| generate/docx | PASS | generate/docx/note.md | stream4-stability.docx (37280 B) | 76d697cdb2d87ac7bcfb6882d0d99b67d44118fdf818ee903e8a8885ce862cd0 | verify:docx-min: paragraphs=4 chars=988 topic matched |
| generate/pdf | PASS | generate/pdf/note.md | stream4-stability.pdf (2298 B) | 65ceb35356d41416576f629a89c8a0b3cf6d8c7a1e0b1c99dfd4a179728cd139 | 1 page; title `Stream #4 stability brief` |
| generate/presentation-pptx | INCONCLUSIVE | generate/pptx/note.md | -- | -- | Inline presentation viewer; `Open in full screen` button click timed out; no direct chip emitted |
| generate/image (dalle-image-regular-chat) | PASS | generate/image/note.md | yellow-circle-blue-bg.png (919409 B) | a5ddd39eeccb244b590c2c65b5eaadd93127dc855e46723f187f2cca42c38426 | 1254×1254 PNG; center pixel yellow, corner blue. **Unblocks Stream #3 A12 INCONCLUSIVE.** |
| generate/svg | PASS | generate/svg/note.md | yellow-circle.svg (253 B) | e87532d614f9d45cd78e5742fa7e792bb2512e9c43c26049fd82a11a91680b42 | Valid SVG with rect+circle |
| generate/canvas-text | INCONCLUSIVE | generate/canvas-text/note.md | -- | -- | Canvas surface opened + text rendered; download trigger is a dropdown menu; single click timed out |
| generate/data-analyst-chart | INCONCLUSIVE | generate/data-analyst-chart/note.md | -- | -- | Chart rendered with `Done: Download populations-bar.png`; download lives in a Save/Share dialog (not behavior-chip) — `ARTIFACT_DOWNLOAD_TIMEOUT` from `browser:artifact-click` |
| generate/python-file-runner | PASS | generate/python-file-runner/note.md | -- | -- | Inline interpreter run; text result `4950` correct; **no file artifact** by design (different from generate/python) |
| generate/voice-mode-entry | PASS | generate/voice-mode-entry/note.md | -- | -- | Composer `Start Voice` button observed; not clicked (audio out of scope) |

**Generation downloads: 7 artifacts on disk, total ~960 KB.**
- 6 generation rows attempted ≥ doctrine min (we did 13).

## Group: settings (read-only)

| tab | status | evidence | key observations |
|---|---|---|---|
| settings/General | PASS | settings/general.md, general.json | Language=`English (US)`, Accent=Green, Voice=Vale, Spoken=Auto-detect |
| settings/Personalization | PASS | settings/personalization.md | 4 Characteristics toggles (Warm/Enthusiastic/Headers/Emoji all `Default`); Fast answers switch; Memory+Pulse+Record-mode toggles; Occupation `Engineering student at University of Waterloo` |
| settings/Apps | PASS | settings/apps.json | `Connectors are now called Apps`; only `GitHub Advanced settings` shown |
| settings/Schedules | PASS | settings/schedules.json | `Manage` button; ChatGPT can be scheduled to re-run after a task |
| settings/Billing | NOT-REACHABLE (skipped) | -- | Doctrine §3 forbid |
| settings/Data controls | PASS | settings/data-controls.json | `Improve the model for everyone` Off, `Location` Off, `Remote browser data` On, Shared links Manage, Archived chats Manage, Archive all, Delete all, Export data |
| settings/Storage | PASS | settings/storage.json | `5.78 MB of 100 GB used`; Files=`3.92 MB • 28 files`; Images=`1.86 MB • 17 images` |
| settings/Security | PASS | settings/security.json | Password Add, Security keys, MFA (Authenticator/Text), Trusted Devices, Advanced security Enroll, Log out single+all, Codex CLI Disconnect |
| settings/Parental controls | PASS | settings/parental-controls.json | `Add family member`; existing teen-link safeguards copy |
| settings/Notifications | PASS | settings/notifications.json | Codex Push, Group chats Push, Projects Email, Pulse daily updates Push, Recommendations Push+Email |
| settings/Account | PASS | settings/account.json | Name=`Shark`, Email=`cherrypie85arrow@gmail.com`, GPT builder profile, LinkedIn+GitHub links, Receive feedback emails |

## Group: tools

| feature-id | status | evidence | observation |
|---|---|---|---|
| tools/composer-bar | PASS | tools/composer-bar.md | `Add photos & files / Recent files / Create image / Deep research / Web search / More / Projects`; More submenu = `Agent mode / Add sources / Canvas / GitHub / OpenAI Platform` |
| tools/gpts-landing | PASS | tools/gpts-landing.json | ≥9 visible GPT names: Scholar GPT, DALL·E, Data Analyst, Consensus, Canva, Expedia, Video AI by invideo, Monday, Hot Mods, Fitness PhD, Creative Writing |
| tools/custom-gpt-invoke (Scholar GPT) | PASS | tools/custom-gpt-invoke/note.md | Direct URL `/g/g-kZ0eYXlJe-scholar-gpt` works; sent prompt; reply: `I help with scholarly research, literature discovery, ...` |
| tools/projects-create-empty | NOT-REACHABLE | tools/projects-create-empty/note.md | Per lane spec — 4 user projects already exist; durable settings change avoided |

## Group: share

| feature-id | status | evidence | observation |
|---|---|---|---|
| share/menu | PASS | share/menu/note.md | Dialog opens via `button[data-testid='share-chat-button']`. Options: `Copy link / X / LinkedIn / Reddit` only |
| share/export-conversation-markdown | NOT-REACHABLE | share/data-export.md | No private export inside Share dialog; only Settings → Data controls → `Export data` (account-wide email-based export) |
| share/copy-link | NOT clicked | share/menu/note.md | Per doctrine §3 "No public publishing"; enumerated only |

## Group: meta

| feature-id | status | evidence | observation |
|---|---|---|---|
| meta/baseline-tabs | PASS | evidence/baseline-tabs.json | 40 pre-existing leases |
| meta/locale | PASS | core/locale-enforce/note.md | English UI chrome; Chinese only in user-created chat titles |
| meta/handoff-tabs | PASS | evidence/handoff-tabs.json | 40 tabs at handoff; 0 `s4-*` leaks |
| meta/pulse-content-view | NOT-REACHABLE | meta/pulse-content-view/note.md | Pulse onboarding overlay shown; not enabled on this account |

## MCP automation candidates

Single-call automation paths suitable for MCP tools:

### 1. `webai.chatgpt.send_prompt`
- Input: `{ prompt: string, model?: "Thinking"|"Instant"|"Auto", profile: string, conversationId?: string }`
- Output: `{ conversationId, responseText, finishReason: "complete"|"thinking_only"|"stop_answering_stall", elapsedMs }`
- Error codes: `INVALID_ARGS`, `COMPOSER_NOT_FOUND`, `MODEL_SELECT_FAILED`, `RESPONSE_TIMEOUT`, `SENSITIVE_GUARD_BLOCKED`.
- Stability: selector `#prompt-textarea` is stable across Stream #3 and Stream #4 runs; send via Enter or `[data-testid=send-button]`. Sensitivity-guard requires `--confirmed true` when prompt contains `Send`/`profile`/`download`-like substrings.

### 2. `webai.chatgpt.upload_and_query`
- Input: `{ files: string[], prompt: string, profile: string }`
- Output: `{ conversationId, attachmentNames: string[], responseText }`
- Error codes: `INVALID_ARGS`, `UPLOAD_SELECTOR_NOT_FOUND`, `ATTACHMENT_RENDER_TIMEOUT`, `RESPONSE_TIMEOUT`.
- Stability: `input#upload-files` accepts multiple sequential calls for the multi-file flow. The post-upload composer no longer accepts Enter-key send while attachments are processing; use the explicit `[data-testid=send-button]` click.

### 3. `webai.chatgpt.download_artifact_chip`
- Input: `{ conversationUrlContains: string, expectedFilename?: string, downloadDir: string, profile: string }`
- Output: `{ path, sha256, size, suggestedFilename, downloadGuid, elapsedMs }`
- Error codes: `ARTIFACT_DOWNLOAD_TIMEOUT`, `ELEMENT_NOT_FOUND`, `IFRAME_NOT_FOUND`.
- Stability: `button.behavior-btn` matches the post-Stream-#3 Coding-Citation chip on ChatGPT for py/md/csv/docx/pdf/svg. Does NOT match: image-viewer Save, canvas dropdown trigger, presentation viewer, Data Analyst chart Save-dialog (those need separate selectors).

### 4. `webai.chatgpt.save_image_via_viewer`
- Input: `{ conversationUrlContains: string, downloadDir: string, profile: string }`
- Output: same as #3.
- Stability: required after generate-image. Sequence is `click img → click button[aria-label='Save']` inside fullscreen viewer. `browser:artifact-click --button-selector "button[aria-label='Save']"` works after the image is already in the viewer; the open-viewer click is a separate step that has to happen first. Filenames look like `ChatGPT Image <date>.png`.

### 5. `webai.chatgpt.list_custom_gpts`
- Input: `{ profile: string, category?: string }`
- Output: `{ entries: [{ name, description, byline, urlSlug }], totalSeen }`
- Stability: `/gpts` route exposes Featured/Trending/By-ChatGPT tabs; gizmo-link cards are `a.gizmo-link` (multiple — disambiguate by name).

### 6. `webai.chatgpt.invoke_custom_gpt`
- Input: `{ gptId: string, gptSlug: string, prompt: string, profile: string }`
- Output: same as `send_prompt` plus `customGptName`.
- Stability: URL pattern `/g/<id>-<slug>` is deterministic; once landed, the composer is the same `#prompt-textarea`.

### 7. `webai.chatgpt.read_settings_tab`
- Input: `{ tab: "General"|"Personalization"|"Apps"|"Schedules"|"Data controls"|"Storage"|"Security"|"Parental controls"|"Notifications"|"Account", profile: string }`
- Output: `{ widgets: [{ kind: "select"|"switch"|"button", label, currentState? }] }`
- Stability: `button:has-text('<tab name>')` reliably opens the Settings dialog tab. State for role=switch widgets is unreliable in lite reads — Stream #3 already flagged this.

## MCP non-candidates (worked but not yet stable)

1. **`generate/spreadsheet-xlsx`** — model selector flips to Instant automatically when no explicit URL hint; Instant can't write XLSX. Requires Thinking + tool-pin which is fragile.
2. **`generate/presentation-pptx`** — inline presentation viewer with `Open in full screen mode` button intercepted by overlay; export pathway not single-call.
3. **`generate/canvas-text` export** — dropdown menu, not a direct chip; needs `browser:artifact-click --follow-up-selector` pattern. The single-call `button[aria-label='Download']` click was intercepted.
4. **`generate/data-analyst-chart` export** — dialog with duplicate `Download <name>.png` buttons; the chip click opens the dialog (not download). Direct file capture requires clicking inside the dialog or using the right-click → save-image flow.
5. **`upload/from-drive`** — fresh OAuth required.
6. **`pulse-content-view`** — only available after Pulse is enabled via onboarding (durable settings change).

## Catalog feedback (drift / additions)

### Drift confirmed from Stream #3
- `model-selector-cheap`: Radix `#radix-_r_*_` ids are dynamic; match by accessible name `Thinking`. (Confirmed again.)
- `settings-custom-instructions`: still inline on Personalization tab (not modal).
- `settings-improve-model-toggle`: button-opens-modal `button[data-testid="improve-model-open-modal-button"]`. (Confirmed.)
- `image-generation`: temp-chat blocked; **regular-chat download path resolved here** — sequence `img → fullscreen → button[aria-label='Save']`.
- Locale-drift: this run's English-locale account read no Chinese in static chrome (Stream #3 had `精选推荐` Chinese in `/gpts`; this run shows clean English category labels — possibly fixed since Stream #3).

### New additions discovered in this run
1. `share-menu-social` — Share dialog options are `Copy link / X / LinkedIn / Reddit` only; no private text-export. Public-publishing classed.
2. `presentation-inline-viewer` — Slidemaker / PPTX surface uses an embedded presentation viewer with `Open presentation in full screen mode`; this is the host for PPTX export (not a chip).
3. `code-charts-export-dialog` — Data Analyst chart artifact uses a `role=dialog` with duplicate `Download <filename>.png` buttons + `Save / Share`; PNG capture requires dialog click, not behavior-chip.
4. `canvas-download-dropdown` — Canvas surface's Download is a dropdown menu trigger; the format menuitems (Markdown/PDF/Docx) live inside.
5. `account-tab` row — Settings → Account exposes `Name`, `Email`, `Delete account`, `GPT builder profile`, social links — useful for `header-identify` strong-form.

## Consent dialogs encountered

- Sensitivity guard prompted on every `browser:type` / `browser:click` that contained `Send`, `Profile`, `download`, etc. Resolved by passing `--confirmed true` (sanctioned per task spec).
- `Study Mode` promotion modal appeared mid-`upload/code` flow; dismissed via `button[aria-label='Close']` (non-durable).
- No consent dialogs from upload/share were clicked. No `Continue` / `Agree` / `Allow` clicks on durable-state dialogs.

## Handoff

- Baseline tab count: **40**
- Handoff tab count: **40**
- `s4-*` leaks: **0**
- All `s4-*` tabs (`s4-locale`, `s4-newchat`, `s4-up-text`, `s4-up-csv`,
  `s4-up-code`, `s4-up-img`, `s4-up-pdf`, `s4-up-multi`, `s4-g-py`,
  `s4-g-md`, `s4-g-csv`, `s4-g-xlsx`, `s4-g-docx`, `s4-g-pdf`, `s4-g-pptx`,
  `s4-g-img`, `s4-g-chart`, `s4-g-pyrun`, `s4-g-canvas`, `s4-g-svg`,
  `s4-set`, `s4-tools`, `s4-gpts`, `s4-scholar`, `s4-pulse`) were freed via
  `browser:tab:free` and confirmed gone in `evidence/handoff-tabs.json`.
- No in-flight download at handoff. Chrome version unchanged
  (`Chrome/148.0.7778.167`).
- Profile `chatgpt` still signed in as `Shark Pro`.

Evidence: `evidence/baseline-tabs.json`, `evidence/handoff-tabs.json`,
`evidence/user-identifier.txt`, `evidence/chrome-version.txt`.
