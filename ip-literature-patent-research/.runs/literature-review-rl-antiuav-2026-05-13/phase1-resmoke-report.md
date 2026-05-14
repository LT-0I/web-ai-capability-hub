# Phase 1 Re-smoke Report

Date: 2026-05-14
Result: FAIL

## Pre-check
- CDP version probe: non-empty (`{` from `curl -s http://127.0.0.1:9223/json/version | head -1`)
- DR tab URLs: `['https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831', 'https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831']`
- Build artifact: `dist/src/cli.js` exists

## Command
```bash
node dist/src/cli.js browser:artifact-click \
  --profile chatgpt \
  --url https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831 \
  --button-selector 'button[aria-label="导出"]' \
  --follow-up-selector 'div[role="menuitem"]:has-text("导出到 Word")' \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke-downloads \
  --rename-to phase1-resmoke-export.docx \
  --filename-pattern '*.docx' \
  --verify-min-bytes 20000 \
  --locate-timeout-ms 12000 \
  --timeout-ms 60000 \
  --output-json
```

## CLI output
- Exit: 1
- Stdout: empty
- Stderr JSON:
```json
{"ok":false,"errorCode":"ELEMENT_NOT_FOUND","error":"No element matched --button-selector","evidence":{"selector":"button[aria-label=\"导出\"]","pageUrl":"https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831","frameCount":4,"triedFrames":[{"url":"https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831","hadSelectorMatch":false},{"url":"","hadSelectorMatch":false},{"url":"","hadSelectorMatch":false},{"url":"","hadSelectorMatch":false}]}}
```

## DOCX verifier
- Expected path: `ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/phase1-resmoke-downloads/phase1-resmoke-export.docx`
- Exists: false
- Verifier: not run; no DOCX was downloaded

## Criteria
- exit 0: FAIL (exit 1)
- DOCX >= 20 KB: FAIL (missing)
- paragraphs >= 150: FAIL (missing)
- chars >= 15,000: FAIL (missing)
- sha256 differs from `58b0cb05eeb225c0af890c56f09ae7a6d7bc405aeffe7d7715f787578e1d0882`: FAIL (missing)
- sha256 differs from `a19cc0436af9b42886852faab3154b80b12b840cedad553da1daa39161385ff8`: FAIL (missing)
- no orphan Chrome processes: PASS (no Chrome launched by this run; existing CDP browser remained present)

## Notes
- The bugfix evidence fields are present: `pageUrl`, `frameCount`, and `triedFrames`.
- No code edits and no commits were made.
