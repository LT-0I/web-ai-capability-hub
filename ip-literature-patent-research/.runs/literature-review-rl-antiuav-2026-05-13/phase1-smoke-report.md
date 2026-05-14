# Phase 1 smoke report — browser:artifact-click

## Preconditions
- Repo: `/home/l1u/workspace/noeticmind/web-ai-capability-hub`.
- Build: `npm run build` completed successfully.
- CLI entrypoint: package `bin` points to `dist/src/cli.js`; used `node dist/src/cli.js`.
- Help check: `browser:artifact-click --help` is not special-cased; it returns the command's required-args error.
- CDP 9223/profile: running before smoke with chatgpt profile; target URL was opened/navigated.

## Command invocation
Initial requested-form run used `--url` and failed before the sandbox export frame rendered. Per instructions, I did one 30s warmup retry against the already-open target tab, with `--frame-text-filter '研究完成情况'` attempted first; then held the warmed page open and retried the CLI without `--url` so it would use the open tab.

Final captured command shape:
```bash
node dist/src/cli.js browser:artifact-click \
  --profile chatgpt \
  --button-selector 'button[aria-label="导出"]' \
  --follow-up-selector 'div[role="menuitem"]:has-text("导出到 Word")' \
  --download-dir .../phase1-smoke-downloads \
  --rename-to phase1-smoke-export.docx \
  --filename-pattern '*.docx' \
  --verify-min-bytes 20000 \
  --timeout-ms 60000 \
  --output-json
```

## CLI output
- Exit code: `1`
- stdout (`phase1-smoke-stdout.json`): `<empty>`
- stderr (`phase1-smoke-stderr.txt`):
```json
{
  "ok": false,
  "errorCode": "ELEMENT_NOT_FOUND",
  "error": "No element matched --button-selector",
  "evidence": {
    "selector": "button[aria-label=\"导出\"]"
  }
}
```

## Live DOM evidence
- Warmup probe saw export buttons before the final CLI retry: `{'step': 0, 'frames': 7, 'export_button_count': 2}`
- CLI error taxonomy returned: `ELEMENT_NOT_FOUND` (no element matched `button[aria-label="导出"]`).

## DOCX verification
- Result: `{"exists": false, "error": "DOCX not produced"}`
- Round 3 comparison target: sha256 `58b0cb05eeb225c0af890c56f09ae7a6d7bc405aeffe7d7715f787578e1d0882`, paras 171, chars 17,798.

## Pass/fail criteria
- CLI success: FAIL (exit `1`).
- DOCX >= 20 KB: FAIL (no DOCX produced).
- DOCX parses with paragraphs >=150 and chars >=15,000: FAIL (no DOCX produced).
- sha256 differs from Round 3: FAIL / not evaluated (no DOCX produced).
- No orphan Chrome processes: PASS for top-level CDP owner (browser PID `194402` persisted before/after; renderer count changed from page activity/new tabs).

## Conclusion
FAIL, not functionally equivalent: the live Python Playwright warmup could observe the export button in the ChatGPT sandbox frame, but the TS CLI/Node Playwright command returned `ELEMENT_NOT_FOUND` and produced no download. No TS code was patched and nothing was committed.
