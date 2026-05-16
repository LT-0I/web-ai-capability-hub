# Stream #5 — Gemini BLOCKED_NEEDS_USER handoff

Campaign: exhaustive Gemini interactive exploration (2026-05-15).
2 of 18 queue features could not be cracked by automation after genuine max effort.
Both are audio/AV-capture features blocked by the same root cause.

---

## 1. gemini-voice-mode — Voice mode (speak to Gemini, get audio response)

**Feature id:** `gemini-voice-mode`
**UI location:** Composer, bottom-right of the prompt box: `button[aria-label="Microphone"]`

**What I tried (max effort):**
- Located `button[aria-label="Microphone"]` reliably on fresh `https://gemini.google.com/app`.
- Clicked it 3+ times (`browser:click ... --confirmed true`) across separate fresh tab allocations.
- After every click: read DOM (lite + full) and took screenshots.

**Observed DOM / behavior:**
- ZERO UI change after each click. No voice overlay, no microphone-permission browser
  dialog, no listening indicator, no error toast. Screenshots
  `2026-05-15T13-07-02` and `2026-05-15T13-10-10` are pixel-identical to the
  pre-click composer.
- The button exists and is clickable; it simply no-ops.

**Root cause (assessed):** The managed automation Chrome (profile `gemini-9225`,
CDP 9225) has **no microphone input device / `getUserMedia` audio source**, so
Gemini's voice entry silently aborts. This is an environmental/hardware gap, not
a selector or timing problem. Voice/audio capture is also outside the benign
text-automation scope of this project.

**Precise question for the user:**
> Is web voice-mode in scope for MCP integration at all (it requires a live
> microphone device + mic permission in the managed Chrome, which the headless
> host does not provide)? If yes, please either (a) provision a virtual audio
> input device for the `gemini-9225` Chrome and grant mic permission, or
> (b) confirm voice-mode should be marked permanently `OUT_OF_SCOPE` (no audio
> capture surface). Without a mic device the feature is physically unreachable
> via browser automation.

---

## 2. gemini-live-mode — Live mode (real-time video/screen + audio conversation)

**Feature id:** `gemini-live-mode`
**UI location:** Per the library, "Composer → Live mode button". In this web
build there is **no standalone Live button**; Live is reached through the
voice/microphone flow (Gemini Live).

**What I tried (max effort):**
- Probed for a dedicated Live entry: `button[aria-label*="Live" i]`,
  `button[aria-label*="real-time" i]`, `a[href*="live"]`,
  `button[data-test-id*="live"]` — **zero matches**.
- Verified the top-right dashed-square icon (a plausible "Live" candidate from the
  screenshot) is actually `button[aria-label="Temporary chat"]`, not Live.
- The only audio entry point is `button[aria-label="Microphone"]`, which itself
  no-ops (see feature #1).

**Observed DOM / behavior:**
- No Live-mode element rendered anywhere in the web composer/top-bar for this
  account/build. Live is gated behind the voice flow, which is blocked.

**Root cause (assessed):** Double block — (1) this Gemini **web** build does not
render a dedicated Live-mode button for this account (Live is mobile-app /
mic-device gated), and (2) the voice entry it would route through no-ops without
a microphone device. Real-time audio/video/screen capture is also outside the
benign text-automation scope.

**Precise question for the user:**
> Is Gemini Live (real-time AV) expected to be reachable from the **web** UI for
> this account, or is it mobile-app only? If web-reachable, please share the
> exact manual UI steps you use to enter Live mode (which element, which page),
> and confirm whether a microphone/camera device should be provisioned for the
> managed Chrome. Otherwise this should likely be `OUT_OF_SCOPE` (no AV-capture
> surface in scope).
