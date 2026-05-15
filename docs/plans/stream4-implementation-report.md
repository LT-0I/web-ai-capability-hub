# Stream #4 implementation report — joint 3-AI exercise + RED-tool convergence

Date: 2026-05-15
Status: **COMPLETE** — all targeted RED `webai_*` tools GREEN,
independently clean-rebuild verified, shipped to `origin/main`.

## Scope

Stream #4 drove the 13 `webai_*` MCP tools from partial coverage to a
verified-working state via live ChatGPT/Claude/Gemini exercise, then
fixed every remaining RED tool. Contract held at
`consumer-contract-1.3.0` (no bump) throughout.

## Delivered (commits on `main`)

- `a3eb02c` — **Gemini `upload_and_query` filechooser fix.** Clicking
  Gemini's "Upload files" menu item opened Chrome's native OS file
  dialog (modal GTK), freezing the browser/CDP (reproduced live 2×).
  Replaced the stale `input[type=file]` `setInputFiles` path with
  Playwright filechooser interception
  (`Promise.all([page.waitForEvent('filechooser'), click])` →
  `chooser.setFiles()`). ChatGPT/Claude upload branch untouched.
- `16d7c30` — final-converge selectors + HIGH-confidence DOM evidence
  (`dom-probe-r2.md`) + `HANDOFF.md` (interim: blind-dispatch exhausted).
- `1d55e66` — **all 3 remaining RED tools GREEN**, clean-rebuild
  verified:
  - `webai_gemini_generate_image` — fresh-composer nav + Create-image
    activation; real PNG on disk, `errorCode:null`.
  - `webai_gemini_upload_and_query` — completion gate keyed on the
    extractor-visible `button[data-test-id="regenerate-button"]`
    (latest turn) instead of extractor-invisible
    `model-response`/`message-content`/`data-response-id`;
    `response_text` scoped to the latest `<model-response>
    .model-response-text` so it no longer scrapes the nav sidebar /
    cross-conversation history. Clean correct answer verified twice.
  - `webai_chatgpt_generate_image` — image-mode entry hardened (single
    wrapped radio click, no raw-Playwright-error leak; emits stable
    `ELEMENT_NOT_FOUND`); download follows the user-provided manual
    flow: click the rendered image → fullscreen `[role="dialog"]` →
    `button[aria-label="Save"]` → mandated CDP `browser:artifact-click`
    (`Browser.setDownloadBehavior` + `Input.dispatchMouseEvent`). Real
    1254×1254 PNG on disk, `errorCode:null`. The old speculative
    `z-11`-ancestor XPath was removed.

## Verification

- Clean rebuild (`rm -rf dist && npm run build`) exit 0.
- `npm test` 152/152 pass.
- `configs/consumer-contract.json` unchanged at
  `consumer-contract-1.3.0`; no `configs/` change; sensitive-field
  classification unchanged.
- Live re-smoke evidence (ground truth) in
  `.runs/web-ai-explore/stream4-joint-work-2026-05-14/`:
  `resmoke-r6-*.json`, `resmoke-r7-*.json`, `dom-probe-r2.md`,
  `interactive-debug-r6.md`, `interactive-debug-r7.md`,
  `HANDOFF.md`.
- No silent fallback / no local artifact synthesis — every failure
  path returns a stable contract error code.
- No regression: filechooser interception, `gemini_generate_image`
  download chain, ChatGPT/Claude upload+send+completion unaffected.

## What worked / what did not (method retro)

- **Blind codex dispatch did NOT converge** the 3 image-mode/completion
  tools: 5 rounds, each evidence-grounded, all 0/3 GREEN. Root reasons:
  (a) prompt-only codex cannot observe the live automated-interaction
  layer (e.g. a menu that opens under CLI click but not under the
  tool's Playwright `.click()`); (b) a **stale `dist/`** made re-smokes
  run the old build, masking correct fixes for ~5 rounds.
- **Opus max-effort interactive observe-first debugging converged in
  2 rounds:** drive the real browser via the project CLI, read live
  DOM between steps, isolate the exact divergence, then a minimal
  source-grounded fix + clean rebuild + one re-smoke.
- **Asking the user for the manual UI flow** (ChatGPT image download)
  beat exhaustive blind DOM probing immediately.

## Durable lessons (captured to project memory)

- Clean-rebuild (`rm -rf dist && npm run build`) before any live
  re-smoke; treat "build/test pass but live fails identically" as a
  stale-artifact suspicion.
- Use Opus max-effort for hard / non-converging subagent work.
- When an automation UI path is blocked/unknown, ask the user for the
  manual steps and mirror them instead of blind-probing.
- ChatGPT generated-image download path (no inline button → image
  detail dialog → Save).
- `browser:read --tab-id` requires `--profile` (else defaults to 9222).
- Never `pkill -f` a pattern containing `data/browser-profiles/`
  (self-matches the shell). A separate `noeticbraid` project shares the
  host — never kill its processes.

## Follow-ups (none blocking)

- Optional: extend the ChatGPT image-detail-dialog download path test
  coverage with a recorded DOM fixture for regression hardening.
- Optional: fold the Stream #4 selectors into a recorded green trace
  (per v2 plan §C record-and-replay) for drift resilience.
