# Stream #5 — ChatGPT interactive discovery recipes

Session: 2026-05-15, profile `chatgpt`, CDP 9223, tab-ids `s5-chatgpt`,
`s5-chatgpt-codex`, `s5-cg-canvas`, `s5-cg-a`, `s5-cg-b`.
Account: `Shark Pro` (individual Pro plan).
Discovery only — no product code written, no dist rebuild.

> **Counts:** EXPLORED_PATH_KNOWN 17 · BLOCKED_NEEDS_USER 6 · OUT_OF_SCOPE 1
> (total queue 24).

---

## Cross-cutting findings (read first)

1. **Model selector resets to Pro on every navigation.** A fresh chat /
   reload shows the account default `Extended Pro`. To honor the no-Pro
   constraint, ALWAYS re-select `Thinking` before any send:
   locate the composer model button by accessible name (`Extended Pro` /
   `Thinking` / `Instant`, `aria-haspopup=menu`, dynamic id `#radix-_r_*_`),
   click it, then click `[role=menuitemradio]:has-text('Thinking')`.
   This Radix menu **does** open via the CLI.

2. **Radix portal popovers that DO open via CLI synthetic click:**
   the composer model dropdown; the composer `+` top-level menu
   (`#composer-plus-btn`) and its top-level `menuitemradio`s
   (Create image / Deep research / Web search).

3. **Radix portal popovers that DO NOT open via CLI synthetic events**
   (systemic tooling limitation — confirmed via many hover/click + screenshot
   attempts, snapshot reader cannot traverse the portal):
   - composer `+` -> **`More` submenu** (hosts Study mode, Agent mode,
     explicit Canvas, extra tools) — hover-intent submenu, no pointer-dwell.
   - per-conversation **kebab** menu (`history-item-<n>-options`) and
     per-project options kebab — rename/archive/delete.
   - **Search chats** command palette (`button[aria-label='Search chats']`).
   These need a CLI native-hover / pointer-dwell capability, or manual user
   steps. The model dropdown working but submenus not strongly suggests the
   blocker is specifically hover-intent + portal traversal, not click itself.

4. **Settings is reachable via a stable hash route** (avoids the unreliable
   profile-menu dropdown): `https://chatgpt.com/#settings/<Tab>` opens the
   Settings dialog; switch tabs with `button:has-text('<Tab name>')`.
   Tabs: Account, General, Notifications, Personalization, Apps, Schedules,
   Billing, Data controls, Storage, Security, Parental controls.

5. **Tab navigation:** `browser:open "<url>" --profile chatgpt --tab-id <id>`
   (URL is a POSITIONAL arg; `--url` is not parsed for browser:open). There
   is no `browser:navigate`. New-tab features (Codex) need a fresh
   `browser:tab:alloc`.

---

## P0

### chatgpt-sidebar-codex — EXPLORED_PATH_KNOWN (sub-MCP candidate)
- Sidebar `Codex` = `a[href='/codex/cloud']` `target=_blank`. **Direct route:
  `https://chatgpt.com/codex/cloud`** (NOT `/codex`, which is a marketing page).
- Surface: composer `#prompt-textarea` (aria `Codex composer`); repo/branch
  `button[aria-label='Search for your branch']`; environments
  `button[aria-label='View all code environments']` (dropdown lists connected
  GitHub repos); versions `button[aria-label^='Open versions number selector']`;
  submit `button[aria-label='Submit']`; task tabs
  `button[aria-label='Tab selector to view active tasks']` / `... code reviews`
  / `... archived tasks`; `Open task search`.
- **Not exercised live:** all connected environments are real GitHub repos
  (`LT-0I/*`, noeticbraid-related); a live Codex task is not benign and risks
  the forbidden noeticbraid project. Needs a throwaway sandbox repo from user.
- Strong **sub-MCP candidate** (large self-contained cloud-coding module).

