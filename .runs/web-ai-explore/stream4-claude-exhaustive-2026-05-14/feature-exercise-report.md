---
service: claude
run_date: 2026-05-14
phase: stream4-exhaustive
model_used: Sonnet 4.6 Adaptive
chrome_version: Chrome/148.0.7778.167
total_features_attempted: 37
pass_count: 27
not_reachable_count: 6
inconclusive_count: 4
human_handoff_count: 0
generation_artifacts_downloaded: 12
agent: claude-opus-subagent
---

## Pre-conditions

| check | result |
|---|---|
| CDP `/json/version` | Chrome/148.0.7778.167, Protocol 1.3 |
| Profile | claude-9224 |
| Baseline tab | `stream3-claude` → `https://claude.ai/chat/b335d561...` (1 tab) |
| Locale | English confirmed at `/new` — labels "Write your prompt to Claude", "Home", "Search", "Chats", "Projects" all English |
| Account | Max plan, email `qYgwillardboothiist5@lobbyist.com`, initials "Bb", Org `9a23efa1-be5a-4da2-8039-74492ab9877e` |
| Cheap model | Sonnet 4.6 Adaptive — no model flip required |

---

## Section: core

| feature-id | status | evidence path | observation |
|---|---|---|---|
| `core/locale-enforce` | PASS | `core/locale-enforce/note.md` | UI fully English at `/new`; no language switch needed; timestamp 2026-05-14T15:59:58Z |
| `core/header-identify` | PASS | `core/header-identify/note.md` | Avatar initials "Bb", plan badge "Max plan"; email cross-referenced from Stream #3 A1 evidence |
| `core/model-select-cheap` | PASS | `core/model-select-cheap/note.md` | Composer reads "Model: Sonnet 4.6 Adaptive"; policy satisfied without any flip |
| `core/new-chat` | PASS | `core/new-chat/note.md` | Navigated to `https://claude.ai/new`; composer placeholder present; no in-flight response |
| `core/send-receive` | PASS | `core/send-receive/note.md` | Prompt sent; URL became `/chat/7a0c74f7-…`; response captured (152 chars, two sentences) in `response.txt` |

---

## Section: upload

| feature-id | status | evidence path | observation |
|---|---|---|---|
| `upload/multifile` | PASS | `upload/multifile/note.md` | Three files (smoke-text.txt, smoke-data.csv, smoke-image.png) uploaded simultaneously via `#chat-input-file-upload-onpage`; Claude correctly identified content type and one fact for each; response in `response.txt` |
| `upload/from-drive` | NOT-REACHABLE | `upload/from-drive/note.md` | No Drive/GDocs file-picker in Claude UI for this account; `/customize/connectors` shows only GitHub Integration (Not connected); OAuth flow for new connectors forbidden per doctrine §3 bullet 6 |

Note: `upload/text`, `upload/csv`, `upload/code`, `upload/image`, `upload/pdf` were covered in the Stream #3 A3–A7 baseline. The multifile run above exercises the combined form.

---

## Group: generate

Artifact download path root: `generate/<id>/download/`

