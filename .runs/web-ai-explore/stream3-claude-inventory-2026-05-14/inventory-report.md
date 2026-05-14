---
service: claude
run_date: 2026-05-14
model_used: Sonnet 4.6 Adaptive
chrome_version: Chrome/148.0.7778.167
total_checkpoints: 21
pass_count: 19
not_reachable_count: 0
inconclusive_count: 1
human_handoff_count: 0
upload_pass_count: 5
download_pass_count: 4
agent: claude-opus-subagent
---

## Pre-conditions

- CDP port 9224: live, `Chrome/148.0.7778.167`.
- Profile `claude-9224`: connected, 2 pre-existing tabs (one
  `/chat/b335d561...` + one `/new`).
- One pre-existing allocated tab in the project registry: `stream3-claude`.
- CLI build: `dist/src/cli.js` present and operational.
- Test fixtures: all 5 present under `data/test-fixtures/`.
- Locale: UI chrome is English; no language switch executed (see
  `locale.md`).
- Account: `qYgwillardboothiist5@lobbyist.com` (Max plan); see
  `evidence/user-identifier.txt`.

## Part A — 12-checkpoint ladder

| id | status | evidence path | one-line observation |
|----|--------|--------------|----------------------|
| A0 | PASS | `A0-locale-enforce/` | UI chrome already English on `claude.ai/new`; no switch needed. |
| A1 | PASS | `A1-header-identify/` | Avatar button `#_r_10_` opened dropdown showing literal email `qYgwillardboothiist5@lobbyist.com`. |
| A2 | PASS | `A2-model-selector-cheap/` | Composer reflects `Sonnet 4.6 Adaptive` (pre-existing); model menu enumerated Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / Adaptive thinking / More models. |
| A3 | PASS | `A3-new-conversation/` | `claude.ai/new` rendered empty composer with `Write your prompt to Claude` placeholder. |
| A4 | PASS | `A4-send-test-message/` | Prompt sent; URL transitioned to `claude.ai/chat/712ef6ea-...`; status "Claude finished the response" observed. |
| A5 | PASS | `A5-capture-response/response.txt` | `Today is Thursday, May 14, 2026. Acknowledged!` (46 bytes). |
| A6 | PASS | `A6-upload-text/` | `smoke-text.txt` uploaded via `#chat-input-file-upload-onpage`; DOM chip `smoke-text.txt 55 lines TXT`; response correctly references lorem-ipsum fixture content. |
| A7 | PASS | `A7-upload-csv/` | `smoke-data.csv` uploaded; chip `smoke-data.csv CSV`; response: "Shanghai has the largest population at 24,870,895". |
| A8 | PASS | `A8-upload-code/` | `smoke-code.py` uploaded; chip `smoke-code.py 10 lines PY`; response: "The add function returns 9 for inputs 4 and 5." |
| A9 | PASS | `A9-upload-image/` | `smoke-image.png` uploaded (filename NOT in DOM for image chips — catalog observation); response: "The image is a plain, solid red rectangle…". |
| A10 | PASS | `A10-upload-pdf/` | `smoke-doc.pdf` uploaded (filename NOT in DOM; only "PDF" type token visible); response: title is "Stream #3 Web AI Inventory Test". |
| A11 | PASS | `A11-download-code/download/` | `hello_world.py` (23 B; sha `07219cd9...`) downloaded via `browser:artifact-click` against `button[aria-label="Download Hello world"]` with `--url` pinning the chat URL. |
| A12 | PASS | `A12-download-image/download/` | `red_square.svg` (178 B; sha `98048397...`) downloaded after asking Claude to regenerate the SVG as a downloadable code-file artifact; MCP-app inline-SVG render does NOT expose a direct download. |

## Part B — catalog gap verifications

| id | status | evidence path | catalog_row_id | one-line observation |
|----|--------|--------------|----------------|----------------------|
| B1 | PASS | `B1-settings-language/` | `language-preference` | Avatar dropdown → Language opened submenu with 11 locale options; current `English (United States)`. |
| B2 | PASS (toggles enumerated) | `B2-capabilities-toggles/` | `artifacts-enable-disable`, `file-creation-toggle`, `analysis-tool-toggle`, `past-chat-search-toggle`, `memory-summary` | `Settings → Capabilities` enumerates 10 controls (toggles, dropdowns, button); per-toggle aria-checked not exposed but `Code execution and file creation` and `Artifacts` are effectively ON (verified by A11/A12 behavior). |
| B3 | INCONCLUSIVE | `B3-connectors-page/` | `integrations-setup`, `prebuilt-web-connectors`, `custom-connector-add` | `/settings/connectors` returned error toast "This isn't working right now. You can try again later." across two reads (3s apart). |
| B4 | PASS | `B4-skills-overview/` | `skills-overview`, `skills-enable-disable` | `Customize → Skills` page reachable; one personal skill `skill-creator` installed with file tree, Enable-skill toggle, Add-skill button. |
| B5 | PASS | `B5-file-create-spreadsheet/download/` | `file-create-spreadsheet` | XLSX `city_populations.xlsx` (5165 B, sha `9fbf7467...`) downloaded; valid OOXML structure verified. Two Download buttons exist; only the icon-only header `button[aria-label="Download"]` triggers a real download — the in-message `button[aria-label="Download City populations"]` timed out with `ARTIFACT_DOWNLOAD_TIMEOUT`. |
| B6 | PASS | `B6-file-create-docx/download/` | `file-create-document-pdf` | DOCX `stream_test_doc.docx` (8559 B, sha `fda49a13...`) downloaded; `verify:docx-min` reports 2 paragraphs, 44 chars; same dual-button pattern as B5. |
| B7 | PASS | `B7-share-menu/` | `shared-chats-manage` | In-chat Share modal enumerated: `Keep private` / `Create public link` radio + `Create share link` / `Close` buttons. No share link created (forbidden). |
| B8 | PASS | `B8-privacy-data-controls/` | `shared-chats-manage` + data controls | `/settings/privacy` → `/settings/data-privacy-controls` enumerates Location-metadata toggle, Help-improve-Claude toggle, Export-data button, Shared-chats Manage button, Memory-preferences Manage. |

