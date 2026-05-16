# Stream #5 — ChatGPT re-discovery recipes (BP1 primitive)

Session 2026-05-15, profile `chatgpt`, CDP 9223, tab-id `vx-cg-disc`,
account `Shark Pro`. Discovery only — no product code, no dist rebuild.
Tooling: the new `browser:hover --dwell-ms --settle-selector` (real
CDP pointer-dwell) + `browser:read --include-portals` (body-level Radix
portal traversal) from BP1.

> The prior sweep blocked these because synthetic click did not open
> Radix hover-intent submenus / portal popovers and the snapshot reader
> could not traverse body-level portals. The new primitives crack 2 of 3.

---

## chatgpt-conversation-management — EXPLORED_PATH_KNOWN  ✅ CRACKED

Two sub-surfaces, both previously blocked, both now reachable.

### A. Per-conversation options menu (Rename/Archive/Delete/etc.)

The **sidebar** kebab `button[data-testid='history-item-<n>-options']`
is *permanently overlaid* by the sibling sidebar `<a data-sidebar-item>`
link in the same `<li>` — Playwright refuses the click ("`<a …> …
intercepts pointer events`"). This is a z-stacking/overlay block, NOT a
hover-reveal block, so hover-dwell does not help the sidebar kebab.

**Working path — use the in-chat-header options button (no overlay):**

1. Open the conversation:
   `browser:open "https://chatgpt.com/c/<convId>" --profile chatgpt --tab-id <id>`
2. Click the header button:
   `browser:click --tab-id <id> --profile chatgpt --selector 'button[aria-label="Open conversation options"]'`
3. Read the body-level Radix portal:
   `browser:read --tab-id <id> --profile chatgpt --include-portals --mode lite`

**Observed live menu items** (role=menuitem, body portal):
`Start a group chat`, `View files in chat`, `Move to project`
(`#radix-_r_*_`), `Pin chat`, `Archive`, `Delete`.
Completion gate: `--include-portals` read returns ≥1 menuitem named
`Archive`/`Delete`. Destructive items present but NOT activated.

### B. Search-chats command palette

`button[aria-label="Search chats"]` is unreliable to click (sidebar
collapse state). **Use the keyboard shortcut instead:**

1. `browser:press --tab-id <id> --profile chatgpt --key 'Control+k'`
2. `browser:read --tab-id <id> --profile chatgpt --include-portals --mode lite`
   → dialog `#radix-_r_*_` (role=dialog) with input
   `input[placeholder="Search chats..."]`.
3. `browser:type --selector 'input[placeholder="Search chats..."]' --text '<q>'`
4. Re-read `--include-portals` → results enumerate as
   `a[aria-label="<conversation title>"]` (role=link).
   Verified: query `Python` → 15 result links live.
Completion gate: ≥1 result link after typing; `Escape` to close.

---

## chatgpt-agent-mode — EXPLORED_PATH_KNOWN  ✅ CRACKED (entry verified, NOT executed)

Lives in the composer `+` → **`More`** Radix hover-intent submenu
(body-level portal). The new `browser:hover --dwell-ms` issues a real
CDP pointer-dwell (telemetry: `ok:true`, `mouseMovedEvents:5`,
`dwellMs` honored) which DOES open the hover-intent submenu;
`--include-portals` then traverses the portal.

**Recipe (reproduced cleanly ≥2×):**

1. Fresh chat: `browser:open "https://chatgpt.com/" --profile chatgpt --tab-id <id>`; settle ~3-4s.
2. Open composer plus menu:
   `browser:click --tab-id <id> --profile chatgpt --selector '#composer-plus-btn'`
   — **precondition gate:** poll `browser:read --include-portals --mode lite`
   until a `role=menuitem` named `More` is present (the `#composer-plus-btn`
   click is itself intermittent right after navigation — retry up to 5×
   with ~2s settle until `More` appears). `More` selector is a dynamic
   `#radix-_r_*_` (re-read each open).
3. Sustained hover on `More` (run in background so the dwell stays active):
   `browser:hover --tab-id <id> --profile chatgpt --selector '<More #radix id>' --dwell-ms 5000`
4. While the dwell is active (~1.5s in), read the portal:
   `browser:read --tab-id <id> --profile chatgpt --include-portals --mode lite`

**Observed submenu items** (role=menuitem, body portal):
`Agent mode`, `GitHub`, `OpenAI Platform`.
Completion gate (entry verification only): `--include-portals` read
returns a `role=menuitem` named `Agent mode`.

**Policy stop:** an autonomous ChatGPT Agent task was NOT launched
(forbidden). Verification ends at "entry/submenu reachable".

**Known flakiness:** the submenu-open is intermittent under CDP
synthetic pointer — it opened on ~2 of N attempts in one session. The
hover primitive fires correctly every time (telemetry confirms real
pointer-dwell); the intermittency is Radix hover-intent timing + the
`#composer-plus-btn` open step, not the primitive. Recommended hardening:
the hover and the portal-read should be a single fused CLI step so the
read happens deterministically mid-dwell (filed as a follow-up note).

---

## chatgpt-study-mode — BLOCKED_NEEDS_USER  ❌ STILL BLOCKED (not a tooling limit)

Re-probed thoroughly with the new primitives:
- The `+` → `More` submenu (now reachable via the cracked recipe above)
  contains only `Agent mode`, `GitHub`, `OpenAI Platform` — **no
  "Study mode" / "Study and learn" item** (confirmed across multiple
  clean submenu reads).
- `https://chatgpt.com/study` resolves (URL stays `/study`) but renders
  the ordinary ChatGPT home — no study surface, no flashcard/quiz
  container.
- No composer toggle/pill, no sidebar link, no `study`/`flashcard`/
  `quiz` substring anywhere in the full DOM (`--mode full`).

Conclusion: Study mode is **genuinely absent** from this `Shark Pro`
account's web UI on this build (the prior sweep saw only a transient,
non-deterministic promo modal). This is NOT the Radix-portal tooling
limitation the other two were — the new primitive works but there is no
entry point to drive. Needs the user (see blocked-chatgpt-r2.md).
