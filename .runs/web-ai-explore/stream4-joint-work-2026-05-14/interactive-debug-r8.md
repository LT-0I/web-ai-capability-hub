# Stream #4 — Interactive Debug R8 (observe-first, live-browser)

Date: 2026-05-15. Method: project CLI only (`browser:tab:alloc|free|list|read|
click|type|press|status`) for live DOM observation + tab hygiene; raw CDP
`/json/list` (read-only) to see browser-spawned tabs the project extractor
filters out. NO Playwright MCP. NO raw codex/omx. NO process kill/launch/
restart. All `dbg4-` tabs freed; verified zero leak on gemini-9225 (9225).

Result: **BOTH targets driven to GREEN for their real flows.** Build exit 0,
`npm test` 154/154, `consumer-contract-1.3.0` unchanged, no commit, no
regression. One genuine pre-existing architectural limitation surfaced for
Target 2 (cross-CLI-process task polling) — flagged honestly, not masked.

Starting state: both tools were stubs. `canvasToDocs` only called
`sendPromptOnPage` then read `result.chat_url` (always a Gemini URL → permanent
HONEST-FAIL). `startGeminiVideoTask` was a `setImmediate` placeholder that
faked `status:"complete"` with an empty `{path:"",sha256:"",size_bytes:0}` and
never opened a browser.

---

## TARGET 1 — webai_gemini_canvas_to_docs

### Observed real UI flow (literal live DOM, gemini-9225, account "Shark 7", Fast tier)

Fresh composer `gemini.google.com/app` — interactive elements confirmed:
`button.toolbox-drawer-button` (aria-label "Tools", `aria-haspopup="menu"`),
`div[aria-label="Enter a prompt for Gemini"]` (the `.ql-editor` textbox),
`button[aria-label="Open mode picker"]` showing **"Fast"** (active tier — NOT
changed; "PRO" at top is the account badge, not the model).

1. **Activate Canvas:** click `button.toolbox-drawer-button` → drawer menu
   `#toolbox-drawer-menu` lists: Create image / Create video / **Canvas** /
   Deep research / Create music / Guided learning. Each is
   `button[role="menuitemcheckbox"]` with NO data-test-id → robust selector
   `[role="menuitemcheckbox"]:has-text("Canvas")`. After click, the
   active-mode pill becomes **`button[aria-label="Deselect Canvas"]`** (the
   activation signal, mirrors "Deselect Create image"). Canvas has **no**
   zero-state chip (only Create image/music/video do).
2. **Send prompt** in the same textbox → Gemini renders a Canvas document in
   the turn; URL settles to `gemini.google.com/app/<id>`.