| feature-id | status | evidence path | artifact | size (bytes) | sha256 | observation |
|---|---|---|---|---|---|---|
| generate/python | PASS | `generate/python/note.md` | `53a6d7e0-…` (first_10_primes.py) | 661 | `6264aa2a3cf0747a1647136a11d84eee740c4c3a37e88611142d069f8cff9de8` | In-message Download button worked for code-class `.py` artifact |
| generate/markdown | PASS | `generate/markdown/note.md` | `stream4_briefing.md` | 1384 | `e5075045104e6f093b0000013bc9c119a822f82bed2a2769b548e950d61b4872` | In-message Download TIMED OUT; working path: artifact-panel Copy-chevron (`#radix-_r_8q_`) → menuitem "Download as .md"; file routes to `~/Downloads` (system default), moved manually |
| generate/csv | PASS | `generate/csv/note.md` | `36ddc4c2-…` (world_capitals.csv) | 172 | `6ab24184fd056812b43b0b6bd4411b8533c86d72bf36aaf4935f5da8e844ad08` | In-message Download button `button[aria-label="Download World capitals"]` worked (code-class artifact) |
| generate/spreadsheet-xlsx | PASS | `generate/spreadsheet-xlsx/note.md` | `02bcbf13-…` (world_capitals.xlsx) | 5340 | `4d74e2ec7a9d4bb127f1edd05fe77be94d36982fb09e62db9c1406e3ccf8028b` | File-creation XLSX; panel-header icon Download `button[aria-label="Download"]` at bbox (1160,10,32,32) |
| generate/docx | PASS | `generate/docx/note.md` | `14779a37-…` (Stream4_Stability_Brief.docx) | 10226 | `9ced54422c9bd3c18e6df652b4b56c615566525765d7f266b459996e4e32e634` | File-creation DOCX via panel-header icon; verify: paragraphs=9, chars=2705 |
| generate/pdf | PASS | `generate/pdf/note.md` | `c249fdbd-…` (stream4_stability_brief.pdf) | 3029 | `044e604d440d48a59b075a8b1bc81bff97120af0ae134be235feea71291188b8` | PDF 1.4, 1 page; file-creation tool (reportlab); panel-header icon Download |
| generate/presentation-pptx | PASS | `generate/presentation-pptx/note.md` | `55b9e08a-…` (stream4_stability_brief.pptx) | 67708 | `4d8f3bd80c384aca8ace7a883e157997046d9917fd700c16c0f57364642892f9` | Zip/OOXML valid PPTX; file-creation (python-pptx inferred); panel-header icon Download |
| generate/image | PASS | `generate/image/note.md` | `99223851-…` (circle.png) | 1194 | `4678d6a84299ceabcd02b7fad8cde4d67960bd730f83991d628e91a6e7b7f589` | PNG 200×200, RGB; PIL-based file-creation; prompt "downloadable .png file artifact" produced clean result; panel-header icon Download |
| generate/svg | PASS | `generate/svg/note.md` | `67c61b58-…` (circle_on_square.svg) | 171 | `2dc9bf25c0b07464c14322d27c1d294bec77fbc10f4ac0196ec5975ddb95cc35` | Code-class `.svg`; in-message Download `button[aria-label="Download Circle on square"]` worked; prompt phrase ".svg code-file artifact" coerced code-file mode |
| generate/artifact-html | PASS | `generate/artifact-html/note.md` | `dark-mode-toggle.html` | 7712 | `cf3d46d592408cb24642e904f320efc4dc4067a02b8339abaf528fe6afa843fc` | HTML5 standalone artifact rendered in preview pane; Download via panel-chevron "Download as .html"; transient network-error toast required Escape×3 before re-acquiring selectors |
| generate/artifact-react | PASS | `generate/artifact-react/note.md` | `1c44bd7c-…` (counter.jsx) | 3248 | `4d246d56fa1cf621fa52ef807e6a83014f830846c5bfc33c169212bf0bf84186` | React counter with useState; Preview pane live (button data-state="on"); Download via in-message button (code-class); Preview/Code radio toggle confirmed |
| generate/artifact-diagram | PASS | `generate/artifact-diagram/note.md` | `d7096f9c-…` (three_ai_orchestration.mmd) | 922 | `459cee3a5ed247a8bdcb3099c7d8f86a096c3d1de059e08bd4ed129772742436` | Mermaid sequenceDiagram; in-message Download worked (code-class); artifact panel renders embedded Mermaid Live Editor preview iframe (new catalog surface) |
| generate/canvas | INCONCLUSIVE | `generate/canvas/note.md` | — | — | — | `/design` is a Figma-style Design sub-app, not a Canvas/artifact editor; Create button not clicked (0% Design usage on plan; artifact format unknown); flagged for focused follow-up run |
| generate/deep-research | INCONCLUSIVE | `generate/deep-research/read-view.json` | — | — | — | Research mode triggered via composer "+" → "Research"; completed in 44s with 30 sources ("Research complete • Writing and citing report... 30 sources • 44s"); download/ dir empty — export path not captured before run terminated; report text visible in DOM but no note.md written |
| generate/projects-with-knowledge | PASS | `generate/projects-with-knowledge/note.md` | — | — | — | Project `stream4-claude-test` created; text-content knowledge fixture "pineapple-octopus-glacier" added via "Add text content" modal; fresh project chat returned exact marker phrase |
| generate/computer-use-entry | PASS (entry only) | `generate/computer-use-entry/note.md` | — | — | — | Entry surface at `/settings/browser-extension` observed ("Claude in Chrome settings", Site-permissions dropdown); no autonomous task triggered per doctrine |
| generate/skills-image-or-pdf | NOT-REACHABLE | `generate/skills-image-or-pdf/note.md` | — | — | — | Only `skill-creator` installed on this account; no image/PDF generation skill present; "Add skill" flow would require external bundle upload (state-changing, out of scope) |
| generate/video | NOT-REACHABLE | — | — | — | — | No video generation surface present in Claude web UI for this account |
| generate/audio-overview | NOT-REACHABLE | — | — | — | — | No audio overview / TTS download surface present in Claude web UI for this account |
| generate/long-context | NOT-REACHABLE | — | — | — | — | Not exercised this run; multifile upload covered multi-document understanding; dedicated long-context smoke not attempted within time budget |

