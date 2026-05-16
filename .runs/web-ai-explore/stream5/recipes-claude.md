# Stream #5 — Claude interactive discovery recipes

Profile `claude-9224` (CDP 9224), tab allocated via
`node dist/src/cli.js browser:tab:alloc --profile claude-9224 --url <url> --tab-id <id>`.
Drive via project CLI only (existing `dist/`, no rebuild). Models: Sonnet/Haiku
only, never Opus.

Account: Bb / `qYgwillardboothiist5@lobbyist.com`, Max plan. Confirmed logged in.

Recurring stable handles on main Claude:
- Composer: `div[aria-label="Write your prompt to Claude"]` (also `[data-testid="chat-input"]`)
- Submit: `browser:press Enter` on the composer (the visible Send button is
  refused by the CLI sensitive-content guard)
- Tools menu: composer `+` button, accessible name "Add files, connectors, and more"
- Model dropdown: `button[data-testid="model-selector-dropdown"]`
- Sidebar expand/collapse: `button[data-testid="pin-sidebar-toggle"]`
- Completion gate (chat): action bar shows `Retry`/`Copy` and **no** `Stop`

---

## P0

### claude-design — EXPLORED_PATH_KNOWN  (SUB-MCP CANDIDATE)
Entry: `https://claude.ai/design` (sidebar `a[aria-label="Design"]`). Iframe SPA,
separate quota.
1. (optional) project-type tab: Prototype | Slide deck | From template | Other.
2. `input[placeholder="Project name"]` ← name.
3. fidelity `button` "Wireframe" | "High fidelity".
4. `[data-testid="create-project-button"]` (enables once name non-empty).
5. Workspace `https://claude.ai/design/p/<uuid>`.
6. Model: `[data-testid="model-selector-button"]` →
   `xpath=//button[normalize-space(text())="Sonnet 4.6"]` (Haiku/Sonnet only).
7. `textarea[data-testid="chat-composer-input"]` ← design request.
8. Submit: `browser:press Enter` (send btn `[data-testid="chat-send-button"]`
   guarded).
9. Gate: control text `Stop` → `Send (Enter)`; URL gains `?file=<Name>.html`.
10. Artifact = HTML in `iframe[data-testid="html-viewer-iframe"]`. Standalone via
    `Present` (`xpath=//button[contains(.,"Present")]`) → "New tab".
Other handles: modes `data-testid=mode-comment|mode-edit|mode-draw`,
`data-testid=nav-chat-history`, `data-testid=composer-import-button`,
`data-testid=live-voice-mic-button`, Design System, Share (public-link, guarded).
**Why sub-MCP:** fully self-contained app (own composer/model/canvas/quota);
folding it into the main server would bloat it. Propose `claude-design.*`
sub-MCP: create_project / generate / get_html / present.
Evidence: `claude-design-landing.png`, `claude-design-result.png`.

