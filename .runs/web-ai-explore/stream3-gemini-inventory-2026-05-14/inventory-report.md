---
service: gemini
run_date: 2026-05-14
model_used: Fast
chrome_version: Chrome/148.0.7778.167
total_checkpoints: 22
pass_count: 22
not_reachable_count: 0
inconclusive_count: 0
human_handoff_count: 0
upload_pass_count: 5
download_pass_count: 2
agent: claude-opus-subagent
---

## Pre-conditions

- CDP health: `http://127.0.0.1:9225/json/version` returned
  `Chrome/148.0.7778.167`, `Protocol-Version: 1.3`.
- `node dist/src/cli.js browser:status --profile gemini-9225 --json`
  reported `connected: true`, profile dir
  `data/browser-profiles/gemini-9225`.
- Baseline tab set: one tab `gemini-main` →
  `https://gemini.google.com/app/2a8af10cd58b7fbf`. Captured to
  `evidence/baseline-tabs.json`.
- A previously-orphaned tab id `A0-locale` was found in the registry and
  freed before reallocation; no other lane state collisions.
- Locale: forced to English via `?hl=en` URL parameter. Composer placeholder
  `Enter a prompt for Gemini`, nav `New chat / Temporary chat / Settings &
  help`, tool chips all in English. See `locale.md`. **PASSED**.
- Account identifier: `cherrypie85arrow@gmail.com` (display name `Shark 7`).
  Account header carries a `PRO` badge → Google AI Pro subscription. See
  `evidence/user-identifier.txt`.
- Cheap-model policy honoured: selected literal model name **`Fast`** at A2
  (NOT Pro / Thinking / Deep Think / Ultra).

## Part A — 12-checkpoint ladder

| # | id | status | evidence path | one-line observation |
|---|---|---|---|---|
| A0 | locale-enforce | PASS | `A0-locale-enforce/` + `locale.md` | `?hl=en` honoured; composer placeholder `Enter a prompt for Gemini` etc. all English. |
| A1 | header-identify | PASS | `A1-header-identify/user-identifier.txt` | Avatar tooltip `Google Account: Shark 7 (cherrypie85arrow@gmail.com)`, PRO badge visible. |
| A2 | model-selector-cheap | PASS | `A2-model-selector-cheap/` | Picker shows `Gemini 3`-banner with `Fast / Thinking / Pro / Ultra upsell`; selected `Fast`. |
| A3 | new-conversation | PASS | `A3-new-conversation/note.md` | Fresh `/app` opened by tab alloc; composer empty. |
| A4 | send-test-message | PASS | `A4-send-test-message/` | Two-sentence ack received; URL changed to `/app/6790bbb4ecdf234a`. |
| A5 | capture-response | PASS | `A5-capture-response/response.txt` | Reply: `Today is Thursday, May 14, 2026. This message serves as a formal acknowledgement...` |
| A6 | upload-text | PASS | `A6-upload-text/` | `smoke-text.txt` in DOM; one-sentence summary matches fixture content. |
| A7 | upload-csv | PASS | `A7-upload-csv/` | `smoke-data.csv` in DOM; correct answer `Shanghai`. |
| A8 | upload-code | PASS | `A8-upload-code/` | `smoke-code.py` in DOM; correct answer `9` for `add(4,5)`. |
| A9 | upload-image | PASS | `A9-upload-image/` | `smoke-image.png` in DOM; reply: `solid, vibrant red square`. |
| A10 | upload-pdf | PASS | `A10-upload-pdf/` | `smoke-doc.pdf` in DOM; reply quoted title verbatim `Stream #3 Web AI Inventory Test`. |
| A11 | download-code | PASS | `A11-download-code/download/gemini-code.py` (210 B, sha256 `2d12fbc2...`) | Gemini ran code-exec, served Python file via `button[aria-label="Download code"]` after `Show code` expand + hover. `browser:artifact-click` used (viewport 1500x1800). |
| A12 | download-image | PASS | `A12-download-image/download/Gemini_Generated_Image_p05gkwp05gkwp05g.png` (5.34 MiB, 2816x1536, sha256 `3bae95a1...`) | Image generated; `button[aria-label="Download full size image"]` clicked via `browser:artifact-click`. |

## Part B — catalog gap verifications

