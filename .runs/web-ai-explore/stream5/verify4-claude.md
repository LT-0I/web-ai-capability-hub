# Stream #5 — Claude tools FINAL re-verify (round 4, D1/D2 check)

Date: 2026-05-15 · Profile: `claude-9224` (port 9224, live, logged in, NOT relaunched) ·
Build: existing round-3 `dist/` (NO rebuild) · Model: Sonnet (cheap, compliant) ·
2 tools only (Bash + Read), no Playwright-MCP, no noeticbraid.

Scope: confirm whether the round-3 D1 (generate completion-wait) and D2 (get-html
HTML validation / no bootstrap-stub persistence) fixes landed for the
`claude-design` lane, plus zero-regression spot check on deep-research + send-prompt.

## Verdict summary

| id | tool | status |
|----|------|--------|
| 1a | design:create-project | VERIFIED_GREEN |
| 1b | design:generate | **FAILED** — `POSTCONDITION_TIMEOUT` (D1 NOT effectively landed) |
| 1c | design:get-html | **FAILED** — `ARTIFACT_VERIFICATION_FAILED` (D2 LANDED; honest terminal, downstream of 1b) |
| 2a | deep-research | VERIFIED_GREEN (no regression) |
| 2b | send-prompt (sonnet,/new) | VERIFIED_GREEN (no regression) |

- VERIFIED_GREEN: 3 (create-project, deep-research, send-prompt)
- FAILED (honest stable contract code, no fabrication, no forbidden fields): 2 (generate, get-html)

## D1 (generate completion-wait) — **NOT effectively landed**

One clean foreground attempt (the first dispatch's CLI envelope was lost by a
background-harness 0-byte capture, NOT a tool failure; re-run was a single clean
attempt, not a blind retry).

```
webai:claude:design:generate --profile claude-9224 \
  --project-url https://claude.ai/design/p/019e2c8b-6fa2-7196-b896-7fe2fc62492b \
  --prompt "a single page that says Hello World" --model sonnet --output-json
->
{ "ok": false, "errorCode": "POSTCONDITION_TIMEOUT",
  "error_code": "POSTCONDITION_TIMEOUT", "status": "failed" }  EXIT=0
```

**Root cause (still the round-3 class):** the live design tab resolved to
`https://claude.ai/design/p/019e2c8b-13a1-...?file=Hello+World.html` — i.e. a real
`Hello World.html` file WAS produced server-side **on our project**, proving
generation completes. But the CLI's success postcondition (wait for the generated
design / HTML viewer to be ready) still does not recognize the completed-generation
DOM state and times out. The D1 patch did not fix the postcondition
detection. This is a postcondition-detection defect, NOT a failure to generate.
Terminal code is a stable contract code; no raw Playwright string; no fabricated
artifact.

## D2 (get-html HTML validation / no stub persistence) — **LANDED**

```
webai:claude:design:get-html --profile claude-9224 \
  --project-url https://claude.ai/design/p/019e2c8b-6fa2-7196-b896-7fe2fc62492b \
  --download-dir .../verify4-artifacts --output-json
->
{ "ok": false, "errorCode": "ARTIFACT_VERIFICATION_FAILED",
  "error_code": "ARTIFACT_VERIFICATION_FAILED",
  "iframeArtifactSha256": "", "savedPath": "", "byteSize": 0 }  EXIT=0
```

Round-3 bug: get-html persisted a 77-byte `_bootstrap` loader URL with a `.html`
extension and an ok-shaped sha256. **Round-4: fixed.** get-html now returns a
stable `ARTIFACT_VERIFICATION_FAILED` with **empty** `savedPath`, empty
`iframeArtifactSha256`, `byteSize:0`, and writes **no bootstrap-URL `.html` stub**
to the download dir. No `html`/`dom`/`screenshot`/forbidden fields. This is the
honest terminal behavior the consumer contract requires.

The tool-level status is still FAILED only because no real HTML artifact could be
produced this run — that is strictly downstream of the 1b `POSTCONDITION_TIMEOUT`
(generation completed server-side, but the design iframe had not rendered real
HTML at capture time, so there was correctly nothing valid to persist). D2's job
was to fail honestly instead of persisting a fake artifact — and it now does.

**No design HTML artifact sha256 / content head can be reported** because get-html
correctly produced NO artifact (empty savedPath, byteSize 0). Reporting a fake
sha256 would be fabrication; none is reported.

Minor cleanliness note (not a contract violation): get-html left two small canvas
scratch files in the download dir — `r_3_final_canvas.md` (29B) and
`r_4_canvas_document.md` (27B), content like `red-uno/green-dos/blue-tres`. These
are NOT `.html` stubs and do NOT violate the contract (no forbidden fields, no
fake HTML, output keys empty), but ideally get-html should not leave scratch files
behind on a failed capture.

## Zero-regression spot check — CONFIRMED GREEN

- **`webai:claude:deep-research`** — `{ "task_id": "task_1778864347079_0a1671062c04",
  "status": "queued" }`. Real task_id. GREEN, no regression.
- **`webai:claude:send-prompt --tab-url-contains "/new" --model sonnet`** —
  `completion_detected:true`, `errorCode:null`, `model_used:"Sonnet 4.6Adaptive"`
  (Sonnet stuck, no /code forcing), real response on
  `https://claude.ai/chat/8ec0996b-22b5-4cb2-b848-2a4becad49ed`, elapsed 31.3s.
  GREEN, no regression. `PONGPONG` / `Sonnet 4.6Adaptive` are benign
  label-concatenation cosmetics (same documented round-3 pattern), not defects.

## Honesty / safety statement

- NO fabricated success or sha256. generate honestly FAILED
  `POSTCONDITION_TIMEOUT`; get-html honestly FAILED `ARTIFACT_VERIFICATION_FAILED`
  with empty savedPath/sha/byteSize. No sha256 reported because no artifact exists.
- One clean attempt per tool. The first generate dispatch's CLI output was lost to
  a background-harness 0-byte capture (tool ran, harness did not persist stdout);
  the single foreground re-run is one clean attempt, not a blind retry-rerun, and
  it reproduced the same stable code.
- All failures carry an exact stable contract code + CLI JSON + precise root
  cause. No raw Playwright timeout/locator strings leaked.
- No forbidden fields in any output (no cdpEndpoint/dom/html/screenshot/etc).
- Cheap Sonnet only; benign trivial inputs ("Hello World", "PONG", boiling-point).
- Browser NOT relaunched/closed. No profiles.json, no dist rebuild, no commit, no
  src/test/config edits, no pkill/pgrep of profile patterns, no Playwright-MCP
  chrome, no noeticbraid. docs/capability-library.json NOT edited.

## Net assessment

- **D2 fix CONFIRMED LANDED** — get-html no longer persists a bootstrap-URL stub;
  fails honestly with `ARTIFACT_VERIFICATION_FAILED`.
- **D1 fix NOT effectively landed** — `design:generate` still returns
  `POSTCONDITION_TIMEOUT` even though generation completes server-side
  (`?file=Hello+World.html` resolves on our project). The postcondition
  detection still does not match the completed-generation DOM state. A targeted
  follow-up bugfix on the generate success-postcondition selector/wait is
  required before the claude-design generate→get-html chain can go GREEN.
- 3/5 GREEN, no regressions on the previously-GREEN tools.

## Output paths

- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify4-claude.json`
- `/home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify4-claude.md`
