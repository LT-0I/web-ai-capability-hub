# Stream #5 — Gemini interactive exploration recipes

Campaign: exhaustive Gemini web-UI discovery (2026-05-15). Profile `gemini-9225`,
CDP 9225, tab-id `s5-gemini`. Driven entirely via project CLI (`node dist/src/cli.js browser:*`).
18 queue features: **16 EXPLORED_PATH_KNOWN**, **2 BLOCKED_NEEDS_USER**.

Cross-cutting notes:
- The `Send message` click trips the contract RISK_WORDS guard (`/send|submit|.../`).
  `--confirmed true` is the sanctioned bypass for known-benign sends (same as the
  IMPLEMENTED_GREEN gemini-send-prompt). It is NOT a silent fallback — it is the
  explicit human-confirmation contract path.
- On a fresh composer the Tools button briefly lacks its `aria-label`; use
  `xpath=//button[.//text()[contains(.,"Tools")] or @aria-label="Tools"]`.
- Tools drawer menu = `#toolbox-drawer-menu`; items are generic `<button>` —
  target by `xpath=//*[@id="toolbox-drawer-menu"]//button[normalize-space(.)="<Label>"]`.
- All `mat-menu-panel-N` ids are dynamic — never hardcode N; match by text.
- `browser:read` does NOT enumerate: (a) the Canvas contenteditable body,
  (b) hover-only per-conversation sidebar action buttons. Use xpath / the
  in-conversation actions menu respectively.
- `browser:screenshot --path` is ignored; it auto-names under `data/screenshots/`.

---

## P0 — gemini-make-music (Lyria) — VERIFIED with artifact

1. `https://gemini.google.com/app` (fresh).
2. Click `button[aria-label="🎸 Create music, button, tap to use tool"]`
   (emoji literal) OR Tools drawer → "Create music". Confirmed by
   `button[aria-label="Deselect Create music"]` + composer placeholder "Describe your track".
3. Type benign instrumental prompt into `div[aria-label="Enter a prompt for Gemini"]`;
   `browser:press Escape` (clears `ul#auto-suggest-0-0`).
4. `browser:click button[aria-label="Send message"] --confirmed true`.
5. Generating: `button[aria-label="Stop response"]` present, URL → `/app/<id>`.
6. Poll until `button[aria-label="Download track"]` present & `Stop response` gone (~20-30s).
7. **Artifact (verified):**
   `browser:artifact-click --profile gemini-9225 --tab-url-contains <id> --button-selector 'button[aria-label="Download track"]' --follow-up-text-regex 'MP3' --download-dir <abs> --locate-timeout-ms 20000 --prerender-wait-ms 1500`
   → `Paper_Keys.mp3` 744,610 B, valid MPEG-1 layer III 192 kbps 44.1 kHz.
   **QUIRK:** "Download track" is a 2-stage menu (formats: "Video Audio with cover art",
   "Audio only MP3 track") — single click won't download.
   **SUB-MCP CANDIDATE** (`gemini-music`): self-contained module (player widget,
   format menu, share-track, video render).

---

## gemini-image-editing
Conversational, no Edit button. Generate/upload an image (gemini-generate-image
GREEN), then send a benign edit instruction in the SAME conversation; new turn
carries a fresh `button[aria-label="Download full size image"]`. Thin multi-turn
extension of the GREEN generate-image tool.

## gemini-canvas-edit
Tools drawer → "Canvas". Send a SUBSTANTIAL prompt (one-liners stay inline and
never open the panel). Panel gated by `button[aria-label="Share and export canvas"]`
+ `Close panel` + `Previous version`. **Direct inline edit:** type into
`xpath=(//div[@contenteditable="true"])[last()]` (composer = first contenteditable;
canvas body = last — NOT enumerated by browser:read). AI edits: select text →
`button[aria-label="Length"|"Tone"|"Suggest"]`. Verified: typed text replaced the
canvas bullet (screenshot confirmed).

## gemini-personalization-memory
Settings & help → "Personal Intelligence" → `https://gemini.google.com/personalization-settings`.
Memory toggle `#mat-mdc-slide-toggle-0-button`; "Manage and delete" past chats;
links to Connected Apps + Instructions. OBSERVE-ONLY (toggle = account change).