## Upload sweep summary

| filename | content-type | in-DOM filename? | model response captured? |
|----------|-------------|------------------|---------------------------|
| `smoke-text.txt` | text | YES (`smoke-text.txt 55 lines TXT`) | YES (`A6/response.txt`) |
| `smoke-data.csv` | CSV | YES (`smoke-data.csv CSV`) | YES (`A7/response.txt`) |
| `smoke-code.py` | python | YES (`smoke-code.py 10 lines PY`) | YES (`A8/response.txt`) |
| `smoke-image.png` | image | NO (image chip; no filename in DOM) | YES (`A9/response.txt`) |
| `smoke-doc.pdf` | PDF | NO (`PDF` type token only, no filename) | YES (`A10/response.txt`) |

Total: **5 / 5 fixtures successfully uploaded and queried**, with the
above filename-in-DOM caveats for image and PDF chips.

## Download sweep summary

| artifact-id | on-disk path | size | sha256 |
|-------------|--------------|------|--------|
| A11 hello_world.py | `A11-download-code/download/66e8a30f-9ca1-45ce-adb5-d59865132629` | 23 | `07219cd9561b41ce1f39209958076c471b17855679c968b42767b0122423c782` |
| A12 red_square.svg | `A12-download-image/download/8ed19575-a8c9-46fe-a9ac-3f019b5f025e` | 178 | `980483977d0559dbf00fac86c34cb776eb368130727cb1cd4bd5879aa95246c2` |
| B5 city_populations.xlsx | `B5-file-create-spreadsheet/download/47f875fa-8e29-429e-ada4-e6828e086272` | 5165 | `9fbf7467a4000731e699aaf2fcf9d743343ccb63ec785bd01cb2ad760ac9d49f` |
| B6 stream_test_doc.docx | `B6-file-create-docx/download/e161d05a-6460-4f84-a856-e928c4d76e3a` | 8559 | `fda49a1324514bae64064cfee795911a73c09c39d73580c75e6c3a04aa42d25b` |

Total: **4 / 4 download attempts succeeded** (Python, SVG, XLSX, DOCX).
No PDF download attempted in this run — covered by the same file-creation
machinery as XLSX/DOCX per Settings → Capabilities label.

## Catalog feedback

PASS rows confirm these catalog rows on the live Max-plan account:
- `language-preference` → B1 (note: surfaced via avatar dropdown, not a
  `/settings/language` sidebar tab).
- `skills-overview`, `skills-enable-disable` → B4.
- `file-create-spreadsheet` → B5.
- `file-create-document-pdf` (DOCX branch) → B6.
- `file-creation-toggle` → B2 + verified-ON behavior in A11/B5/B6.
- `artifacts-enable-disable` → B2 + verified-ON behavior in A11/A12 (note:
  split into 3 toggles, see Selector drift).

Suggested catalog edits for INCONCLUSIVE / NOT-REACHABLE:
- `integrations-setup`, `prebuilt-web-connectors`, `custom-connector-add`:
  `/settings/connectors` returned a non-empty error toast for this
  account at 2026-05-14 07:33-07:34. Add a note about service-side flakiness
  before re-attempting enumeration.

## Selector drift