### chatgpt-canvas — EXPLORED_PATH_KNOWN
- Set Thinking. Type `Use canvas to write <trivial benign body>` into
  `#prompt-textarea`; Enter. Canvas panel opens; URL -> `…/c/<id>`.
- Toolbar: `button[aria-label='Copy']`, an `Edit` button, a Download dropdown
  (`button#radix-_r_*_`, aria-label `Download`, aria-haspopup).
- Verified: `Use canvas to write a 4-line plain-text note titled "Stream5
  Canvas Probe"…` -> `https://chatgpt.com/c/6a0718ad-2894-83e8-81c4-dec35ae0c1b2`.

### chatgpt-canvas-export — EXPLORED_PATH_KNOWN
- Single-call via the mandated CDP pattern:
  ```
  node dist/src/cli.js browser:artifact-click --profile chatgpt \
    --tab-url-contains "/c/<convId>" \
    --button-selector '<canvas-Download-dropdown #radix id>' \
    --follow-up-text-regex 'Markdown Document' \
    --download-dir <abs> --output-json
  ```
- Dropdown menuitems: `PDF Document (.pdf)`, `Microsoft Word Document (.docx)`,
  `Markdown Document (.md)`.
- **Verified artifact:** `.runs/web-ai-explore/stream5/artifacts/stream_5_canvas_probe.md`
  — sha256 `2d7da7fdc133470a18981d1a08e61a553b634ce0a2936de35ebc7f5ae3bb9482`,
  44 bytes, content `# Stream5 Canvas Probe / one / two / three / four`.
- Locate the dropdown id each run by aria-label `Download` (the one with
  aria-haspopup; the plain chat-turn `Download` button is different).

---

## Composer-mode features

### chatgpt-search-web — EXPLORED_PATH_KNOWN
- `#composer-plus-btn` -> `[role=menuitemradio]:has-text('Web search')` ->
  type -> Enter. Active pill `button[aria-label='Search, click to remove']`.
- Verified: "capital of France" -> "The capital city of France is Paris."
  with Search marker, `…/c/6a0718ff-4018-83e8-ad5d-6d16f8da0bb0`.

### chatgpt-deep-research — EXPLORED_PATH_KNOWN
- `#composer-plus-btn` -> `[role=menuitemradio]:has-text('Deep research')`.
  Active: `button[aria-label='Deep research, click to remove']` +
  `div[aria-label='Deep Research tabs']`. Toggle validated; full run (5-30 min)
  not executed (stream4 already validated completion).

### chatgpt-data-analyst — EXPLORED_PATH_KNOWN
- Thinking. `browser:upload --selector '#upload-files' --file <csv>`
  (chip `<name> Spreadsheet`). Prompt for a chart. Send via
  `button[aria-label='Send prompt']` / `[data-testid=send-button]`
  (NOT Enter while attachment processing). Code Interpreter renders an
  interactive chart; gate = `Done.` + chart.
- Verified: `s5_data.csv` -> "Population By City" interactive bar chart,
  `…/c/6a071c30-d3e8-83e8-901f-1b144c9f9963`.
- Chart-PNG export = role=dialog with duplicate `Download <name>.png`
  (multi-step, per stream4 — not single-call).

### chatgpt-model-selector — EXPLORED_PATH_KNOWN
- Composer model button (by accessible name, dynamic `#radix-_r_*_`) ->
  menuitemradios `Instant` / `Thinking` / `Pro • Extended` + `Configure…`.
  Verified Pro->Thinking switch multiple times. **Resets per navigation.**

### chatgpt-code-generation — EXPLORED_PATH_KNOWN
- Thinking. Code prompt -> code block with `Copy` + `Run code`/`Run`.
  Verified: add(a,b) one-liner, `…/c/6a071e07-7ffc-83e8-b021-a98fa478e1a7`.
  File download = stream4 `button.behavior-btn` behavior-chip.

### chatgpt-image-visual-query — EXPLORED_PATH_KNOWN
- Thinking. `browser:upload --selector '#upload-files' --file <image>`,
  ask about it, send. Covered by GREEN `webai_chatgpt_upload_and_query`;
  identical upload mechanism exercised live this session (CSV path).