| # | id | status | catalog_row_id | evidence | one-line observation |
|---|---|---|---|---|---|
| B1 | settings-and-language | PASS | `language-display`, `location-update`, `scheduled-actions-manage` | `B1-settings-tour/` | Settings menu items enumerated verbatim; NO `Language` item — gap-row `language-display` resolved. Footer shows `California, USA From your IP address`. |
| B2 | personal-intelligence | PASS | `personalization-overview`, `memory-toggle`, `personal-intelligence-connect` | `B2-personal-intelligence/` | Page at `/personalization-settings`. Master toggle `Enables or disables the use of personal Gemini context` is `aria-checked="true"` (ON). |
| B3 | instructions-add | PASS | `instructions-add`, `instructions-edit-delete` | `B3-instructions/note.md` | Page at `/saved-info`. Switch `#mat-mdc-slide-toggle-1-button` is `aria-checked="true"` (Saved info ON). `Add` button + empty-state `You haven't asked Gemini to save anything about you yet`. |
| B4 | connected-apps | PASS | `connected-apps-settings`, `personal-intelligence-connect` | `B4-connected-apps/` | Page at `/apps`. 9 switches, 7 OFF / 2 ON. New apps not in v2 catalog: **OpenTable**, **SynthID**, **YouTube Music** (catalog additions). |
| B5 | prompt-bar-tools | PASS | `prompt-bar-tools-community` (gap) | `B5-prompt-bar-tools/note.md` | `Tools` menu: `Create image (New)`, `Create video`, `Canvas`, `Deep research`, `Create music (New)`, `Guided learning`, then `Experimental features → Labs, Personal Intelligence`. Confirms community-reported migration. NO `Visual layout` or `Dynamic view` for this account. |
| B6 | gems-landing | PASS | `gems-create`, `experimental-gems` (gap), `gems-labs-create` (gap), `storybook-create-gem` | `B6-gems/` | URL `/gems/view` (not `/gems`). 8 premade Gems enumerated verbatim; exactly 2 are tagged `Experiment` (`Chess champ`, `Storybook`). NO "My Gems from Labs" section. |
| B7 | share-export | PASS | `share-chat`, `export-docs`, `export-gmail` | `B7-share-export/` | Show-more menu: `Listen, Export to Docs, Draft in Gmail, Report legal issue, Model: 3 Flash`. Sharing manager at `/sharing` (catalog addition). Auto-published link cleaned up via `Delete all links`. |
| B8 | recent-chats-manage | PASS | `recent-chats-manage` | `B8-recent-chats/note.md` | Per-chat hover-revealed `More options` menu: `Share conversation, Pin, Rename, Delete`. Catalog row matches. |
| B9 | my-stuff-folder | PASS | `my-stuff-folder` | `B9-my-stuff/note.md` | URL `/library`. Page header `My stuff`, `Media` tab; thumbnail of A12-generated image visible. |

## Upload sweep summary

| filename | content-type | in-DOM | model-response-captured |
|---|---|---|---|
| smoke-text.txt | text/plain | yes (`Remove file smoke-text.txt` chip) | yes — summary references 50 lines + source tags |
| smoke-data.csv | text/csv | yes | yes — `Shanghai ... 24,870,895` |
| smoke-code.py | text/x-python | yes (`smoke-code PY`) | yes — `add function returns the sum ... returns 9` |
| smoke-image.png | image/png | yes | yes — `solid, vibrant red square` |
| smoke-doc.pdf | application/pdf | yes | yes — `title text ... Stream #3 Web AI Inventory Test` |

Total: **5 / 5 PASS**.

## Download sweep summary

| artifact-id | on-disk path (relative) | size (bytes) | sha256 |
|---|---|---|---|
| A11 Python file | `A11-download-code/download/gemini-code.py` | 210 | `2d12fbc24262a37574045e20165c4d06c87b3c9d358694220f2982c1235bdb5a` |
| A12 generated image | `A12-download-image/download/Gemini_Generated_Image_p05gkwp05gkwp05g.png` | 5,593,901 | `3bae95a18925ca397a61b3bbeb42097a95014b5032318bd047fa586b17a14ab9` |

Total attempted: 2. Total: **2 / 2 PASS**.

## Catalog feedback

PASS-linked catalog rows (already covered above) — no edit needed:
`chat-send-message`, `chat-new-chat`, `model-select-fast`, `file-upload-device`,
`file-download`, `image-generate-nano-banana`, `image-download`,
`recent-chats-manage`, `share-chat`, `export-docs`, `export-gmail`,
`personalization-overview`, `memory-toggle`, `instructions-add`,
`personal-intelligence-connect`, `connected-apps-settings`,
`prompt-bar-tools-community`, `gems-create`, `experimental-gems`,
`storybook-create-gem`, `my-stuff-folder`, `location-update`,
`scheduled-actions-manage`.

NOT REACHABLE flagged (catalog rows verified as gated but the gating is real
for this PRO/personal account):
- `gemini-agent`, `gemini-agent-web-release` — no `Agent` entry in the Tools
  menu or anywhere on `/app`; Ultra-only. Suggested edit: mark `web_ui_path`
  as `Ultra-only / not visible for ai-pro`.
- `gems-labs-create`, `gems-labs-remix` — no `My Gems from Labs` section
  observed on `/gems/view`. Suggested edit: clarify that personal Pro
  accounts may not see Labs gems at all (Opal/region gating dominates).
- `visual-layout-labs`, `dynamic-view-labs` — not present in the Tools menu
  for this account. Suggested edit: keep as gradual/Labs.
- `workspace-*`, `work-school-apps`, `gmail-summarize`, `docs-drive-summarize`,
  `tasks-keep-use`, `calendar-create-edit` — all `Connected Apps` toggles are
  off; even if catalog row says `free`, exercising requires Connect step
  which is account-modifying and out of scope.