3. **Export:** the canvas toolbar exposes
   **`button[data-test-id="share-button"]`** (aria-label "Share and export
   canvas"). Clicking it opens mat-menu `#mat-menu-panel-N` with three items:
   `button[aria-label="Share Canvas"]` (publish-class — NEVER clicked),
   **`button[data-test-id="export-to-docs-button"]`** (role=menuitem, "Export
   to Docs"), `button[aria-label="Copy"]`.
4. **Click "Export to Docs"** → Gemini creates a **private Google Doc** and
   opens it in a **NEW browser tab** at
   `https://docs.google.com/document/d/<DOC_ID>/edit?tab=t.0` (title = doc
   title). Confirmed via raw CDP `/json/list` (the project `browser:read`
   extractor does NOT surface a browser-spawned page; tab:list only tracks
   project-allocated tabs). Docs page appeared within ~14s of the click.
   Doc id extractable: `/^https:\/\/docs\.google\.com\/document\/d\/([^/?#]+)/`.

### Critical secondary discovery (completion DOM)

A completed **Canvas** turn does **NOT** render
`button[data-test-id="regenerate-button"]` ("Redo") — the marker the shared
`waitForPromptCompletion` gemini Phase-B gate requires. A finished Canvas turn
exposes `thumb-up-button`, `copy-button`, `more-menu-button`, version
`undo/redo-button`, **and the `share-button` (data-test-id) "Share and export
canvas"**, but no `regenerate-button`. So the text-completion gate can NEVER
fire for Canvas (always COMMAND_TIMEOUT). The authoritative "Canvas ready"
signal is the appearance of the canvas `share-button` itself.

### Fixes (`src/mcp/tools.ts`, source-grounded, all from the above live obs)

1. New selector constants: `GEMINI_CANVAS_MENUITEM_SELECTOR`,
   `GEMINI_CANVAS_MODE_ACTIVE_SELECTOR`,
   `GEMINI_CANVAS_SHARE_BUTTON_SELECTOR='button[data-test-id="share-button"]'`,
   `GEMINI_CANVAS_EXPORT_DOCS_SELECTOR='button[data-test-id=
   "export-to-docs-button"]'`, `GOOGLE_DOCS_URL_RE`.
2. New `activateGeminiToolMode` helper (generalises the Tools-drawer pattern;
   confirms via the "Deselect <tool>" pill) + `activateGeminiCanvasMode`.
   **Race fix:** the Tools-drawer button mounts post-Angular-hydration; the
   first smoke proved an instant `requireAndClick` raced it → ELEMENT_NOT_FOUND
   at ~0ms (same class as the documented upload-trigger race). Added a bounded
   `waitForSelector(button.toolbox-drawer-button, {timeout:15000})` before the
   click (confirmed live present on the fresh composer).
3. `canvasToDocs` fully rewritten to drive the real flow: navigate fresh →
   `activateGeminiCanvasMode` → send (with `__expectImageResponse` short-
   circuit, since Canvas carries no assistant text and no regenerate-button,
   exactly like the GREEN image path) → wait for the canvas `share-button`
   (Canvas-ready gate; timeout → honest COMMAND_TIMEOUT) → click share →
   click Export to Docs → `awaitSpawnedDocsPage` polls the managed browser
   **context** for the docs.google.com page → extract real doc id → close the
   spawned Docs tab (tidy; never publish/share) → return real
   `docs_url` + `docs_doc_id`. Honest `ELEMENT_NOT_FOUND` /`COMMAND_TIMEOUT`/
   `ARTIFACT_VERIFICATION_FAILED` on genuine absence — NO synthesis, NO
   chrome/chat_url fallback. The publish-deny gate still rejects "Share
   Canvas"; "Export to Docs" is a private-Drive action (not publish-class).
4. Removed now-unused `verifyNoNewPublicLinks` import.

### Verification — GREEN

Two live smokes (the first revealed the activation race → source-grounded
race fix; the second revealed the Canvas completion-DOM divergence →
source-grounded completion-gate fix; the third is the definitive re-smoke):

`resmoke-r8-gemini-canvas-to-docs.json`:
```
docs_url:    https://docs.google.com/document/d/1ouVlS8fqIoe2RdjsHn8utQA58oMJKHp7Q7aXOQLlMvU/edit
docs_doc_id: 1ouVlS8fqIoe2RdjsHn8utQA58oMJKHp7Q7aXOQLlMvU
title:       R8FinalDoc        errorCode: null
```
Real `docs.google.com/document/d/...` URL + valid doc id, `errorCode:null`.
Spawned Docs tab closed by the tool (no `docs.google.com` page lingering in
`/json/list`). Full Canvas → Google Docs export works end-to-end.

---

## TARGET 2 — webai_gemini_generate_video + webai_task_status

### Observed real UI flow (ONE authorized live generation, Fast tier)

1. Fresh composer → click `button.toolbox-drawer-button` →
   `[role="menuitemcheckbox"]:has-text("Create video")`; active pill becomes
   `button[aria-label="Deselect Create video"]`. (Zero-state chip
   `button[aria-label="Create video, button, tap to use tool"]` also exists.)
2. Send prompt via `div[aria-label="Enter a prompt for Gemini"]`. In-progress
   DOM copy: **"Generating your video… This can take 1–2 mins"**.
3. When ready (~105s for an 8s clip): a video player renders with
   **`button[aria-label="Download video"]`** (class `download-button`),
   `Play video`, `Share video` (forbidden — avoided); visibleText
   **"Your video is ready! 0:00 / 0:08"**. `Download video` present == done.
4. CDP artifact-click `button[aria-label="Download video"]` downloads the file.

### Fixes (`src/mcp/tools.ts`)

- New constants `GEMINI_CREATE_VIDEO_MENUITEM_SELECTOR`,
  `GEMINI_CREATE_VIDEO_ZERO_STATE_SELECTOR`,
  `GEMINI_VIDEO_MODE_ACTIVE_SELECTOR`,
  `GEMINI_VIDEO_DOWNLOAD_BUTTON_SELECTOR` + `activateGeminiVideoMode`.
- `startGeminiVideoTask(args, runtime)` now spawns a **real** async job
  (`runGeminiVideoGeneration`): navigate fresh → activate video mode → send
  (with `__expectImageResponse` short-circuit) → wait for
  `Download video` (timeout → honest COMMAND_TIMEOUT) → CDP artifact-click
  download (mp4/webm/mov) → set `record.result={path,sha256,size_bytes,
  download_filename}` or honest terminal `record.errorCode`. The fake
  `setImmediate` "complete" with empty result is gone. `assertPromptAllowed`
  still runs synchronously first (POLICY test preserved).
- `webAiGeminiGenerateVideo` + the tool-spec handler now pass `runtime`.

### Verification — GREEN (real flow) + one honest architectural caveat

`resmoke-r8-gemini-generate-video.json` (ONE authorized generation):
- Start envelope (all 5 contract keys): `{task_id:
  "task_1778844265405_55654c65635d", status:"running", profile:"<profile>"
  (trace-redacted, correct), lease_id, started_at}`.
- Real artifact on disk: `.runs/.../r8-video/mp_.mp4`,
  **size 1,019,069 bytes**, `file`=ISO Media MP4 Base Media v1, magic
  `00000020 66747970 69736f6d` (ftypisom — valid MP4 container),
  sha256 `5825f26b5ab9a9362405fc0b0c2b0e329f9afd274c309b6a17567e83480b291c`.
  Real conversation "Blue Cube Video Generation" (app/76156170ddad8e72).
  → The in-process async job drove the FULL real Veo generate+download flow
  to completion.

**Honest caveat (pre-existing, not introduced):** `taskRegistry` is a
module-scope in-memory `Map`. Each `node dist/src/cli.js` invocation is a
separate OS process with a fresh empty registry, so a separate
`webai:task-status --task-id <id>` CLI call returns `{status:"failed",
errorCode:"INVALID_ARGS"}` — it cannot see a task created by a different
process. The async chain is only coherent **within one long-lived process**
(the MCP-server `callMcpTool` path). The prior stub had the identical
limitation; it was simply never live-tested. The in-process async contract IS
validated by the new unit test (envelope → poll → honest terminal
`failed`/`ELEMENT_NOT_FOUND`, no fabricated result) and by the real MP4
proving the async job ran to completion. See
`resmoke-r8-task-status-poll-trace.txt`. **This needs a user decision:** to
make CLI-level `generate-video`→`task-status` polling work, the registry must
be persisted (e.g. a state file keyed by task_id) — a deliberate design change
beyond a minimal source-grounded fix, NOT silently patched here.

---

## Quality gates

- `rm -rf dist && npm run build` → exit 0 (tsc clean), run 3× across fix
  iterations.
- `npm test` → **154 pass / 0 fail / 0 skipped** (was 152; replaced 1 stale
  canvas test with 2 honest-flow tests + added 1 video async-contract test;
  net +2). Coverage not reduced.
- `consumer-contract-1.3.0` unchanged (0 porcelain changes to
  `configs/consumer-contract.json`; output-key shapes for both tools
  preserved exactly). No commit.
- Regression: filechooser interception `page.waitForEvent("filechooser")`
  intact; ChatGPT image viewer→Save selectors intact;
  `GEMINI_LATEST_RESPONSE_SELECTOR`/inner-selectors (gemini upload_and_query
  scoping) intact; gemini `image-download-button` path untouched;
  `activateGeminiImageMode` deliberately NOT modified (new
  `activateGeminiToolMode` is a separate helper). Only `src/mcp/tools.ts` +
  `tests/consumerContract.test.ts` changed. No GREEN tool regressed.

## Tab hygiene

Allocated: `dbg4-canvas`, `dbg4-video`, `dbg4-diag` (gemini-9225). All freed
(`dbg4-diag` freed mid-run). Final `browser:tab:list` → **zero `dbg4-` tabs**.
Pre-existing tabs (`gemini-main`, `check-gemini`, `check-gemini-login`,
`session-gemini-9225`, another session's `dbg2-gm`) untouched. The tool's own
browser-spawned conversation tabs and the spawned Docs tab (closed by the
tool) are not project-allocated tabs. No browser/chrome/tmux/codex/omx
process killed/launched/restarted.

## Re-smoke tally (r8, evidence = ground truth)

| Capability | Verdict | Evidence |
|---|---|---|
| webai_gemini_canvas_to_docs | **GREEN** | resmoke-r8-gemini-canvas-to-docs.json (real docs.google.com URL + doc id, errorCode null) |
| webai_gemini_generate_video (in-process flow) | **GREEN** | resmoke-r8-gemini-generate-video.json (1,019,069-byte valid MP4 on disk, real Veo flow) |
| webai_task_status (cross-CLI-process) | **RED — pre-existing in-memory-registry limitation** | resmoke-r8-task-status-poll-trace.txt (INVALID_ARGS across processes; in-process contract green via unit test) |
