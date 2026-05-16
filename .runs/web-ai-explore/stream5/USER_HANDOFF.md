# Stream #5 — User Handoff

Campaign: Stream #5 — Exhaustive interactive web-AI feature exploration
Contract: consumer-contract-1.4.0
Updated: 2026-05-15

**Everything not listed below is IMPLEMENTED_GREEN and auto-callable via the 35 `webai_*` MCP tools.
Only the 7 items in Section A require a user decision before they can be resolved.**

Section B (tooling-limitation blocks) from the prior draft is now closed: all tooling blocks
were resolved by the BP1 primitives (`browser:hover --dwell-ms` + `browser:read --include-portals`).
`chatgpt-conversation-management` and `chatgpt-agent-mode` entry were both cracked; the
`chatgpt-codex` sub-MCP is scaffolded as a policy-gated placeholder. No tooling items remain open.

---

## Section A — Items requiring a user decision

### 1. chatgpt-voice-mode — Voice mode (Advanced Voice / GPT-4o audio)

**Feature id:** `chatgpt-voice-mode`
**Root cause:** The headless automation Chrome (profile `chatgpt`, CDP 9223) has no
microphone or audio-playback device. First-time activation also requires clicking
'Continue' in a consent overlay that enables durable voice-recording storage — a
forbidden permanent account-state change.

**Question for the user:**
Is web Voice mode in scope for MCP integration? It requires a live microphone device
that the headless host cannot provide. If yes, should a virtual audio device be
provisioned for the managed Chrome, or should voice be represented as text-transcript
only? If the consent gate may be clicked, please confirm and describe the post-consent
UI (selector for the stop/hang-up control).

---

### 2. chatgpt-pulse — Pulse (research digest / news briefing)

**Feature id:** `chatgpt-pulse`
**Root cause:** Activating Pulse requires clicking 'Get started' in an onboarding modal,
which is a durable account-onboarding state change explicitly forbidden by the campaign
rules. The onboarding modal was observed live and dismissed via 'Close onboarding'
without activation.

**Question for the user:**
May we click 'Get started' to complete Pulse onboarding (this is a durable account state
change)? If yes, please describe the post-onboarding Pulse surface — its route or
selector, where the daily digest renders, and the completion-gate selector. If the click
is not authorized, confirm Pulse should remain BLOCKED for this campaign.

---

### 3. chatgpt-atlas-browser — Atlas browser (AI-guided web browsing agent)

**Feature id:** `chatgpt-atlas-browser`
**Root cause:** No drivable in-web-UI entry point was found for an AI-guided browsing
agent on this account. The composer '+' menu was fully enumerated via BP1 and the 'More'
submenu was cracked (Agent mode / GitHub / OpenAI Platform — no Atlas item). No sidebar
link, no working hash route, no full-DOM match.

**Question for the user:**
For this Shark Pro account, is there an in-`chatgpt.com` entry point for AI-guided web
browsing (a route, a composer toggle, or an item under '+' → 'More')? Or does "Atlas
browser" refer to the separate OpenAI Atlas desktop browser application, which is out of
scope for this web-automation project?

---

### 4. chatgpt-study-mode — Study mode (flashcards, quizzes from uploaded content)

**Feature id:** `chatgpt-study-mode`
**Root cause:** Not a tooling limitation. The BP1 primitive successfully opened the
'+' → 'More' Radix hover-intent submenu. Its full contents are: 'Agent mode', 'GitHub',
'OpenAI Platform'. There is no Study item. `https://chatgpt.com/study` loads the
ordinary ChatGPT home with no study UI. A full-DOM scan found zero study/flashcard/quiz
interactive controls.

**Question for the user:**
Is "Study mode" actually available on the Shark Pro account in the current ChatGPT
web build? If yes, please give the exact entry point (menuitem text, `data-testid` or
`aria-label`, full click path). Is it gated behind an A/B flag or a one-time promo
modal? If it is not enabled for this account, please confirm `chatgpt-study-mode` should
remain BLOCKED for this campaign.

---

### 5. gemini-voice-mode — Voice mode (speak to Gemini, get audio response)

**Feature id:** `gemini-voice-mode`
**Root cause:** The managed automation Chrome (profile `gemini-9225`, CDP 9225) has no
microphone input device / `getUserMedia` audio source. `button[aria-label="Microphone"]`
is present and clickable, but silently no-ops — confirmed across 3+ click attempts with
screenshots (no voice overlay, no permission dialog, no UI change).

**Question for the user:**
Is web voice-mode in scope for MCP integration? It requires a live microphone device
that the headless host cannot provide. If yes, please either (a) provision a virtual
audio input device for the `gemini-9225` Chrome and grant mic permission, or (b) confirm
voice-mode should be permanently marked OUT_OF_SCOPE for this campaign.

---

### 6. gemini-live-mode — Live mode (real-time video/screen + audio conversation)

**Feature id:** `gemini-live-mode`
**Root cause:** Double block. (1) This Gemini web build does not render a dedicated
Live-mode button for this account — four probes found zero matches. The top-right
dashed-square icon is `button[aria-label="Temporary chat"]`, not Live. (2) Live is
gated through the voice flow (`button[aria-label="Microphone"]`), which itself no-ops
due to the missing mic device above.

**Question for the user:**
Is Gemini Live (real-time AV conversation) expected to be reachable from the web UI for
this account, or is it mobile-app only? If web-reachable, please share the exact manual
UI steps to enter Live mode and confirm whether a microphone and camera device should be
provisioned for `gemini-9225`. Otherwise, confirm this should be marked OUT_OF_SCOPE.

---

### 7. chatgpt-codex — ChatGPT Codex sub-MCP (needs sandbox repo to go live)

**Feature id:** `chatgpt-sidebar-codex`
**Root cause:** The `chatgpt-codex` sub-MCP is fully scaffolded and registered in the
contract (4 tools: `list-envs`, `submit-task`, `task-status`, `get-diff`). Every
connected Codex environment is a real GitHub repo including the forbidden `noeticbraid`.
The handlers intentionally return `SUBMCP_NOT_PROVISIONED` until a throwaway sandbox
repo is supplied.

**Question for the user:**
Please supply a throwaway sandbox GitHub repository (any repo where the automation may
create branches and PRs freely without concern). Once provided, the `chatgpt-codex`
sub-MCP can be wired to that repo and moved from placeholder to live status. The repo
can be empty; it just needs to be a connected Codex environment in the ChatGPT UI.

---

*End of USER_HANDOFF.md — everything else is IMPLEMENTED_GREEN and auto-callable.*
