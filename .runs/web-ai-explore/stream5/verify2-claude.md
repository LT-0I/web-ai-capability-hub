# Stream #5 — Claude tools LIVE re-verification (Phase C consolidated bugfix)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224) · Build: existing `dist/` (no rebuild) · Model: Sonnet (cheap, compliant)

## Counts

- Tools/sub-tools exercised: 11
- VERIFIED_GREEN: 5  (workspace, send-prompt, task-status, conversation-manage read, ...)
- GUARD_OK: 1  (conversation-manage destructive refusal)
- FAILED (honest stable contract code, no raw Playwright leak): 5  (deep-research; design create/generate/get-html/present)
- DEFERRED_QUOTA: 0  (design surface is provisioned & live — not quota-walled)

## What the Phase C fix DID land (confirmed)

1. **Composer "+" selector fix — WORKS for workspace.** All 3 previously-FAILED surfaces
   (`integrations`, `skills`, `style_presets`) now read without error; the 2 previously-GREEN
   (`projects`, `appearance`) did not regress. The selector was updated to the live Claude DOM
   (`button[aria-label="Add files, connectors, and more"]` / `button[aria-label="Upload files"]`)
   and verified present via `browser:read` (real `<button aria-haspopup=menu>`).

2. **send-prompt tab-targeting + model-stick — FIXED.** Prior run always forced
   `chat_url=https://claude.ai/code` (ignoring `--tab-url-contains`) → MODEL_SELECTION_DRIFT,
   `wait_ms:0`, no submission. Now with `--tab-url-contains "/new" --model sonnet` it lands on a
   real `claude.ai/chat/<uuid>`, the Sonnet model sticks (`model_used:"Sonnet 4.6Adaptive"`, no
   drift), and the prompt completes (`response_text:"...PONG"`, `wait_ms:3788`,
   `completion_detected:true`). No /code forcing. No forbidden fields.

3. **Design sub-MCP contract-leak — FIXED across the whole lane.** Prior run leaked raw
   `page.waitForSelector: Timeout … exceeded` strings (the #1 defect). All four design tools
   (`create-project`, `generate`, `get-html`, `present`) now return the **stable taxonomy code
   `ELEMENT_NOT_FOUND`** with zero Playwright internals. `get-html` output carries only contract
   keys — **no `html`/`dom`/`screenshot` forbidden fields** — and produces no fabricated artifact
   (honest pre-artifact failure, the banned-fallback-correct behavior).

## What is still FAILED (residual, but honest)

- **deep-research**: still `ELEMENT_NOT_FOUND` on the composer "+" even though the IDENTICAL
  selector now succeeds for `workspace`. The selector is correct and present in the live DOM
  (verified). Root cause is deep-research-SPECIFIC code path — most likely a fresh-navigation
  hydration/timing race (probes composer before mount) or a context-traversal gap that the
  workspace tool handles but deep-research does not. Failed pre-queue → no `task_id` envelope.
- **design create-project / generate / get-html / present**: surface is live & provisioned
  (NOT quota-walled — `browser:read` of `claude.ai/design` shows "Project name/Wireframe/High
  fidelity/Create/Recent" all present), but the sub-MCP does not land on / operate the live
  surface. Same defect family as deep-research (fresh-tab navigation not reaching the live page).
  Now fails honestly with `ELEMENT_NOT_FOUND` instead of leaking Playwright strings.

## Honesty / safety statement

- No fabricated success. One clean attempt per tool (plus one documented arg-variation for
  send-prompt that distinguished the substring-collision artifact from the old /code bug).
- No blind retry-rerun. All failures carry an exact contract error code + CLI JSON + root cause.
- Confirmed: NO raw Playwright timeout/locator strings leak from ANY tool this run.
- No forbidden fields in any GREEN output (no cdpEndpoint/dom/html/screenshot/etc).
- Cheap Sonnet model only; benign trivial inputs ("PONG", "a page that says Hello").
- Only my own `rv-claude-*` tabs were allocated and freed. No relaunch/close, no profiles.json,
  no dist rebuild, no commit, no src/test/config edits, no pkill/pgrep, no Playwright-MCP chrome.

## Artifacts

- No design artifact produced — `get-html`/`generate` failed honestly pre-artifact (correct;
  fabrication / local synthesis is banned). No sha256 to report.

## Output paths

- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify2-claude.json`
- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify2-claude.md`