- `video-*` rows (Veo) — `Create video` tool entry exists in Tools menu but
  is Pro-gated for actual generation; not exercised per cheap-model policy.

## Selector drift

- **share-chat** — Catalog `web_ui_path` says `Below a response, click Share,
  Share conversation, then copy or distribute the public link`. Observed:
  there is a top-of-conversation `button[aria-label="Share conversation"]`
  that **auto-creates** the public link as soon as the dialog opens; no
  intermediate `Share` button. Plus a per-row `Share conversation` menuitem
  is also available from `More options for <chat title>`.
- **share-chat / my-stuff-folder URL** — Catalog mentions feature names but
  no URLs. Observed URLs:
  - Share manager: `https://gemini.google.com/sharing` (page title
    `Your public links`).
  - My stuff: `https://gemini.google.com/library`.
  - Gems landing: `https://gemini.google.com/gems/view` (`/gems` 404s).
  - Instructions: `https://gemini.google.com/saved-info`.
  - Personal Intelligence: `https://gemini.google.com/personalization-settings`.
  - Connected Apps: `https://gemini.google.com/apps`.
- **file-download** — Catalog says `After Gemini creates a supported file,
  use the download control for local formats.` Actual: Gemini delivers code
  artifacts via a **code-execution sandbox** with a collapsible `Show code`
  panel. The download button is `button[aria-label="Download code"]` inside
  the code block (not next to the artifact pill). Surface requires viewport
  height ≥ ~1500 px and code block expansion before the button becomes
  clickable.
- **model-select-fast** — Catalog says picker offers `Fast`. Observed:
  banner reads `Gemini 3`, picker items are `Fast / Thinking / Pro`
  (sub-labels: `Answers quickly`, `Solves complex problems`,
  `Advanced math and code with 3.1 Pro`), and the post-response menu
  reveals `Model: 3 Flash` — the underlying model identity for `Fast` is
  Gemini 3 Flash.

## Catalog additions

Features observed live that are NOT in `gemini-feature-catalog.md`:

- **Email-opt-in discovery card** — `Stay in the know — Get emails with
  updates from Gemini Apps. ...` Buttons: `Not now`, `Stay updated`. Appears
  on first /app visit after sign-in. (Logged in `consent-log.md` #2.)
- **Quick-pick chips on home composer** — `Boost my day`, `Help me learn`,
  `Write anything`, `Create image`, `Create music`, `Create video`. Each
  pre-selects a Tool.
- **`Experimental features` group label** in Tools menu containing `Labs`
  and `Personal Intelligence` items.
- **Connected Apps additions:** `OpenTable @OpenTable`, `SynthID @SynthID`,
  `YouTube Music @YouTube Music` — not enumerated in v2 catalog.
- **Premade Gems additions:** `Chess champ` (Experiment), `Brainstormer`,
  `Career guide`, `Coding partner`, `Learning coach`, `Productivity planner`,
  `Writing editor` — v2 catalog mentions Gems generically but does not
  enumerate the 8 premade ones.
- **`Your premium content` section** on `/saved-info` — sub-section that
  surfaces paid-subscription content prioritisation: `Gemini prioritizes
  your paid subscriptions to generate better answers for you.`
- **Sharing manager page** at `/sharing` titled `Your public links` with
  `Delete all links` bulk control and `[data-test-id="confirm-button"]`
  modal pattern.
- **Per-chat row More-options menu items** verbatim: `Share conversation`,
  `Pin`, `Rename`, `Delete` (accessible via
  `button[aria-label="More options for <chat title>"]`).
- **Post-response Show-more-options menu items:** `Listen`, `Export to Docs`,
  `Draft in Gmail`, `Report legal issue`, `Model: 3 Flash`.
- **`Search` button in side panel** (`button[aria-label="Search"]`) labeled
  `Search Loading Gems and Recent conversations` — not enumerated.
- **`My Stuff` → `Media` tab** — confirms the My Stuff area has at least
  one tab named `Media` showing generated images.

## Consent dialogs encountered

See `consent-log.md`. Summary:

1. **`Creating content from images and files`** — upload first-use
   disclaimer. Clicked `Agree`.
2. **`Stay in the know`** email-opt-in discovery card. Clicked `Not now`.
3. **`Share conversation`** auto-publish (incident, not a consent dialog).
   Mitigated by `Delete all links` on `/sharing`.

No CAPTCHA, sign-in, billing, or computer-use surface was hit.

## Handoff

Final tab list (`evidence/handoff-tabs.json`) is identical to baseline
(`evidence/baseline-tabs.json`):

- one tab `gemini-main` at `https://gemini.google.com/app/2a8af10cd58b7fbf`.

All allocated lane tabs (A0/A2/A6/A7/A8/A9/A10/A11/A12/B1/B4/B5/B6/B7/B8/B9
and friends) were freed via `browser:tab:free`. No orphan modal, no
in-flight download, no logged-out tab. The public share link auto-created
during B7 was deleted before handoff.