---

## Section: settings

| feature-id | status | evidence path | observation |
|---|---|---|---|
| `settings/general` | PASS | `settings/sweep-notes.md` | Profile, Instructions-for-Claude textarea, Appearance (light/dark/system), Chat font "Anthropic Serif", Voice "Buttery", 5 notification toggles enumerated (Response completions, Code notifications, Code permission requests, Emails from Claude Code on the web, Dispatch messages); no toggles flipped |
| `settings/account` | PASS | `settings/sweep-notes.md` | Log-out-all-devices button, Delete-account link, Org ID `9a23efa1-…`, 5 active sessions listed (Chrome Linux Current + 4 others); no destructive action taken |
| `settings/usage` | PASS | `settings/sweep-notes.md` | Max (20×) plan; current session 26% used, resets in 3h2m; weekly limits: All models 13%, Sonnet only 0%, Claude Design 0%; daily routine runs 2/15 |
| `settings/claude-code` | PASS | `settings/sweep-notes.md` | Code font, Theme (Claude Light/Dark), Classify-session-states toggle, Create-PRs-automatically toggle, Autofix-PRs toggle, 3 auth token entries enumerated; Delete-sessions button noted (not clicked) |
| `settings/browser-extension` | PASS | `settings/sweep-notes.md` + `settings/browser-extension-read.json` | Sidebar label "Claude in Chrome Beta"; href `/settings/browser-extension`; Site-permissions section with Default-for-all-sites dropdown; read-only |
| `settings/billing` | NOT-REACHABLE | `settings/sweep-notes.md` | Skipped per doctrine §3 bullet 1 |
| `settings/privacy` | PASS (Stream #3 B8 cross-ref) | `share/data-export.md` | Export-data button at `/settings/data-privacy-controls` confirmed; button surface captured; export NOT triggered |
| `settings/capabilities` | PASS (Stream #3 B2 cross-ref) | Stream #3 evidence | 10 controls enumerated in Stream #3 (Artifacts, AI-powered artifacts, Inline visualizations, Code-execution-and-file-creation, Tool-access-mode, Allow-network-egress, Connector-discovery, Past-chat-search, Memory-summary) |
| `settings/connectors-redirect` | PASS | `upload/from-drive/note.md` | `/settings/connectors` now renders static redirect notice; real surface moved to `/customize/connectors` |

---

## Section: tools

| feature-id | status | evidence path | observation |
|---|---|---|---|
| `tools/composer-bar` | PASS | `tools/composer-bar.md` | 8 menu entries enumerated: "Add files or photos Ctrl+U", "Take a screenshot", "Add to project", "Skills" (submenu), "Add connectors" (submenu), "Research", "Web search", "Use style" (submenu) |
| `tools/skills-list-enumerate` | PASS | `tools/skills-list-enumerate.md` | `/customize/skills` — one personal skill: **skill-creator** (Added by Anthropic); Add-skill button `#radix-_r_6d_`; skill detail pane shows SKILL.md + file tree; Enable-skill toggle inside "More options" dropdown (not opened) |
| `tools/connectors-list` | PASS | `tools/connectors-list.md` | `/customize/connectors` — one connector: "GitHub Integration" (Not connected); Search-connectors button; Add-connector button `#radix-_r_5h_` |
| `tools/mention` | NOT-REACHABLE | `tools/mention.md` | Claude has NO @-mention quick-invoke; typing "@" raises no popover; closest analogue is composer "+" menu |
| `tools/style-presets-enumerate` | PASS | `tools/style-presets-enumerate.md` | 5 presets: Normal, Learning, Concise, Explanatory, Formal; plus "Create & edit styles" entry; switch Normal→Concise→Normal confirmed stable (composer badge updates) |
| `tools/output-style-custom` | INCONCLUSIVE | `tools/output-style-custom.md` | "Create & edit styles" menuitem reachable but not clicked — would persist new account style state |

---

## Section: share

| feature-id | status | evidence path | observation |
|---|---|---|---|
| `share/menu` | PASS | `share/menu.md` | Share dialog has 2 radio options: "Keep private" / "Create public link"; "Create share link" primary button; Close button; disclaimer text captured |
| `share/copy-link` | NOT-REACHABLE | `share/copy-link.md` | No "Copy link without publishing" affordance; "Create share link" would publish — not clicked per doctrine |
| `share/export-conversation-markdown-or-pdf` | NOT-REACHABLE | `share/export-conversation-markdown-or-pdf.md` | No conversation-level export in Claude web UI; per-artifact panel has "Download as .ext" / "Print as PDF" options (artifact-scoped, not conversation-scoped) |
| `share/data-export` | PASS | `share/data-export.md` | "Export data" button surface at `/settings/data-privacy-controls` captured; consent dialog NOT triggered |

---

## MCP automation candidates

Features that passed with a deterministic single-call automation path.

---

### Tool name: `webai.claude.send_prompt`

**Request schema:**
```json
{
  "profile": "claude-9224",
  "tab_url_contains": "claude.ai/new",
  "prompt": "string",
  "style_preset": "Normal | Learning | Concise | Explanatory | Formal | null",
  "wait_for_completion": true
}
```
**Response schema:**
```json
{
  "response_text": "string",
  "chat_url": "string (https://claude.ai/chat/<uuid>)",
  "model_used": "string",
  "errorCode": "ELEMENT_NOT_FOUND | IFRAME_NOT_FOUND | INVALID_ARGS | null"
}
```
**Stability notes:** Selector for composer textarea is stable (`[contenteditable="true"]` or `#prompt-textarea`). Response completion detection via "Claude finished the response" text or aria-live region. Model selector reads from composer label — no flip needed if profile is pre-set to Sonnet. Style preset menu uses text-match on `menuitemcheckbox` labels (not radix IDs). Viewport must be ≥1280px wide or composer bar wraps.

---

### Tool name: `webai.claude.generate_and_download_file`

**Request schema:**
```json
{
  "profile": "claude-9224",
  "prompt": "string",
  "artifact_class": "code | document",
  "expected_extension": ".py | .csv | .svg | .mmd | .docx | .xlsx | .pdf | .pptx | .md | .html",
  "download_dir": "string (absolute path)"
}
```
**Response schema:**
```json
{
  "download_path": "string",
  "size_bytes": "int",
  "sha256": "string",
  "artifact_name": "string",
  "errorCode": "ARTIFACT_DOWNLOAD_TIMEOUT | ELEMENT_NOT_FOUND | null"
}
```
**Stability notes:**
- **Code-class** artifacts (`.py`, `.csv`, `.svg`, `.mmd`, `.jsx`): use in-message `button[aria-label="Download <ArtifactName>"]`. Selector includes artifact name — must match generated name or use `button[aria-label^="Download"]` with single-element guard.
- **Document-class** artifacts (`.md`, `.html`, `.docx`, `.xlsx`, `.pdf`, `.pptx`): use panel-header icon `button[aria-label="Download"]` at approx bbox (1160,10,32,32). For `.md` and `.html`, use Copy-chevron (`#radix-_r_*`) → `div[role="menuitem"]:has-text("Download as .<ext>")` two-step — radix IDs rotate each session so must re-query after panel open. Network-error toasts can intercept chevron click; implement Escape-and-retry loop (max 3).
- Downloads route to system default `~/Downloads` (not `--download-dir`); move to `download_dir` after capture.

---

### Tool name: `webai.claude.upload_files_and_query`

**Request schema:**
```json
{
  "profile": "claude-9224",
  "tab_url_contains": "claude.ai",
  "file_paths": ["string", "..."],
  "prompt": "string"
}
```
**Response schema:**
```json
{
  "response_text": "string",
  "files_uploaded_count": "int",
  "errorCode": "ELEMENT_NOT_FOUND | UPLOAD_TIMEOUT | null"
}
```
**Stability notes:** File input selector is `#chat-input-file-upload-onpage` (stable across sessions; confirmed in Stream #4 multifile test). Up to 3 simultaneous files confirmed. Native OS file picker not used — CDP `Input.dispatchMouseEvent` + `setFiles` approach required for non-interactive file paths. PNG, CSV, and TXT all accepted.

---

### Tool name: `webai.claude.create_project_with_knowledge`

**Request schema:**
```json
{
  "profile": "claude-9224",
  "project_name": "string",
  "knowledge_title": "string",
  "knowledge_text": "string"
}
```
**Response schema:**
```json
{
  "project_id": "string (uuid)",
  "project_url": "string",
  "knowledge_chip_text": "string",
  "errorCode": "ELEMENT_NOT_FOUND | null"
}
```
**Stability notes:** Project creation at `/projects/create` (full-page form, not modal). "Add files" → "Add text content" path avoids native file picker entirely. Knowledge propagates to new chats under the project. `project_id` extractable from URL after creation redirect.

---

### Tool name: `webai.claude.list_skills`

**Request schema:**
```json
{
  "profile": "claude-9224"
}
```
**Response schema:**
```json
{
  "skills": [
    {
      "name": "string",
      "trigger": "string",
      "description": "string",
      "added_by": "string"
    }
  ],
  "errorCode": "ELEMENT_NOT_FOUND | null"
}
```
**Stability notes:** Navigate to `/customize/skills`; enumerate `div[data-testid="skill-card"]` or equivalent skill card elements. Skill detail pane shows SKILL.md. "More options" dropdown (`#radix-_r_6i_`) must NOT be opened (could expose enable/disable toggle — treat as read-only). Single stable skill `skill-creator` confirmed present on this account.

---

### Tool name: `webai.claude.set_style_preset`

**Request schema:**
```json
{
  "profile": "claude-9224",
  "tab_url_contains": "claude.ai",
  "preset": "Normal | Learning | Concise | Explanatory | Formal"
}
```
**Response schema:**
```json
{
  "active_preset": "string",
  "composer_badge_text": "string | null",
  "errorCode": "ELEMENT_NOT_FOUND | null"
}
```
**Stability notes:** Composer "+" button → menuitem "Use style" → `div[role="menuitemcheckbox"]:has-text("<preset>")`. Label text is stable (not radix IDs). After selection, composer shows `button[aria-label="Style: <preset>"]` as confirmation token. Reverting to Normal removes the badge.

---

## MCP non-candidates

Features that worked or were observed but are NOT suitable for single-call MCP automation yet:

| feature | reason |
|---|---|
| generate/canvas` (Claude Design) | `/design` is a separate sub-app; artifact format unknown; Create flow output path not documented; no prior stream exercised it; needs a focused probe |
| generate/deep-research | Research mode triggered and completed (30 sources, 44s) but the export/download path for the finished report was not captured before the run terminated; the DOM shows the report text but the download selector sequence is undiscovered; multi-step and timing-sensitive |
| generate/artifact-html` (chevron menu) | Transient network-error toast intercepted the first chevron click; requires Escape-and-retry logic; chevron IDs rotate; not yet robust enough for unattended MCP |
| generate/markdown` (chevron menu) | Same chevron-menu fragility as HTML; `browser:artifact-click --follow-up-*` does NOT keep the Radix menu open between probes; needs a new `browser:menu-pick` verb or `--keep-menu-open` flag |
| `tools/connectors-list` (Connect action) | GitHub Integration connector present but Connect triggers OAuth flow; cannot be automated without pre-existing OAuth session |
| `upload/from-drive` | Drive connector not available; requires fresh OAuth; NOT-REACHABLE on this account |
| `tools/output-style-custom` (Create & edit styles) | Modal behind "Create & edit styles" would persist custom style to account state; destructive to account config; requires Cancel-path testing first |
| generate/computer-use-entry | Claude-in-Chrome autonomous browsing entry in extension only (not web UI); not driveable over CDP from web |

---

## Catalog feedback

Updates needed for `docs/research/claude-feature-catalog.md` v1.2.0 → v1.3.0:

| # | type | change |
|---|---|---|
| 1 | SELECTOR DRIFT | `settings/browser-extension` sidebar label is **"Claude in Chrome Beta"** (not "Claude in Chrome"); href is `/settings/browser-extension` (NOT `/settings/claude-in-chrome` which 404s). Update `web_ui_path` and `automation_notes`. |
| 2 | SELECTOR DRIFT | `/settings/connectors` now renders a redirect notice: "Connectors have moved to Customize." Real surface is `/customize/connectors`. Update all entries with `web_ui_path: /settings/connectors`. |
| 3 | NEW SURFACE | **`claude-design-app`** — separate sub-app at `/design` with Figma-style design generation; routes `/design/docs`, `/design/examples`, `/design/design-systems`; Wireframe/High-fidelity toggle; not downloadable via current artifact paths. Add entry, `availability: max` (usage shows as separate quota line "Claude Design"). |
| 4 | NEW SURFACE | **`mermaid-live-editor-preview`** — Mermaid diagram artifacts render an embedded Mermaid Live Editor preview iframe inside the artifact panel (alongside the `.mmd` code download). Not documented in v1.2.0. |
| 5 | BEHAVIORAL CLARIFICATION | **Download path by artifact class**: code-class artifacts (`.py`, `.csv`, `.svg`, `.mmd`, `.jsx`) use in-message `button[aria-label="Download <Name>"]`; document-class artifacts (`.md`, `.html`, `.docx`, `.xlsx`, `.pdf`, `.pptx`) use the panel-header icon `button[aria-label="Download"]` OR the Copy-chevron menu. This distinction is NOT in v1.2.0 `automation_notes`. |
| 6 | NEW SURFACE | **`project-add-text-content`** — "Add text content" modal under Project → Add files is a distinct flow from file-upload; avoids native OS file picker; accepts title + textarea; useful for automation. Add as separate catalog entry. |
| 7 | BEHAVIORAL CLARIFICATION | **No @-mention in Claude** — Claude has no @-mention quick-invoke flow (unlike ChatGPT Custom GPTs). The closest analogue is the composer "+" menu. Annotate `chat-send-message` and related entries. |
| 8 | NEW SURFACE | **`composer-research-mode`** — "Research" entry in composer "+" menu triggers Deep Research mode (equivalent of ChatGPT's Deep Research). Confirmed: 30 sources, 44s run, "Research complete" state observed. Add entry distinct from `web-search`. |
| 9 | NEW SURFACE | **`composer-web-search-mode`** — "Web search" entry in composer "+" menu is a separate affordance from the Research mode. Enumerate as a distinct catalog entry. |
| 10 | BEHAVIORAL CLARIFICATION | **No conversation-level export** — Claude's web UI has NO "Export conversation as Markdown / PDF / DOCX" at the chat level. Per-artifact panel has `Print as PDF` / `Download as .<ext>` (artifact-scoped). Update `chat-share-link` and related entries with explicit negative note. |

---

## Consent dialogs encountered

No consent dialogs were encountered or required dismissal during this run. The account was already in an authenticated, consented state from Stream #3.

(No `consent-log.md` written — zero entries.)

---

## Handoff

**Baseline tabs (evidence/baseline-tabs.json):**

```json
[{"tabId": "stream3-claude", "pageId": "7DCAB2CADCA1D319682BCB80C5E52742",
  "url": "https://claude.ai/chat/b335d561-f5b9-409b-87ce-346c3756e847",
  "profile": "claude-9224", "status": "active"}]
```

**Handoff tabs:** `evidence/handoff-tabs.json` was NOT written before the subagent terminated. The run terminated mid-execution before the `meta/handoff-tabs` checkpoint completed.

**Tab leak assessment:** UNKNOWN — the subagent allocated `stream4-claude-core` (confirmed in `core/new-chat/alloc.json`) and navigated multiple checkpoints. Without `handoff-tabs.json`, a `stream4-claude-core` tab may have been left open on the shared Chrome profile `claude-9224`. **Recommended remediation:** caller should run `browser:tab:list --profile claude-9224` and free any tab with ID `stream4-claude-core` before next run.

**Tab allocated:** `stream4-claude-core` → confirmed in `core/new-chat/alloc.json`.  
**Tab freed:** Evidence of `browser:tab:free` for `stream4-claude-core` NOT found in any note.  
**Status: POTENTIAL LEAK — 1 tab (`stream4-claude-core`) may remain open.**
