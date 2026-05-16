# Stream #5 — Claude tools LIVE FINAL re-verify (round 3, focused)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224) · Build: existing round-2 `dist/` (NO rebuild) · Model: Sonnet (cheap, compliant)

Scope: confirm ONLY the still-failing Claude tools after the round-2 surface-hydration
navigation bugfix, plus zero-regression on the round-1 GREEN ones.

## Counts

- Tools/sub-tools exercised: 11
- VERIFIED_GREEN: 8 (deep-research, task-status, workspace, send-prompt, conversation-manage read, design:create-project, design:present, conversation-manage destructive=GUARD_OK)
- GUARD_OK: 1 (conversation-manage destructive refusal)
- FAILED (honest stable contract code, no raw Playwright leak, no fabrication): 2 (design:generate, design:get-html)
- DEFERRED_QUOTA: 0 (design surface is provisioned & live — not quota-walled)

## Round-2 bugfix verdict: LANDED for 3 of the 5 previously-FAILED tools

The round-2 fix (navigate to correct surface + wait hydration before probing the
composer / design DOM) **fixed**:

1. **`webai:claude:deep-research` — FIXED → VERIFIED_GREEN.** Round-2 failed pre-queue
   with `ELEMENT_NOT_FOUND` (deep-research-specific fresh-navigation hydration race).
   Now returns a real `{task_id, status:queued}` envelope. `webai:task-status` then
   resolves that REAL task_id (`status:queued`, `progress_label`) — round-2 could only
   test the invalid-id path. Both GREEN.
2. **`webai:claude:design:create-project` — FIXED → VERIFIED_GREEN.** Round-2
   `ELEMENT_NOT_FOUND`. Now lands on the live `claude.ai/design` surface and creates a
   real project (`projectUrl` + `projectId`).
3. **`webai:claude:design:present` — FIXED → VERIFIED_GREEN.** Round-2 `ELEMENT_NOT_FOUND`.
   Now returns a real `presentUrl` resolving `?file=Hello.html`.

## Still FAILED (residual, honest, stable codes — 2 design tools)

4. **`webai:claude:design:generate` — FAILED `POSTCONDITION_TIMEOUT`.** PROGRESSED:
   round-2 it failed pre-submit (`ELEMENT_NOT_FOUND`); now it reaches the live surface
   and submits, but the CLI's success postcondition (wait for the generated design /
   HTML viewer to be ready) is not satisfied within the timeout. The terminal code is
   a STABLE contract code, no raw Playwright string, no fabricated artifact.
   **Root cause:** `present` (#5d) later resolved `?file=Hello.html`, proving generation
   *did* complete server-side after the CLI gave up. So the residual defect is a
   too-short / wrong postcondition wait (or a postcondition selector that does not match
   the completed-generation DOM state) — **not** a failure to generate.

5. **`webai:claude:design:get-html` — FAILED (artifact-not-HTML).** Returned a real
   sha256 (`1045775b7d54...`), a real `savedPath`, `byteSize:77`, and **zero
   forbidden fields** (no `html`/`dom`/`screenshot`; no raw Playwright string). BUT the
   acceptance criterion "REQUIRE a real HTML artifact (HTML file type)" is **NOT met**:
   `file` reports `ASCII text`, and the entire 77-byte content is a single bootstrap
   loader URL: `https://019e2c78-...claudeusercontent.com/_bootstrap` — not an HTML
   document.
   **Root cause:** because #5b hit `POSTCONDITION_TIMEOUT`, the design iframe had not
   rendered actual HTML; the iframe only exposed a `_bootstrap` loader URL. get-html
   captured that string verbatim, wrote it with a `.html` extension, sha256'd it, and
   returned ok-shaped output keys. **The bug:** get-html does not validate that the
   captured iframe content is real HTML markup before persisting + hashing it — it
   should have failed with a stable code (e.g. `ARTIFACT_VERIFICATION_FAILED`) rather
   than saving a non-HTML bootstrap-URL stub. The sha256 is the true hash of the
   77-byte stub (NOT fabricated), but the artifact is not a valid design HTML capture.

## Zero-regression on round-1 GREEN tools — CONFIRMED

- **`webai:claude:workspace`** (integrations, skills) — GREEN, all 3 always_present
  keys, control-count variance benign.
- **`webai:claude:send-prompt --tab-url-contains "/new" --model sonnet`** — GREEN.
  Core fix holds: tab honored (no `/code` forcing), Sonnet sticks, real PONG response
  on a real `claude.ai/chat/<uuid>`. One documented arg variation was needed (same
  drift-then-green pattern as round-2): the first attempt returned an HONEST
  `MODEL_SELECTION_DRIFT` because the model label was scraped in a transient
  pre-hydration form `"Model: Sonnet 4.6 Adaptive"` (the model *was* Sonnet) — a
  label-parse strictness artifact, NOT the old /code-forcing bug, NOT a tab regression.
- **`webai:claude:conversation-manage`** — read path GREEN; destructive `delete`/`rename`
  architecturally refused (not in action enum). GUARD_OK.

## Honesty / safety statement

- No fabricated success or sha256. The reported sha is the true hash of the 77-byte
  bootstrap-URL stub; it is flagged FAILED precisely because the file is not HTML.
- One clean attempt per tool. send-prompt used exactly one documented arg variation
  (substring-collision vs label-parse distinction), as in round-2. No blind
  retry-rerun.
- All failures carry an exact stable contract code (`POSTCONDITION_TIMEOUT`) + CLI
  JSON + precise root cause. No raw Playwright timeout/locator strings leaked from any
  tool.
- No forbidden fields in any GREEN output (no cdpEndpoint/dom/html/screenshot/etc).
  get-html output contained only contract output keys.
- Cheap Sonnet model only; benign trivial inputs ("PONG", "a page that says Hello",
  "capital of France").
- No leftover tabs (no `r3-cl-*` remained; probe tab freed). Browser NOT relaunched/
  closed (same PID 3329793, still connected). No profiles.json, no dist rebuild, no
  commit, no src/test/config edits, no pkill/pgrep, no Playwright-MCP chrome,
  no noeticbraid.

## Artifacts

- `019e2c78-13a1-70b4-9e59-18d635816ee5-1045775b7d54.html`
  - sha256: `1045775b7d5443c79a7c287679f70eed4ccab2b036689637d6b73b8a43d34ff6`
  - path: `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify3-artifacts/019e2c78-13a1-70b4-9e59-18d635816ee5-1045775b7d54.html`
  - 77 bytes, `file`=ASCII text (NOT HTML). Content = bootstrap loader URL only.
    Counted as a FAILED artifact (not a valid HTML capture); sha is real, not fabricated.

## Output paths

- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify3-claude.json`
- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify3-claude.md`
