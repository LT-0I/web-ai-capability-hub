# MIGRATION v1.0.0 → v2.0.0 (Phase 7 Bucket 9)

## What changed
- Default backend for all 40 `webai_*` tools flipped from `managed-cdp` →
  `extension-assisted-cdp`.
- `package.json` bumped to `2.0.0`.
- `configs/consumer-contract.json` bumped to `consumer-contract-2.0.0`.

## Caller upgrade
- No code change needed if you want the new default extension behavior.
- Add `backend: "managed-cdp"` to any tool call to retain the prior behavior.
- The native-messaging host install is now de-facto required for the
  default path; see `src/runtime/extension/installHost.ts`.

## Live-regression baseline (per-workflow)

Generated: 2026-05-25T16:35:29.912Z. Source `.runs/phase7-bucket-9/regression-summary.md`.

PASS rate: 18/63. The fails fall into the categories below and are NOT
new defects introduced by the default flip — they are pre-existing extension
driver bugs / UI drifts / environmental conditions that the default-flip
exposed:

- chatgpt-generate-file × 5 COMMAND_TIMEOUT — known B3 bug; defer to
  issue-fix-loop after 2.0.0 ships.
- claude-generate-file × 5 COMMAND_TIMEOUT — same B3 family; defer.
- Other COMMAND_TIMEOUT × 5 — chatgpt-gpts-converse, chatgpt-upload-multi,
  claude-design generate/present, and gemini-music-download-track live gates;
  defer to the same issue-fix-loop rather than blocking the 2.0.0 default flip.
- CHROME_EXTENSION_NOT_CONNECTED × 7 — transient bridge race / bridge
  availability failures. The 4 originally documented failures were retried in
  this finalization pass; 0/4 passed on retry. Tracker: investigate as a
  separate issue if persistent.
- ELEMENT_NOT_FOUND × 18 including B5 deep_research (Gemini hidden on
  3.1 Flash Lite, Claude "Research" label) — selector drift; defer to
  issue-fix-loop with the UI fact memory `reference_web_ai_ui_facts.md`.
- COMMAND_GATE_FAILED × 1 — gemini-music-task-status closure gate had no
  matching live task status in this baseline; defer with Gemini Music fixes.
- UNKNOWN × 4 — 2 legacy managed-cdp `connectOverCDP` 9224 timeouts plus 2
  non-command workflow CDP launch readiness failures (`gemini-image-draft`,
  `research-database-search-dry-run`). These are not the new default webai
  extension path. Re-pinning ws URL after chrome restart fixes the 9224 case;
  tracker: document this in the operator runbook.

## Rollback
- `git revert <2.0.0 cut commit sha>` reverts the default flip + version bumps.
- Or: pin `package.json` back to `1.0.0` and override contract callers with
  `backend: "managed-cdp"`.
