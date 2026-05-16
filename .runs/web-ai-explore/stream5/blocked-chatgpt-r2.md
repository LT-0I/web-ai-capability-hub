# Stream #5 — ChatGPT round-2 block (after BP1 primitive re-discovery)

Session 2026-05-15, profile `chatgpt`, CDP 9223, account `Shark Pro`.
Re-attempted the 3 tooling-blocked features with the new
`browser:hover --dwell-ms --settle-selector` + `browser:read
--include-portals` primitives.

Result of the 3:
- `chatgpt-conversation-management` → **CRACKED** (EXPLORED_PATH_KNOWN).
- `chatgpt-agent-mode` → **CRACKED**, entry/submenu reachable
  (EXPLORED_PATH_KNOWN; task NOT executed per policy).
- `chatgpt-study-mode` → **STILL BLOCKED** — see below.

---

## chatgpt-study-mode — BLOCKED_NEEDS_USER

**What we did this round (genuine effort, new primitives)**
- Cracked the `+` → `More` Radix hover-intent submenu with sustained
  `browser:hover --dwell-ms` + `browser:read --include-portals`
  (the same path that revealed `Agent mode`). The fully-revealed
  `More` submenu contains exactly: `Agent mode`, `GitHub`,
  `OpenAI Platform`. **There is no Study item there.**
- `https://chatgpt.com/study` — loads but renders the normal ChatGPT
  home (URL stays `/study`, no study/flashcard/quiz UI).
- Full-DOM scan (`browser:read --include-portals --mode full`) on a
  fresh chat and on `/study`: zero `study` / `flashcard` / `quiz` /
  `tutor` interactive controls; the only "learn" hit is generic
  boilerplate ("Learn more").
- No composer toggle, no sidebar link, no working hash route.

**Why still blocked (NOT a tooling limitation)**
Unlike the other two, this is not the Radix-portal limitation — the
new primitive works. Study mode simply has **no drivable entry point**
in this account's web UI on the current build. The prior sweep only
ever saw a transient, non-deterministic "Study Mode" promo modal.

**Precise question for the user**
1. On the `Shark Pro` account in the ChatGPT web UI, is "Study mode" /
   "Study and learn" actually available? If yes, exactly where —
   composer `+`/`More`? a pill/toggle? a route? a specific GPT
   ("Study and learn" GPT in the GPT store)? Please give the exact
   menuitem text + `data-testid`/`aria-label` (DevTools) and the
   full entry click-path.
2. Is it gated behind an A/B flag or a one-time promo modal? If it
   only appears via the promo modal, what is the modal's trigger and
   the post-accept surface (route + completion-gate selector for the
   flashcard/quiz container)?
3. If Study mode is not enabled for this account/build, please confirm
   `chatgpt-study-mode` should remain BLOCKED for this campaign (i.e.
   drop it from the integration target, not an engineering fix).

---

## Engineering follow-up note (not a user question)

The `chatgpt-agent-mode` / `chatgpt-conversation-management` recipes
work but the `More`-submenu open is intermittent because the hover and
the portal-read are two separate CLI calls racing the Radix
hover-intent timer. Recommend a fused primitive
(`browser:hover --settle-selector` that internally re-reads the portal
while the dwell is still active, or a `browser:read --during-hover
<selector> --dwell-ms`) so the submenu capture is deterministic.
File under Phase B2.