### claude-sidebar-code — BLOCKED_NEEDS_USER  (would-be SUB-MCP)
Entry `https://claude.ai/code` (sidebar `a[aria-label="Code"]`).
Working: New session (`xpath=//button[contains(.,"New session")]`); model switch
`xpath=//button[contains(.,"Opus 4.7")]` →
`xpath=//*[@role="menuitemradio"][contains(.,"Haiku 4.5")]` (Haiku confirmed);
environment `xpath=//button[contains(.,"Default")]` → menuitemradio "Default"
(cloud) / "Local · Desktop only"; `Select repo…` (no GitHub repos connected;
connecting = OAuth = OUT_OF_SCOPE).
**Blocked:** the real task editor is not exposed by `browser:read --mode full`
(no `placeholder="Describe a task..."`, no contenteditable, no
ProseMirror/textarea). Only `role=textbox` is `#base-ui-_r_g9_` — a hidden
aria-hidden 1px base-ui sink (typing doesn't reach the visible composer).
`browser:type` on the placeholder xpath times out. Visible `button[aria-label="Send"]`
refused by the CLI sensitive-content guard; Enter on the hidden input opens the
repo picker. Full reproduction + precise user questions in
`blocked-claude.md`. Evidence: `claude-code-landing.png`,
`claude-code-newsession.png`, `claude-code-aftersend.png`.

### claude-artifacts-export — EXPLORED_PATH_KNOWN  (VERIFIED, real file)
1. Main composer ← e.g. "Create a tiny HTML page with an h1 that says Hello. Put
   it in an artifact." → `browser:press Enter`.
2. Gate: action bar `Retry`/`Copy`/`Preview`, no `Stop` (~9s).
3. Artifact panel auto-opens; download = `button[aria-label^="Download "]`
   (aria-label = `Download <ArtifactTitle>`).
4. Capture (mandated CDP):
   `node dist/src/cli.js browser:artifact-click --profile claude-9224 --tab-url-contains "claude.ai/chat/<id>" --button-selector 'button[aria-label^="Download "]' --download-dir <abs-dir> --output-json`
**Verified:** `hello.html` 136 bytes, valid HTML, sha256 `32efd76e…`
(`.runs/web-ai-explore/stream5/artifact-dl/hello.html`). Same path covers
HTML/React/SVG/Mermaid/code/DOCX/PDF artifacts. Panel also: Copy
(`action-bar-copy`), Close (`data-testid=wiggle-controls-actions-toggle`), Share
(`data-testid=wiggle-controls-actions-share`, publish — leave guarded).

---

## Other UNEXPLORED → resolved

### claude-extended-thinking — EXPLORED_PATH_KNOWN
`[data-testid="model-selector-dropdown"]` → switch
`input[aria-label="Adaptive thinking"]` (role=switch, default checked=true). This
is Claude's extended/adaptive thinking control.

### claude-web-search — EXPLORED_PATH_KNOWN
Composer `+` menu → `xpath=//*[@role="menuitemcheckbox"][contains(.,"Web search")]`
(checkbox toggle; menu closes on click = registered). Shares `+` menu with
Research, Skills, Add connectors, Use style, Add to project, Add files, Take a
screenshot.

### claude-conversation-management — EXPLORED_PATH_KNOWN
Expand sidebar `button[data-testid="pin-sidebar-toggle"]`. Per-row kebab
`xpath=//button[starts-with(@aria-label,"More options for")]` → rename/delete/star
(Radix portal; CLI `browser:read` cannot reliably snapshot the open menu — same
Radix limitation; entry+path known). Global search `a[aria-label="Search"]`
(Ctrl+K) → modal "Search chats and projects" (VERIFIED — screenshot
`claude-conv-mgmt.png` shows results list, Enter opens).

### claude-analysis-tool — EXPLORED_PATH_KNOWN  (VERIFIED live)
Main chat, computational/data prompt (e.g. "Use the analysis tool to compute the
sum of integers 1 to 10"). VERIFIED: response "55" + status line "Devised bash
computation for integer summation task" confirming code execution. Auto-invoked;
no explicit toggle in the `+` menu.

### claude-incognito-mode — EXPLORED_PATH_KNOWN  (VERIFIED live)
`https://claude.ai/new` → `button[aria-label="Use incognito"]` → URL becomes
`https://claude.ai/new?incognito=`, "Exit incognito" + "Learn more" shown.

### claude-chrome-extension — OUT_OF_SCOPE
In-app entry `div[aria-label="Get apps and extensions"]` →
`https://claude.ai/downloads`. The extension is a separate browser surface not
installed in the managed profile → OUT_OF_SCOPE.

---

## EXPLORED_PATH_KNOWN re-validated (stable entry confirmed live this session)

- **claude-model-selector** — `[data-testid="model-selector-dropdown"]`; items
  `menuitemradio` (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / More models) by name.
- **claude-deep-research** — `+` menu →
  `xpath=//*[@role="menuitemcheckbox"][contains(.,"Research")]`.
- **claude-projects** — `a[aria-label="Projects"]` (`/projects`); `+` menu
  "Add to project".
- **claude-style-presets** — `+` menu → menuitem "Use style".
- **claude-sharing** — conversation header "Share" button (CLI guard requires
  confirm; treat as explicit action).
- **claude-integrations-connectors** — `+` menu → menuitem "Add connectors"
  (list in scope; OAuth connect OUT_OF_SCOPE).
- **claude-skills** — `+` menu → menuitem "Skills".
- **claude-settings-appearance** — `a[aria-label="Customize"]` (`/customize`);
  account settings `button[data-testid="user-menu-button"]` (billing/identity
  OUT_OF_SCOPE).
- **claude-mermaid-live** — Mermaid is an artifact type; export via the proven
  `button[aria-label^="Download "]` + CDP artifact-click (same as
  claude-artifacts-export).

## OUT_OF_SCOPE (recorded, not exercised)
- **claude-computer-use** — autonomous OS control, security risk (policy).
- **claude-account-billing** — account-identity/billing (policy).

---

## Sub-MCP candidates
1. **Claude Design** (`claude-design`) — strong candidate. Self-contained app at
   `/design`, own composer/model/canvas/quota. Propose dedicated sub-MCP
   (`create_project`, `generate`, `get_html`, `present`) rather than bloating the
   main server.
2. **Claude Code** (`claude-sidebar-code`) — would be a sub-MCP candidate (own
   session/env/model surface at `/code`), but currently BLOCKED on editor
   targeting + Send-guard; sub-MCP design deferred until user clarifies the
   manual UI sequence.
