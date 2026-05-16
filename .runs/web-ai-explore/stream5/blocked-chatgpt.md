# Stream #5 — ChatGPT BLOCKED_NEEDS_USER

Session 2026-05-15, profile `chatgpt`, CDP 9223, account `Shark Pro`.
Discovery-only Opus-4.7-max interactive sweep. Each entry: what was tried,
what failed, exact question for the user.

---

## chatgpt-conversation-management (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- Identified stable selectors: sidebar per-conversation kebab
  `button#radix-_r_*_` with `data-testid='history-item-<n>-options'` and
  `aria-label='Open conversation options for <title>'`; chat search
  `button[aria-label='Search chats']`; per-project kebab
  `aria-label='Open project options for <name>'`.
- Clicked the kebab buttons and the Search-chats button many times
  (with `--confirmed true`), waited, and read full DOM + took screenshots.

**What failed**
- The kebab Radix dropdown (Rename/Archive/Delete) and the Search-chats
  Radix command-palette never rendered in the snapshot and never appeared in
  screenshots. They are React/Radix portal popovers; the project CLI's
  synthetic mouse events do not trigger them and the snapshot reader cannot
  traverse the portal. (The composer model dropdown and the `+` top-level
  menu DO open this way — so the blocker is specifically hover-intent +
  portal-popover traversal, not click in general.)
- Bulk archive/delete IS reachable via Settings -> Data controls
  (`#settings/DataControls`: 'Archived chats' Manage / 'Archive all chats' /
  'Delete all chats') — that path is documented and usable. The per-item
  rename/archive/delete + chat-search are the blocked parts.

**Question for the user**
Please walk through, in the ChatGPT web UI, on a single conversation:
1. Click the conversation's 3-dot menu in the left sidebar — what menu items
   appear (Rename / Archive / Delete / Share / others)? For each, the exact
   menuitem text and any `data-testid`/`aria-label` (DevTools).
2. Repeat for the "Search chats" button: what dialog opens, its input
   selector, and how results are listed.
3. Any timing requirement (does the menu need a hover-dwell before click?).

---

## chatgpt-agent-mode (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- Enumerated the composer `+` menu (`#composer-plus-btn`): Add photos &
  files, Recent files, Create image, Deep research, Web search, **More**,
  Projects. Agent mode is NOT a top-level item, sidebar link, or working
  hash route.
- Attempted to expand the `More` submenu (`#radix-_r_*_`, the menuitem with a
  chevron) via repeated `browser:hover`, double-hover, click, ArrowRight
  keyboard nav, plus immediate screenshots.

**What failed**
- The `More` submenu is a Radix hover-intent submenu. The CLI's synthetic
  hover does not sustain a pointer-dwell, so the submenu never expanded; the
  snapshot reader cannot traverse the portal. Confirmed across many attempts.

**Question for the user**
In the ChatGPT web UI, click composer `+` -> hover `More`:
1. List every item in the `More` submenu (looking for "Agent" /
   "Agent mode" / "ChatGPT agent").
2. For Agent mode: exact menuitem text + selector, then the full flow to
   start an agent task and the completion-gate selector.
3. Is there a non-submenu entry (a toggle, a route, a keyboard shortcut)?

---

## chatgpt-study-mode (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- Same `+` `More` submenu enumeration as Agent mode. Study mode is not a
  top-level plus item, sidebar link, or working route. Stream4 had observed a
  transient, non-deterministic "Study Mode" promo modal.

**What failed**
- Same Radix `More` hover-submenu limitation — cannot expand via CLI.

**Question for the user**
In the ChatGPT web UI, open composer `+` -> `More`:
1. Is there a "Study mode" / "Study and learn" item? Exact text + selector.
2. The full flow: do you upload a document first, then toggle Study mode, or
   toggle then upload? Completion-gate selector (flashcards/quiz container).
3. Any direct route or keyboard shortcut for Study mode?

---

## chatgpt-voice-mode (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- Clicked `button[aria-label='Start Voice']`. Intro overlay "Say hello to
  Voice" appeared (Natural conversations / Multiple voices / Personalized /
  "Audio recordings are saved") with a `Continue` button + `manage
  recordings`.

**What failed**
- Cannot exercise: the headless automation host has no microphone and no
  audio capture/playback; a live voice session is realtime audio I/O.
- `Continue` is a first-use consent that enables a durable voice-recordings
  feature — a forbidden durable account-state change.

**Question for the user**
1. Is web Voice mode in scope for automation given there is no audio I/O on
   the host? If yes, how should the automated layer represent a voice
   session (text transcript only)?
2. If we may click `Continue` once, confirm the consent (durable recordings)
   is acceptable, and describe the post-consent overlay + how to end the
   session cleanly (selector).

---

## chatgpt-pulse (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- `https://chatgpt.com/pulse` -> redirects to home (no standalone route).
- Pulse onboarding modal observed (dialog `#radix-_r_*_`, body "Pulse can
  help you stay on top of anything…", `Get started` + `Close onboarding`).
  Dismissed via `Close onboarding` (no activation).
- Settings -> Personalization confirms a `Show "Pulse" in new chats` toggle
  ("Turning this off will disable Pulse").

**What failed**
- Activating Pulse requires clicking `Get started` = durable account
  onboarding state change, explicitly forbidden by the campaign rules and
  stream4's prior pulse note.

**Question for the user**
1. May we click `Get started` to onboard Pulse (durable account change)? If
   yes, describe the post-onboarding Pulse surface (route/selector, where the
   daily digest renders, completion gate).
2. If not, confirm Pulse should remain BLOCKED for this campaign.

---

## chatgpt-atlas-browser (chatgpt) — BLOCKED_NEEDS_USER

**What we tried**
- Enumerated the full composer `+` menu (no "Atlas" / "Browse with Bing"
  item), the sidebar (no Atlas link), and hash routes. The only Atlas-adjacent
  surface is Settings -> Data controls `Remote browser data` (On / Manage).
  The Codex landing page footer references "Atlas" as a separate OpenAI
  product/desktop app.

**What failed**
- No drivable in-web-UI entry point for an AI-guided browsing agent on this
  account. Any such capability would sit under the unreachable `More`
  submenu or in the separate Atlas desktop browser (out of web-automation
  scope).

**Question for the user**
1. For this account, is there an in-`chatgpt.com` entry for AI-guided web
   browsing (route / composer toggle / `More`-submenu item)? Exact location
   + selector.
2. Or does "Atlas browser" map to the separate OpenAI Atlas desktop app
   (i.e. out of scope for this web-automation project)? Please confirm.

---

## Housekeeping: leftover test artifact (not a feature block)

A benign test project **`S5 Probe Temp`** was created while exercising
`chatgpt-projects` (URL
`https://chatgpt.com/g/g-p-6a071add7a94819190b74d18bcb38c16/project`).
It contains no chats. Deleting it requires the per-project options Radix
kebab, which (per chatgpt-conversation-management above) does not open via
the CLI. **Please delete `S5 Probe Temp` manually** (sidebar -> S5 Probe
Temp -> project options -> Delete project), or confirm it can stay as
labeled test content. It is user content only — no account/identity impact.
