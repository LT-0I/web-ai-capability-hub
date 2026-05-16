# Stream #5 — ChatGPT FINAL live re-verify (round 3, focused)

Session 2026-05-15 · profile `chatgpt` · CDP 9223 · pre-built `dist/` (NOT
rebuilt) · model `Thinking` (never Pro) · one clean attempt per tool · no blind
retry-rerun · browser not relaunched/closed · allocated tabs freed.

## Verdict counts

| status         | count | tools |
|----------------|-------|-------|
| VERIFIED_GREEN | 5     | conversation-manage/share, deep-research, send-prompt(Thinking), workspace/projects, workspace/memory |
| GUARD_OK       | 1     | codex:list-envs (SUBMCP_NOT_PROVISIONED, intended) |
| FAILED         | 1     | canvas-export (artifact OK, but still hangs exit 124) |

**Round-2 bugfix cleared 3 of the 4 previously-FAILED ChatGPT tools**
(share, deep-research, send-prompt). canvas-export is partially fixed: the
selector fix works and a real verified artifact is produced, but the tool still
hangs after success (exit 124). No regression on the GREEN/GUARD surfaces.

## Previously-FAILED — re-verify result

### 1. canvas-export — STILL FAILED (improved: real artifact, but hangs)
- Built fresh canvas (Thinking) `https://chatgpt.com/c/6a074ba5-0f40-83e8-99aa-65a4116623ef`, body `red-uno / green-dos / blue-tres`.
- Envelope: `{"path":"<home>/.../verify3-artifacts/r_3_final_canvas.md","sha256":"f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9","format":"md","byteSize":29}` — no `errorCode`, no `<conversation-id>` placeholder leak (path correctly redacted to `<home>`).
- Artifact on disk: 29 bytes, ASCII Markdown, content exactly `red-uno\ngreen-dos\nblue-tres\n`, sha256 `f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9` — **matches the tool's reported sha256 and byteSize**. Real, non-empty, correct type, correct content.
- **Process exit 124** — the tool emitted the success envelope then HUNG; SIGTERM by timeout.
- **Root cause (remaining):** The Round-2 selector fix is correct and effective — `CHATGPT_CANVAS_DOWNLOAD_BUTTON_SELECTOR = 'button[aria-haspopup="menu"]:has-text("Download"), button:has-text("Download")'` (src/mcp/tools.ts:433) matched the native ChatGPT canvas Download `<button>` and the artifact downloaded successfully. The unfixed defect is the **post-success hang** flagged in verify2: `exportChatgptCanvas` returns its envelope but the process does not exit cleanly (artifactClickRunner / page lease not torn down → event loop kept alive). Spec explicitly requires the tool to exit with a stable code and not hang; it does not.
- **Secondary robustness gap (new finding):** canvas-export does NOT open the canvas side-panel itself; it relies on the panel already being open (true immediately after canvas creation). A cold run against an existing canvas conversation after fresh navigation fails honestly with `ELEMENT_NOT_FOUND` (reproduced once on conv `6a07497c`: `{"path":"","sha256":"","byteSize":0,"errorCode":"ELEMENT_NOT_FOUND"}`) because the panel is collapsed and the Download button is absent from the DOM. Honest failure (no fabricated success), but a usability gap distinct from the hang.

### 2. conversation-manage --action share — VERIFIED_GREEN
- `{"dialog_opened":true,"conversationId":"6a07497c-5750-83e8-8eeb-517f25c16cd2"}`, exit 0.
- Wide-viewport fix (`page.setViewportSize({width:1280,height:900})` before clicking `button[aria-label="Share"]`, src/mcp/tools.ts:1720-1721) WORKS. Share control actionable, dialog opened, real conversationId (no placeholder).
- Stopped at the dialog. Nothing published, no public link created. `SENSITIVE_CONTENT_GUARD` branch (tools.ts:1722-1723) remains in place for blocked/unconfirmed publish.

### 3. deep-research — VERIFIED_GREEN
- `{"task_id":"task_1778862414824_bc2f01a1374b","status":"queued"}`, exit 0.
- `webai:task-status --task-id task_1778862414824_bc2f01a1374b` → `{"status":"queued","progress_label":"queued ChatGPT Deep research task"}`.
- Composer-scoped model detection fix WORKS — no false `MODEL_SELECTION_DRIFT` from the sidebar "Recents" heading. Selected Thinking, entered Deep research mode, submitted, returned queued envelope (queue=pass; report not awaited per spec). task-status with the real id is valid.

### 4. send-prompt (Thinking) — VERIFIED_GREEN
- `{"response_text":"PONG-R3-VERIFY","completion_detected":true,"errorCode":null,"model_used":"Thinking","elapsed_ms":9601}`, exit 0.
- Composer-scoped model detection fix WORKS — `model_used:"Thinking"` (no false "Recents" drift), completes, model sticks, never Pro. Re-confirmed by two further canvas-creation send-prompt runs (`model_used:"Thinking"`, `errorCode:null`).

## Regression — previously GREEN/GUARD (no regression)

- **workspace/projects**: GREEN, `{"surface":"projects","url":"https://chatgpt.com/","summary":"Projects sidebar area not confirmed"}`, forbidden-field scan CLEAN.
- **workspace/memory**: GREEN, `{"surface":"memory","url":"https://chatgpt.com/#settings/Personalization","summary":"Memory settings route opened"}`, CLEAN.
- **codex:list-envs**: GUARD_OK, `SUBMCP_NOT_PROVISIONED` (intended gated PASS).

## Root-cause summary for next bugfix dispatch (canvas-export only)

1. **Post-success hang (exit 124).** `exportChatgptCanvas` (src/mcp/tools.ts:1611-1643) returns the correct envelope but the process never exits. Likely the `artifactClickRunner` page/browser connection or `noDisconnect:true` lease is not released on the success path, keeping the Node event loop alive. Fix: ensure deterministic teardown / process exit after returning the envelope (mirror the failure-path cleanup). This is the only blocker keeping canvas-export FAILED — the artifact itself is correct and verified.
2. **(Lower priority) Cold-start panel gap.** canvas-export assumes the canvas side-panel is already open. Consider opening the canvas artifact tile before locating the Download control, or document that canvas-export must be invoked while the canvas panel is open (immediately post-creation). Current behavior on a cold conversation is an honest `ELEMENT_NOT_FOUND` (no fallback, no fabricated success) — acceptable per contract but limits real-world usability.

## Honesty / safety

No fabricated success or sha256 — canvas-export's reported sha256
(`f6651468...`) was independently recomputed from the on-disk artifact and
matches. One clean attempt per tool; the single ELEMENT_NOT_FOUND cold-start
observation is reported as a root-cause finding, not a blind retry. Nothing
public created (share stopped at the dialog). No Agent task, no Codex task
execution. No dist rebuild, no commit, no src/test/config edits, no
profiles.json touched, no browser relaunch/close, no pkill/pgrep of any
`data/browser-profiles/` pattern. Allocated tabs (`r3-cg-send`,
`r3-cg-canvas`, `r3-cg-share`, `r3-cg-cv2`) freed; browser left running.

Output paths:
- `.runs/web-ai-explore/stream5/verify3-chatgpt.json`
- `.runs/web-ai-explore/stream5/verify3-chatgpt.md`
- Artifacts: `.runs/web-ai-explore/stream5/verify3-artifacts/r_3_final_canvas.md` (sha256 `f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9`), `.runs/web-ai-explore/stream5/verify3-artifacts/r_3_canvas_probe.md` (sha256 `e08f6e95ecbf278354d4014e2ecc5397c69aa1ec41771d2fbd87941e1a69730b`)
