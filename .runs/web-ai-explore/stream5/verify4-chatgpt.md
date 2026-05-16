# Stream #5 — ChatGPT FINAL re-verify (round 4) — canvas-export D3 fix

Session 2026-05-15 · profile `chatgpt` · CDP 9223 (live, logged in, NOT
relaunched/closed) · pre-built round-3 `dist/` (NOT rebuilt) · model `Thinking`
(never Pro) · one clean attempt per scenario · no blind retry-rerun · allocated
tab `r4-cg-coldB` freed · browser left running.

## Verdict counts

| status         | count | tools |
|----------------|-------|-------|
| VERIFIED_GREEN | 5     | canvas-export (A: panel-open), canvas-export (B: cold self-open), deep-research, conversation-manage/share, workspace/projects |
| FAILED         | 0     | — |

**Round-3 D3 fix landed and is confirmed.** Both canvas-export scenarios now
pass cleanly. The two round-3 defects — (1) post-success hang exit 124, and
(2) cold-start panel gap returning ELEMENT_NOT_FOUND — are both RESOLVED. No
regression on deep-research / share / workspace.

## canvas-export — Scenario A (panel open, immediately after creation)

- Fresh canvas built via `webai:chatgpt:send-prompt` (model_used `Thinking`,
  errorCode `null`), conversation `6a074f45-7c34-83e8-98ad-1e64fd69ebb7`,
  canvas body `alpha-r4 / beta-r4 / gamma-r4`.
- Envelope: `{"path":"<home>/.../verify4-artifacts/r_4_canvas_document.md","sha256":"c38e9bd9c4baca6157db3140b2147e110b8301f4619c75d383d2c23c9686fe59","format":"md","byteSize":27}`
  — no `errorCode`, no `<conversation-id>` placeholder leak, path redacted to `<home>`.
- **Process exit code 0** (round-3 was exit 124). **Elapsed 5061 ms (~5.1s)** —
  the CLI emitted the success envelope and terminated promptly. **The hang is FIXED.**
- Artifact on disk: 27 bytes, ASCII Markdown, content exactly
  `alpha-r4\ngreen... ` → `alpha-r4\nbeta-r4\ngamma-r4\n`, sha256
  `c38e9bd9c4baca6157db3140b2147e110b8301f4619c75d383d2c23c9686fe59` —
  independently recomputed from disk and **matches the tool's reported sha256
  and byteSize**. Real, non-empty, correct type, correct content.

## canvas-export — Scenario B (cold run, existing canvas, panel not pre-opened)

- Existing verify3 canvas conversation `6a074ba5-0f40-83e8-99aa-65a4116623ef`
  (content `red-uno / green-dos / blue-tres`). Tab `r4-cg-coldB` allocated and
  navigated fresh — canvas panel collapsed (the exact cold state that returned
  `ELEMENT_NOT_FOUND` in verify3).
- Envelope: `{"path":"<home>/.../verify4-artifacts/r_3_final_canvas.md","sha256":"f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9","format":"md","byteSize":29}`
  — no `errorCode`, no placeholder leak.
- **Process exit code 0. Elapsed 4655 ms (~4.7s).** No hang.
- The D3 self-open-panel fix worked: the tool self-opened the collapsed canvas
  panel and exported a real artifact instead of returning `ELEMENT_NOT_FOUND`.
- Artifact on disk: 29 bytes, ASCII Markdown, content
  `red-uno\ngreen-dos\nblue-tres\n`, sha256
  `f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9` —
  recomputed from disk, **matches envelope**. This is the genuine verify3
  canvas content round-tripped from the live conversation (NOT fabricated).

## Root-cause confirmation (why round-4 passes)

1. **Hang (exit 124) fixed by D3 teardown.** `runArtifactClick`
   (src/browser/artifactClick.ts:467-481) now has
   `finally { if (!options.noDisconnect) await browser.close?.() }` at lines
   478-480. `exportChatgptCanvas` (src/mcp/tools.ts:1611-1643) does not pass
   `noDisconnect`, so the CDP browser connection is disconnected on the success
   path, the Node event loop drains, and the process exits 0 promptly. (CDP
   `browser.close()` disconnects the client; it does not kill the live Chrome —
   browser confirmed still running on pid 1210627, untouched.)
2. **Cold-start panel gap fixed by D3 self-open.** `exportChatgptCanvas` passes
   `openPanelIfMissing: "chatgpt-canvas"` (src/mcp/tools.ts:1625);
   `waitForArtifactPageReady` (artifactClick.ts:461-463) calls
   `openChatgptCanvasPanelIfMissing` (artifactClick.ts:413-430) which clicks
   the canvas tile / "Open in canvas" control when the Download selector is not
   yet visible, then waits for it to appear before proceeding.

## Regression — previously GREEN (no regression)

- **deep-research**: GREEN — `{"task_id":"task_1778864019056_433332d59d33","status":"queued"}`, exit 0.
- **conversation-manage --action share**: GREEN —
  `{"dialog_opened":true,"conversationId":"6a074f45-7c34-83e8-98ad-1e64fd69ebb7"}`,
  exit 0. Stopped at the dialog; nothing published, no public link created.
- **workspace/projects**: GREEN —
  `{"surface":"projects","url":"https://chatgpt.com/","summary":"Projects sidebar area not confirmed"}`,
  exit 0. Same behavior as verify3.

## Honesty / safety

No fabricated success or sha256 — both canvas-export sha256 values were
independently recomputed from the on-disk artifacts and match the tool
envelopes. Exit codes and elapsed times measured with shell timestamps around
the actual CLI invocations. One clean attempt per scenario; no blind
retry-rerun. Nothing public (share stopped at the dialog). No Agent task, no
Codex execution. No dist rebuild, no commit, no src/test/config edits, no
profiles.json touched, no browser relaunch/close, no pkill/pgrep of any
`data/browser-profiles/` pattern, no noeticbraid/Playwright-MCP chrome used.
Forbidden-field scan across all round-4 outputs: CLEAN. Allocated tab
`r4-cg-coldB` freed; browser left running (pid 1210627).

## Output paths

- `.runs/web-ai-explore/stream5/verify4-chatgpt.json`
- `.runs/web-ai-explore/stream5/verify4-chatgpt.md`
- Artifacts:
  - `.runs/web-ai-explore/stream5/verify4-artifacts/r_4_canvas_document.md` (27B, sha256 `c38e9bd9c4baca6157db3140b2147e110b8301f4619c75d383d2c23c9686fe59`)
  - `.runs/web-ai-explore/stream5/verify4-artifacts/r_3_final_canvas.md` (29B, sha256 `f6651468af3855fb35a46265cd059033b51edf54a8e4b2b1e8a4eeba4f27fae9`)
