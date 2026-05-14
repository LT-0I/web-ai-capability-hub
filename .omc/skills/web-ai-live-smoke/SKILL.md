---
name: web-ai-live-smoke
description: Run a single positive live-UI smoke test against ChatGPT/Claude/Gemini through the managed CDP Chrome profile, capture the artifact, verify it, and write a structured smoke report. Use after any change to browser:* primitives or workflow YAMLs. Always one positive case per run.
---

# Live UI smoke test

A "live smoke" is exactly one positive end-to-end run of the just-built TS CLI
against a real managed Chrome profile, ending in a structured smoke report
with PASS / FAIL / INCONCLUSIVE per criterion. The pattern shipped through
`phase1-live-smoke.md`, `phase1-resmoke.md`, `phase1-resmoke2.md`, and
`phase1-resmoke3-report.md` evidence.

## When to use

- After Codex shipped a new `browser:*` primitive (e.g. `browser:artifact-click`).
- After a bugfix iteration (see `web-ai-bugfix-iterate`) — the smoke is the
  re-verification.
- After a Phase 3+ workflow YAML change that runs against a real Deep
  Research conversation.

## When NOT to use

- The change is unit-only (no `browser:*` touch) → vitest is enough.
- The smoke would consume scarce Pro quota and the user hasn't authorized
  it.
- Chrome on CDP 9223 is unreachable and the user hasn't authorized a
  relaunch.

## Hard rules for any smoke

- **One positive case per dispatch.** No matrix runs. No retry loops that
  hide bugs.
- ChatGPT testing uses a Thinking-class model. Never Pro unless explicitly
  authorized.
- Use only `node dist/src/cli.js browser:* | capability:* | workflow:*`
  commands plus the official `curl http://127.0.0.1:9223/json...` probes.
  Never write a sidecar Python/Node script that connects to Chromium/CDP
  directly from inside the smoke.
- If the smoke fails for an environmental reason (Chrome down, profile
  broken, Cloudflare challenge), mark **INCONCLUSIVE**. Do not invent a TS
  bug.
- No commits inside the smoke. The orchestrator commits after reviewing.

## Pre-conditions to verify (don't skip)

1. Chrome alive on CDP 9223:
   ```bash
   curl -s http://127.0.0.1:9223/json/version | head -1
   ```
   If empty, relaunch (only with explicit DISPLAY/XAUTHORITY — Cloudflare
   blocks the headless path):
   ```bash
   DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
   nohup /usr/bin/google-chrome \
     --remote-debugging-port=9223 \
     --user-data-dir=/home/l1u/workspace/noeticmind/web-ai-capability-hub/data/browser-profiles/<profile> \
     --no-first-run --no-default-browser-check --new-window \
     <conversation-url> \
     >/tmp/<profile>-chrome.log 2>&1 &
   ```
2. Build present: `ls dist/src/cli.js` (or `npm run build` first if not).
3. Target tab is open in the existing profile:
   ```bash
   curl -s http://127.0.0.1:9223/json \
     | python3 -c "import json,sys; print([t['url'] for t in json.load(sys.stdin) if t.get('type')=='page'])"
   ```

## Required variables

```bash
SMOKE_NAME=phase3c-dr-docx-resmoke
RUN_DIR=/home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13
DOWNLOAD_DIR="$RUN_DIR/$SMOKE_NAME-downloads"
REPORT="$RUN_DIR/$SMOKE_NAME-report.md"
TARGET_URL=https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831
```

## Dispatch shape (Codex executes the smoke via `omx exec`)

The orchestrator does **not** run the live CLI directly. It writes a smoke
prompt and dispatches to Codex per `web-ai-dispatch-codex`. The prompt
embeds:

1. Pre-condition checks (Chrome on 9223, build present, target tab open).
2. **Exact** CLI invocation with all flags. Example for the Deep Research
   DOCX export:
   ```
   node dist/src/cli.js browser:artifact-click \
     --profile chatgpt \
     --url https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
     --button-selector 'button[aria-label="导出"]' \
     --follow-up-text-regex '(DOCX|下载\s*DOCX|Word|导出.*Word)' \
     --download-dir <abs path>/<smoke-name>-downloads \
     --rename-to <smoke-name>-export.docx \
     --filename-pattern '*.docx' \
     --verify-min-bytes 20000 \
     --viewport-width 1500 --viewport-height 1000 \
     --prerender-wait-ms 15000 --scroll-main-to-y 900 --scroll-main-wait-ms 1000 \
     --locate-timeout-ms 12000 --timeout-ms 60000 \
     --output-json
   ```
3. Stdout/stderr capture to `<run-dir>/<smoke-name>-stdout.json` and
   `-stderr.txt`.
4. Artifact verification (DOCX example):
   ```python
   from docx import Document; import hashlib, pathlib
   p = pathlib.Path('<abs path>/<smoke-name>-export.docx')
   d = Document(p)
   print({
     'paras': len(d.paragraphs),
     'chars': sum(len(x.text) for x in d.paragraphs),
     'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
     'size': p.stat().st_size,
   })
   ```
5. sha256 must differ from known prior artifacts (e.g. Round-3
   `58b0cb05eeb225c0af890c56f09ae7a6d7bc405aeffe7d7715f787578e1d0882`,
   manual `a19cc0436af9b42886852faab3154b80b12b840cedad553da1daa39161385ff8`).
6. Smoke report at `$REPORT` (≤80 lines): pre-conditions, command,
   stdout/stderr summary, verifier results, PASS/FAIL/INCONCLUSIVE per
   criterion, any selector adjustments needed.

## Pass criteria (DOCX example)

- CLI exited 0 (or `{ok: true}` under `--output-json`).
- DOCX ≥ 20 KB.
- DOCX parses, paragraphs ≥ 150, chars ≥ 15,000.
- sha256 differs from known prior artifacts.
- No orphan Chrome processes left behind (compare
  `pgrep -fa "remote-debugging-port=9223"` before/after).

## Failure handling

- Error code from the contract → record it verbatim
  (`IFRAME_NOT_FOUND`, `ELEMENT_NOT_FOUND`, `ELEMENT_OUT_OF_VIEWPORT`,
  `ARTIFACT_DOWNLOAD_TIMEOUT`, `ARTIFACT_VERIFICATION_FAILED`,
  `POSTCONDITION_TIMEOUT`, `MODE_UNCERTAIN`, `HUMAN_HANDOFF_REQUIRED`).
- Evidence JSON should include `pageUrl`, `frameCount`, `triedFrames`, and
  the bbox of any candidates. If those are missing, that itself is a bug —
  note it.
- **Stop after one re-smoke.** If re-smoke also fails, hand to
  `web-ai-bugfix-iterate`.

## Engine hooks

- If a smoke output is visual (image/canvas/screenshot), add `omc:visual-verdict` after artifact capture.
- If a failure needs competing hypotheses before patching, hand to `web-ai-bugfix-iterate` with `omc:trace` context rather than retrying.

## References

- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §C.3
- `docs/CONSUMER_CONTRACT.md` — error code taxonomy + sensitive-field rules
- `.omc/codex-prompts/phase1-live-smoke.md`
- `.omc/codex-prompts/phase1-resmoke*.md`
- `.omc/skills/web-ai-dispatch-codex/SKILL.md`
- `.omc/skills/web-ai-bugfix-iterate/SKILL.md`
- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.8, §F, §G — OMC/OMX engines, monitoring, and MCP hooks.
