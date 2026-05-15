# Stream #4 implementation report — joint 3-AI exercise + RED-tool convergence

Date: 2026-05-15
Status: **COMPLETE** — all 12 `webai_*` capability tools GREEN
(incl. previously-stub `gemini_canvas_to_docs` and the async
`gemini_generate_video`/`task_status` chain), independently
clean-rebuild + different-model verified, shipped to `origin/main`.
See the Addendum for the post-RED capability-closure work.

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

---

## Addendum (2026-05-15) — full capability closure

After the 3 RED image/upload tools went GREEN, the two remaining
non-working capabilities were cracked with the same proven method
(Opus 4.7 max-effort interactive observe-first → different-model
verification → user-provided manual flow when blocked). Sora was
dropped (feature retired by OpenAI).

### `webai_gemini_canvas_to_docs` — GREEN (was permanent HONEST-FAIL)

Old code only sent a prompt and read the Gemini chat URL. Real flow
discovered live: Tools drawer → `menuitemcheckbox "Canvas"` → send →
`share-button` → `export-to-docs-button` → Gemini spawns a
`docs.google.com/document/d/<id>/edit` tab (visible only via raw CDP
`/json/list`; the project extractor filters spawned tabs). Tool now
drives this end-to-end and returns a true Docs URL + doc id. Two
source-grounded sub-fixes: Tools-drawer hydration race (bounded
`waitForSelector`); Canvas turns never render `regenerate-button` so
completion gates on the share-button. Opus run produced doc
`1ouVlS8...`; independent Sonnet run produced a *different* fresh doc
`1VsoKcSMG...` (proves fresh private Doc per run, not cached).
Commit `8d2f891`.

### `webai_gemini_generate_video` + `webai_task_status` — GREEN (was a fake stub)

Old code was a `setImmediate` fake-complete with empty result. Real
Veo flow: Tools drawer → Create video → ~105 s → `Download video` →
CDP artifact-click. First real generation = valid ~1 MB MP4
(`ftypisom`). Surfaced (not masked) a real architectural limitation:
the in-memory per-process task registry + process-bound job meant the
async chain only completed inside one long-lived process.

Per user decision, this was fixed properly (`abd832f`): durable
`web_ai_tasks` rows in the existing `CapabilityDatabase` (new
migration + schema) + a detached `child_process` worker
(`{detached:true}.unref()`) that runs the unchanged Veo flow and
outlives the starting CLI process. Per-profile `PROFILE_LEASE_BUSY`
serialization preserved; abandoned tasks become terminal
`COMMAND_TIMEOUT`; terminal success requires a real MP4. Live
cross-process e2e (Sonnet, r10): Process A returns the 5-key envelope
and exits <1 s; a *separate* Process B polls `webai:task-status` and
observes `running → done`; real 2.0 MB `ftypisom` MP4 on disk; a
fresh process also reads `done`. The cross-process `INVALID_ARGS`
limitation is fully resolved.

### Final capability matrix (12/12 GREEN)

| Service | Tools GREEN |
|---|---|
| ChatGPT | send_prompt, upload_and_query, generate_file, generate_image |
| Claude | send_prompt, upload_and_query, generate_file |
| Gemini | send_prompt, upload_and_query, generate_image, canvas_to_docs, generate_video (+ task_status async helper) |

All clean-rebuild verified (`rm -rf dist && npm run build`),
different-model re-verified, `consumer-contract-1.3.0` unchanged
(durability is internal; only the docs durability sentence changed),
no regressions. Method retro and durable lessons captured to project
memory (clean-build-before-resmoke; Opus-max for hard subagents;
ask-user-for-manual-flow-when-stuck).

### Method validation

The Opus-interactive-observe-first → different-model-verify →
ask-user-for-manual-flow loop converged every capability that 5
rounds of blind prompt-only codex dispatch could not. Deterministic
backend work (the durable registry + detached worker) was correctly
routed to codex via `omx exec` and converged in one round, since that
class of work does not need live-browser observation.

### Remaining exploration frontier (new capabilities, not regressions)

Not built (out of Stream #4 scope; candidates for a future stream):
ChatGPT Canvas export, Claude Artifacts export (the largest per-service
asymmetry — Claude has only 3 tools), Deep Research as a first-class
cross-service `webai_` tool, explicit model/tier selection, and
conversation management. Sora is retired and excluded.
