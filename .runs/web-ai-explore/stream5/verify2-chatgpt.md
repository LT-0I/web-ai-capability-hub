# Stream #5 — ChatGPT Phase-C re-verification (verify2)

Session 2026-05-15 · profile `chatgpt` · CDP 9223 · tab `rv-cg-main`
(allocated + freed) · account `Shark Pro` · model `Thinking` (never Pro).
Build: pre-built `dist/` (no rebuild). One clean attempt per tool, no
blind retry-rerun. Browser not relaunched/closed.

## Verdict counts

| status          | count | tools |
|-----------------|-------|-------|
| VERIFIED_GREEN  | 2     | workspace (7 surfaces), conversation-manage/navigate_settings |
| GUARD_OK        | 3     | conversation-manage/delete, codex:list-envs, task-status |
| FAILED          | 4     | canvas-export, conversation-manage/share, deep-research, send-prompt |

**Phase C did NOT clear the 4 previously-FAILED ChatGPT tools.** The
selectors/paths were changed, but each still fails for a refined root
cause. The 5 GREEN/GUARD surfaces did NOT regress.

## Previously-FAILED — re-verify result

### 1. canvas-export — STILL FAILED
- Built real canvas doc (Thinking): `https://chatgpt.com/c/6a074371-f3b0-83e8-a493-8f14aa14802e`, body `alpha-one / beta-two / gamma-three`, title `RV2 Canvas Probe` (content verified live).
- `{"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error":"No element matched --button-selector","evidence":{"selector":"[role=\"button\"]:has-text(\"Download\"), button[aria-label=\"Download\"], [id^=\"radix-\"][role=\"button\"]:has-text(\"Download\")","pageUrl":"https://chatgpt.com/c/<conversation-id>","frameCount":1,"triedFrames":[{"hadSelectorMatch":false}]}}`
- No artifact, **no sha256** (no fabricated success). Process also exit-124 (hung after emitting error).
- **Root cause:** Phase C broadened the selector but it still cannot match. Live DOM ground truth: the Download control is a native `<button id="radix-_r_4h_" type="button" aria-haspopup="menu" aria-expanded="false">` whose accessible name "Download" comes from **text content** — it has **no explicit `role="button"` attribute and no `aria-label`**. All three OR-branches require an explicit `role="button"` CSS attribute or `aria-label="Download"`, neither present on a native `<button>`. A working selector would be `button:has-text("Download")` or `button[aria-haspopup="menu"]:has-text("Download")`.
- Secondary unfixed bugs: `pageUrl` still emits literal `<conversation-id>` placeholder; tool hangs (exit 124) after the error.
- Note: omitting `--profile` makes canvas-export hit CDP **9222** (default) → `ECONNREFUSED`. `--profile chatgpt` is required and was used for the recorded attempt.

### 2. conversation-manage --action share — STILL FAILED
- `{"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error":"ELEMENT_NOT_FOUND: ChatGPT share conversation button was not found","evidence":{"selector":"button[aria-label=\"Share\"]"}}`
- Phase C DID update the selector (was `button[data-testid="share-chat-button"]` → now `button[aria-label="Share"]`).
- **Root cause changed — NOT selector drift this round.** Live wide-viewport DOM read shows the element IS present and matches the tool's exact selector: `{ref:e86, role:button, name:'Share', visible:true, disabled:false, attributes:{aria-label:'Share', data-testid:'share-chat-button', class:'… max-sm:hidden'}}`. The class includes **`max-sm:hidden`** — the header Share button is responsive-collapsed (`display:none`) at narrow viewport widths. The tool drives the page at a narrow default viewport where the button is hidden, so Playwright finds no visible match. Viewport/responsive-handling bug; the selector fix was correct but insufficient.
- Stopped before publish (dialog never opened — honest failure, nothing public created).

### 3. deep-research — STILL FAILED (failure mode improved)
- `{"response_text":"","elapsed_ms":0,"completion_detected":false,"errorCode":"MODEL_SELECTION_DRIFT","ok":false,"model_used":"Recents","expected_model":"Thinking","conversation_id":null,"chat_url":"https://chatgpt.com/"}`
- Robust interaction path IS now in place (structured envelope, no more bare Playwright click-interception crash). But no `task_id` — aborted on drift guard before submission.
- **Root cause:** model-detection scraper bug. Composer was genuinely on **Thinking** (verified live, never Pro), but the tool reads **"Recents"** (the sidebar Recents heading) as the active model and fires a false-positive `MODEL_SELECTION_DRIFT`.

### 4. send-prompt (Thinking) — STILL FAILED
- `{"response_text":"","elapsed_ms":18008,"completion_detected":false,"errorCode":"MODEL_SELECTION_DRIFT","ok":false,"model_used":"Recents","expected_model":"Thinking"}`
- Robust path in place (reached `elapsed_ms:18008`, structured envelope, no crash).
- **Root cause:** identical to deep-research — faulty model-name detection reading "Recents" sidebar text → false-positive `MODEL_SELECTION_DRIFT` abort before send. "Model sticks / no drift" acceptance criterion NOT met (drift fired, from a detection bug not real drift).

## Regression — previously GREEN/GUARD (no regression)

- **workspace** 7 surfaces: all GREEN, `{surface,url,summary}`-only, forbidden-field scan CLEAN.
- **conversation-manage/navigate_settings**: GREEN (`#settings/DataControls`).
- **conversation-manage/delete**: GUARD_OK (`HUMAN_HANDOFF_REQUIRED`, no force/fallback).
- **codex:list-envs**: GUARD_OK (`SUBMCP_NOT_PROVISIONED`, intended gated placeholder).
- **task-status** synthetic id: GUARD_OK (`INVALID_ARGS`).

## Cross-cutting root-cause summary (for the next bugfix dispatch)

1. **canvas-export**: selector OR-set assumes explicit `role="button"`/`aria-label` attributes that native ChatGPT `<button>` canvas controls do not carry. Use a text/`aria-haspopup` based selector. Also fix `<conversation-id>` placeholder leak and the post-error hang (exit 124).
2. **conversation-manage/share**: selector is now correct; failure is the automation viewport being narrow enough that `max-sm:hidden` removes the header Share button. Needs a wider viewport or the narrow-mode (conversation-options menu) Share path.
3. **deep-research + send-prompt**: shared model-detection helper scrapes the sidebar "Recents" heading as the active model, causing false-positive `MODEL_SELECTION_DRIFT`. The model was genuinely Thinking. Single shared fix unblocks both.

## Honesty / safety

No fabricated success or sha256. One clean attempt per tool; failures
reported with exact contract code + CLI JSON + live-DOM-grounded root
cause; no blind retry-rerun. Nothing public created (share stopped
before any dialog/link). No autonomous Agent task, no Codex task. No
dist rebuild, no commit, no src/test/config edits, no browser
relaunch/close, no profiles.json touched. Allocated tab freed; browser
left running.

Output paths:
- `.runs/web-ai-explore/stream5/verify2-chatgpt.json`
- `.runs/web-ai-explore/stream5/verify2-chatgpt.md`