---

## Route / Settings features

### chatgpt-projects — EXPLORED_PATH_KNOWN
- Sidebar open (`button[aria-label='Open sidebar']` if collapsed) ->
  `button[data-sidebar-item='true']:has-text('New project')` -> dialog
  `#project-name` -> `button:has-text('Create project')` ->
  lands `…/g/g-p-<id>/project`.
- Verified: created `S5 Probe Temp` ->
  `…/g/g-p-6a071add7a94819190b74d18bcb38c16/project`.
- **Cleanup pending:** delete-via-kebab not CLI-automatable; left for user
  (blocked-chatgpt.md).

### chatgpt-gpt-store — EXPLORED_PATH_KNOWN
- `https://chatgpt.com/gpts`; cards = `a[href^='/g/g-']` (a.gizmo-link).
  Launch via `/g/<id>-<slug>`. Re-validated (7+ cards).

### chatgpt-tasks — EXPLORED_PATH_KNOWN
- Mgmt: `#settings/Schedules` (via hash route + `button:has-text('Schedules')`)
  -> "Manage". Creation: in-conversation response menu -> `Schedule`
  (Radix menu — blocked for CLI; documented).

### chatgpt-apps-mcp — EXPLORED_PATH_KNOWN
- `https://chatgpt.com/#settings/Connectors` -> Apps tab: Enabled apps,
  connected `GitHub`, `Add more`, `Advanced settings`, `Explore all apps`.
  Adding a new app = OAuth/credentials (forbidden); read-only surface OK.

### chatgpt-memory — EXPLORED_PATH_KNOWN
- `#settings/Personalization` -> `button[aria-label='Manage memories']` +
  custom-instruction textareas (`traits_model_message`, `other_user_message`).
  Did not open the memory list (sensitive). Matches stream4.

### chatgpt-settings-personalization — EXPLORED_PATH_KNOWN
- `#settings/Personalization`: custom instructions, Manage memories,
  `Show "Pulse" in new chats` toggle, Record mode. Re-validated.

### chatgpt-settings-data-controls — EXPLORED_PATH_KNOWN
- `#settings/DataControls` (Data controls tab): `Improve the model for
  everyone Off`, `Remote browser data On / Manage`, Shared links / Archived
  chats / `Archive all chats` / `Delete all chats` / `Export data`. Read-only
  safe; destructive/account actions not triggered. Re-validated.

### chatgpt-share-conversation — EXPLORED_PATH_KNOWN
- Conversation header `button[data-testid='share-chat-button']`
  (aria `Share`) -> dialog Copy link / X / LinkedIn / Reddit. Button
  identified; did NOT publish (public-publishing banned). Matches stream4.

---

## Blocked / OOS (summaries — full detail in blocked-chatgpt.md)

- **chatgpt-voice-mode** — BLOCKED: `button[aria-label='Start Voice']` ->
  "Say hello to Voice" consent overlay; needs mic/audio I/O + a durable
  consent click. Not automatable.
- **chatgpt-pulse** — BLOCKED: onboarding modal `Get started` = durable
  account-state change (forbidden). Toggle exists at Personalization.
- **chatgpt-conversation-management** — BLOCKED: per-conversation kebab +
  Search command palette are Radix portals that don't open via CLI. Bulk
  archive/delete reachable via Settings -> Data controls (documented).
- **chatgpt-agent-mode** — BLOCKED: lives under unreachable `+` `More`
  submenu. Sub-MCP candidate.
- **chatgpt-study-mode** — BLOCKED: unreachable `+` `More` submenu.
- **chatgpt-atlas-browser** — BLOCKED: no in-web entry point; Atlas is a
  separate OpenAI desktop-browser product. Needs user clarification.
- **chatgpt-workspace-agents** — OUT_OF_SCOPE: enterprise/Team-only;
  this is an individual Pro account; admin/account surface off-limits.