| catalog row | catalog `web_ui_path` (paraphrased) | observed UI text |
|-------------|--------------------------------------|------------------|
| `language-preference` | Settings → Language section | NO `Language` section in `/settings/general` or `/settings/account`. Avatar dropdown contains a `Language` submenu inline (no separate Settings page on this account). |
| `artifacts-enable-disable` | One toggle: `Artifacts` | THREE distinct toggles in `Settings → Capabilities → Visuals`: `Artifacts`, `AI-powered artifacts`, `Inline visualizations`. |
| `analysis-tool-toggle` | A separate Analysis-tool toggle | Not a separate row. Folded into `Code execution and file creation` toggle, subtitle reads "Claude can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports. Required for skills." |
| `file-creation-toggle` | "file creation" toggle | Single combined toggle labeled `Code execution and file creation` (catalog label is a paraphrase, not the literal UI text). |
| `file-download-created` | Single download button mapped per artifact | TWO download buttons per file-creation artifact: in-message `button[aria-label="Download <name>"]` and panel-header `button[aria-label="Download"]`. Only the **panel-header icon button** issues a real `Browser.downloadWillBegin` event on this account (B5 XLSX confirmed in-message button times out; B6 DOCX confirmed icon button works). |
| `shared-chats-manage` | One Settings modal | TWO surfaces: in-chat `Share` button → `Share chat` modal (create/keep-private), and `Settings → Privacy → Shared chats → Manage` (revocation surface, not exercised). |

## Catalog additions

Features observed that aren't surfaced in the Stream #2 Claude catalog:

1. **`Tool access mode` dropdown** in Settings → Capabilities (default
   value: `Load tools when needed`, state shown as `on`). Catalog
   currently has no row for this.
2. **`Allow network egress`** toggle in Settings → Capabilities. Subtitle:
   "Give Claude network access to install packages and libraries in order
   to perform advanced data analysis, custom visualizations, and
   specialized file processing. Monitor chats closely as this comes with
   security risks." Catalog has no row for this.
3. **`Connector discovery`** toggle in Settings → Capabilities. Subtitle:
   "Let Claude surface connectors from the directory that may be relevant
   to your conversation." Distinct from any of the existing `connector-*`
   rows.
4. **`Claude Code` and `Claude in Chrome Beta`** appear as first-class
   sidebar tabs in `/settings`. The Claude Code product is referenced in
   the catalog only at `chrome-extension-research-preview`; the
   `Claude Code` Settings tab itself is not catalogued.
5. **`Location metadata` toggle** in Settings → Privacy.
6. **`Help improve Claude` toggle** in Settings → Privacy (training-opt-in).
7. **`Export data` button** in Settings → Privacy (data-export endpoint
   exposed, not catalogued).
8. **`/customize/skills`** route hosts the per-skill `Enable skill` toggle
   and the `Add skill` action. Catalog row `skills-overview` references
   `Customize → Skills` but doesn't list the `Add skill` affordance.
9. **MCP-app rendered SVG artifacts** appear inline in an
   `iframe[title="visualize: <name>"]` from
   `*.claudemcpcontent.com/mcp_apps?...`. This rendering path has NO
   in-message Download button; only re-prompting Claude to produce the
   SVG as a code-file artifact surfaces a working download. Add to
   `artifacts-mcp-storage-update` gap row.
10. **CLI confirmation-policy interactions** (out-of-catalog meta-note):
    several Claude UI string-classes (anything containing
    "downloadable", or the literal "Share" button label) trip the
    project's local `assertActionPermitted` and require `--confirmed` on
    `browser:type` / `browser:click`. Not a Claude feature, but a
    catalog-row consumer needs to know this exists when scripting the
    upload/download/share flows.

## Consent dialogs encountered

See `consent-log.md`. **No Claude UI consent modals appeared during this
run.** The CLI's confirmation policy did require `--confirmed` for
several actions (upload, type-containing-"downloadable", click-on-Share);
those are CLI-side, not Claude-side.

## Handoff

Final `browser:tab:list --profile claude-9224` shows the same single
allocated tab (`stream3-claude` on `chat/b335d561-...`) that was present
at run start. The unchanged pre-existing `/new` tab (un-allocated, owned
by the user session) is also still present. No orphan tabs allocated by
this run remain. No in-flight downloads. No logged-out tab.

Evidence: `evidence/handoff-tabs.json` (CLI registry view),
`evidence/baseline-pages.json` (start-of-run CDP `/json` snapshot).

## Anything that needs human flag

1. **`/settings/connectors` is broken for this Max-plan account at
   2026-05-14 07:33 local.** Error toast "This isn't working right now.
   You can try again later." persisted across reads. Catalog rows
   `integrations-setup`, `prebuilt-web-connectors`, `custom-connector-add`
   cannot be verified until this is resolved (server-side?).
2. **File-creation in-message Download button does not work on this
   account.** XLSX/DOCX downloads succeed only via the icon-only
   `button[aria-label="Download"]` in the artifact panel header (32×32 px
   at x≈1160, y≈10). The visible button `Download <artifact-name>`
   times out with `ARTIFACT_DOWNLOAD_TIMEOUT`. This is a real consumer
   contract concern — if the catalog's `file-download-created` selector
   targets the in-message button, every file-creation download will
   fail until the catalog selector is corrected.
3. **Image generation appears to flow through an MCP-app SVG render path
   that does not surface a direct download button.** This is consistent
   with `artifacts-mcp-storage-update` being incompletely verified in
   Stream #2. Catalog should note: for SVG-only artifacts, ask the
   model explicitly to "Save that SVG as a downloadable .svg file" to
   force a code-file artifact with a working download button.
