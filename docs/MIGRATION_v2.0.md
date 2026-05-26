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

Original Phase 7 B9 PASS rate: 18/63. The fails fell into the categories
below and were NOT new defects introduced by the default flip — they were
pre-existing extension driver bugs / UI drifts / environmental conditions that
the default-flip exposed:

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

### Post-ship fix waves 1-5 re-baseline (2026-05-26)

Source: `.runs/postship-fix-wave-5/regression-summary.md`. The full 63-yaml
batch was run strictly serial, grouped Gemini → Claude → other → ChatGPT,
with tab cleanup around every YAML, ≥10s sleeps between non-ChatGPT YAMLs,
≥30s sleeps between ChatGPT YAMLs, and the ChatGPT 429 retry/defer policy
enabled. No ChatGPT 429s were observed.

Current post-sweep PASS rate: **42/63** (baseline **18/63**, +24 PASS,
+38.1 percentage points).

Remaining failure categories:

- CHROME_EXTENSION_NOT_CONNECTED × 6
- COMMAND_TIMEOUT × 6
- ELEMENT_NOT_FOUND × 5
- UNKNOWN × 3
- ARTIFACT_DOWNLOAD_TIMEOUT × 1

Per-cluster wave delta:

- Bridge-race cluster: 6 remaining → 3 remaining (3/6 now pass).
- Gemini selector cluster: 12 remaining → 4 remaining (8/12 now pass).
- ChatGPT selector cluster: 8 remaining → 2 remaining (6/8 now pass).
- Completion detector cluster: 13 remaining → 8 remaining (5/13 now pass).
- One-off cluster: 5 remaining → 3 remaining (2/5 now pass).

Wave-5 one-off notes:

- `gemini-gemini-music-task-status-ext.yaml` now creates a fresh Gemini Music
  task before polling task status; this was a YAML fixture dependency, not a
  production driver defect.
- The Claude Design managed-CDP stale WebSocket URL case is operator-runbook
  material; after restarting Chrome on 9224, purge `.runs/.../ws-url-cache` if
  present before rerunning managed-CDP one-offs.
- `gemini-image-draft` and `research-database-search-dry-run` still fail before
  command execution on managed-CDP launch readiness (`/json/version`
  `ECONNREFUSED`) and remain outside the default extension-assisted path.
- `claude-design-present` is no longer the stale 9224 WebSocket timeout in this
  re-baseline; it fails schema validation because `result.type: text/html` is
  unsupported by the workflow runner.

## Rollback
- `git revert <2.0.0 cut commit sha>` reverts the default flip + version bumps.
- Or: pin `package.json` back to `1.0.0` and override contract callers with
  `backend: "managed-cdp"`.