## gemini-connected-apps
personalization-settings → `a[aria-label="Go to Connected Apps section"]` →
`https://gemini.google.com/apps`. Per-extension switches
`#mat-mdc-slide-toggle-N-button` (N=1..9+): Google Workspace, Photos, Search
services, YouTube, YT Music, code, OpenStax, reservations. Chips
`#mat-mdc-chip-0/1`. Enumerate labels+aria-checked; OBSERVE-ONLY for toggling.

## gemini-workspace-integration
`https://gemini.google.com/apps` → "Google Workspace" card, switch
`#mat-mdc-slide-toggle-1-button` (covers Gmail/Calendar/Docs/Drive/Keep/Tasks).
No dedicated surface beyond the toggle; usage is conversational via the
gemini-send-prompt GREEN tool. OBSERVE-ONLY for toggle.

## gemini-conversation-management
In conversation: `button[aria-label="Open menu for conversation actions."]` →
mat-menu with menuitems **Pin / Rename / Delete**. Share:
`button[aria-label="Share conversation"]`. Search: expand sidebar
(`button[aria-label="Main menu"]`) → `button[aria-label="Search"]`; list region
`#conversations-list-0` (each conversation an `<a>` button by title). Did NOT
exercise Delete/Rename (data-mutating); menu enumeration is the definitive recipe.
Per-row sidebar 3-dot is hover-only & not reader-enumerable — use the
in-conversation menu.

## gemini-deep-think  &  gemini-model-selector  (shared entry)
`button[aria-label="Open mode picker"]` → mat-menu menuitems:
**Fast** / **Thinking** / **Pro** / Upgrade. Select via
`xpath=//*[@id="mat-menu-panel-N"]//button[contains(normalize-space(.),"<Tier>")] --confirmed true`;
picker label updates & persists per-session (verified Fast→Thinking by screenshot).
**gemini-deep-think == the "Thinking" tier** (this build folded "2.5 Pro Deep
Think" into Thinking [allowed] vs Pro [project-FORBIDDEN for tests]).

## gemini-deep-research
Tools drawer → "Deep research" menuitemcheckbox (re-validated present). Type
research prompt → send `--confirmed true`. Multi-minute report run; report turn
carries export + post-report Audio overview. End-to-end not exercised (P2 cost);
entry/shape confirmed. SUB-MCP candidate (long async job).

## gemini-study-materials  (RENAMED → "Guided learning")
Tools drawer → **"Guided learning"** menuitemcheckbox (library said "Study
materials"; UI renamed). Confirmed by `button[aria-label="Deselect Guided learning"]`.
Alt: quick-action `button[aria-label="Help me learn, ..."]`. Provide content/upload
→ prompt for flashcards/quiz/practice test.

## gemini-audio-overview  (MOVED out of Tools drawer)
No longer in Tools drawer. Now: a post-Deep-Research-report "Audio Overview"
action, OR via NotebookLM (Settings & help → "NotebookLM"). Distinct from the
ubiquitous per-answer TTS `button[aria-label="Listen"]`. End-to-end deferred
(needs a completed Deep Research run); path known, not blocked.

## gemini-gems
`https://gemini.google.com/gems/view` (or sidebar `a[aria-label="Gems"]`).
Launch a Gem via `a[aria-label="Start a new conversation with Gem: <name>"]`
(e.g. "Chess champ"). Route stable; then reuses gemini-send-prompt GREEN.

## gemini-scheduled-actions
`https://gemini.google.com/scheduled` (or Settings & help → "Scheduled actions").
Route stable; account has zero scheduled actions (empty list expected). Creation
not exercised (persistent account state).

## gemini-share-chat
`button[aria-label="Share conversation"]` present on every persisted
`/app/<id>`. Manage links: Settings & help → "Your public links". Did NOT
click through to actually publish a link — project policy bans public publishing
during web-AI automation. Recipe stops at share-dialog open.

## gemini-long-context
No distinct UI — automatic for large/multi-doc inputs. Fully subsumed by the
IMPLEMENTED_GREEN gemini-upload-and-query path; no extra automation needed.

---

## BLOCKED (see blocked-gemini.md)

- **gemini-voice-mode** — `button[aria-label="Microphone"]` clicks no-op (no mic
  device in managed Chrome; no overlay/permission/error). Environmental block.
- **gemini-live-mode** — no standalone Live button in this web build (top-right
  dashed-square is "Temporary chat"); routes through the blocked voice flow.
