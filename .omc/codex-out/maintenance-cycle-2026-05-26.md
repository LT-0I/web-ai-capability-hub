# Maintenance cycle — 2026-05-26 Wave 11

## Step 0 8-lock spot check

Pre-check passed on HEAD `f744e4c` (`webai: post-ship fix wave 10 ...`).

| Lock | Expected | Actual |
| --- | ---: | ---: |
| package.json version | 2.1.0 | 2.1.0 |
| consumer contract | consumer-contract-2.1.0 | consumer-contract-2.1.0 |
| commands | 232 | 232 |
| error codes | 40 | 40 |
| `webai_` tools | 81 | 81 |
| `research_` tools | 121 | 121 |
| `wah_` tools | 8 | 8 |
| golden tool count | 236 | 236 |

Final post-gate 8-lock check remained identical; see `.runs/maintenance-2026-05-26/gate/8-lock-final.txt`.

## Step 1 drift pre-detection results

Build before snapshot work: PASS.

Snapshot capture/diff was skipped for all three services because `data/site-maps/` contains no baseline JSON files and the capture command requires a headed/live browser in this environment. A probe showed no `$DISPLAY`; live Chrome launches are explicitly deferred to later waves.

| Service | Result | Drift count | Risk summary |
| --- | --- | ---: | --- |
| ChatGPT | skipped | n/a | No baseline/current pair produced; defer pre-detection. |
| Claude | skipped | n/a | No baseline/current pair produced; defer pre-detection. |
| Gemini | skipped | n/a | No baseline/current pair produced; defer pre-detection. |

Artifact: `.runs/maintenance-2026-05-26/snapshot-results.json`.

## Step 2 catalog audit diff results

Runbook command note: `docs/capability-library.json` currently uses `features[]` (not `records[]`), so the audit was run over `(.records // .features)`.

### `research_`

- Golden shipped: 121
- Library declared exact `mcp_tool`: 0
- Orphaned shipped tools: 121
- Stale library entries: 0

Artifact lists:
- `.runs/maintenance-2026-05-26/catalog-audit/research-orphaned-shipped.txt`
- `.runs/maintenance-2026-05-26/catalog-audit/research-stale-library.txt`
- `.runs/maintenance-2026-05-26/catalog-audit/research-diff.patch`

### `webai_`

Exact `mcp_tool` string audit:

- Golden shipped: 81
- Library declared exact `mcp_tool`: 78
- Orphaned shipped tools: 5
- Stale library entries: 2 combined-string rows

Exact orphaned shipped tools:

```text
webai_chatgpt_codex_get_diff
webai_chatgpt_codex_list_envs
webai_chatgpt_codex_task_status
webai_claude_design_get_html
webai_literature_task_status
```

Exact stale library entries:

```text
webai_chatgpt_codex_list_envs, webai_chatgpt_codex_submit_task, webai_chatgpt_codex_task_status, webai_chatgpt_codex_get_diff
webai_chatgpt_pulse_get, webai_chatgpt_pulse_onboard
```

Importer-tokenized parity (matching current importer behavior that tokenizes comma-separated `mcp_tool` fields) leaves only one missing infrastructure-only token: `webai_literature_task_status`; no stale tokenized entries.

Artifacts:
- `.runs/maintenance-2026-05-26/catalog-audit/webai-diff.patch`
- `.runs/maintenance-2026-05-26/catalog-audit/webai-orphaned-shipped.txt`
- `.runs/maintenance-2026-05-26/catalog-audit/webai-stale-library.txt`
- `.runs/maintenance-2026-05-26/catalog-audit/webai-orphaned-shipped-tokenized.txt`

## Step 3 library edits made

Edited `docs/capability-library.json` only for the 40 Phase 8 `webai_<db>_download_pdf` rows.

Verification summary (`.runs/maintenance-2026-05-26/library-audit/step3-verification.json`):

- 40/40 download-PDF rows present.
- 0 missing `feature_id` fields.
- 0 `feature_id`/`id` mismatches.
- 0 rows missing `last_update: 2026-05-26`.
- 0 rows missing evidence line: `phase 8 driver ship (3c257dc); maintenance audit 2026-05-26`.
- 0 statuses outside `status_enum`.

Download-PDF status histogram:

| Status | Count |
| --- | ---: |
| FAIL_CLOSED_UNSUPPORTED | 2 |
| IMPLEMENTED_GREEN | 2 |
| OK_DEFERRED | 36 |

No new `webai_` or `research_` tools were added. No `src/`, `tests/`, golden, package, contract, or error-code files were edited.

## Step 4 import row count + imported_at refresh confirm + status histogram

Initial import failed because the untracked local SQLite table `data/capability-hub.sqlite::integration_registry` still had the older six-status `CHECK` constraint while the shipped library uses the expanded importer enum. I refreshed only that untracked SQLite table schema from `docs/capability-library.json.status_enum`, then reran the official command successfully:

```bash
node dist/src/cli.js capability:library:import docs/capability-library.json --json
```

Import result:

- Seed feature count: 175
- DB row count: 175
- Row count matches seed: yes
- `imported_at` date histogram: `2026-05-26` = 175
- DB-vs-seed status/`mcp_tool` mismatches: 0

Status histogram:

| Status | Count |
| --- | ---: |
| BLOCKED_NEEDS_USER | 5 |
| EXPLORED_PATH_KNOWN | 1 |
| FAIL_CLOSED_COMMAND_TIMEOUT | 1 |
| FAIL_CLOSED_EXT_BACKEND | 11 |
| FAIL_CLOSED_MANAGED | 3 |
| FAIL_CLOSED_UNSUPPORTED | 9 |
| IMPLEMENTED_GREEN | 67 |
| OK_DEFERRED | 37 |
| OK_EXT_BACKEND | 19 |
| OK_MANAGED_CDP_ONLY | 14 |
| OUT_OF_SCOPE | 8 |

Spot-check rows:

| feature_id | mcp_tool | status | Matches seed |
| --- | --- | --- | --- |
| chatgpt-upload-and-query | webai_chatgpt_upload_and_query | IMPLEMENTED_GREEN | yes |
| chatgpt-voice-mode | null | BLOCKED_NEEDS_USER | yes |
| gemini-conversation-reuse-mgr | webai_gemini_send_prompt | OK_MANAGED_CDP_ONLY | yes |

Artifacts:
- `.runs/maintenance-2026-05-26/library-import-initial-failure.json`
- `.runs/maintenance-2026-05-26/integration-registry-schema-before.json`
- `.runs/maintenance-2026-05-26/integration-registry-local-schema-migration.json`
- `.runs/maintenance-2026-05-26/library-import-result.json`
- `.runs/maintenance-2026-05-26/library-import-verification.json`

## Step 5 gate results

- Final `rm -rf dist && npm run build`: PASS.
- `npm test`: PASS — 731/731.
- Final 8-lock spot-check: unchanged.
- Targeted Wave 11 status before commit: `docs/capability-library.json`, `.runs/maintenance-2026-05-26/**`, this acceptance artifact.

Note: the repository had pre-existing uncommitted post-ship Wave artifacts before this maintenance run. They were preserved and not staged for this wave.

## Net outcome

Catalog edits committed: Phase 8 download-PDF capability-library rows are now explicit by `feature_id`, dated 2026-05-26, evidence-tagged, and re-imported into the local integration registry.

## Follow-up flags for later waves

- Snapshot drift pre-detection remains deferred because `data/site-maps/` had no baseline JSON and no already-running/headed browser was available under this wave's no-launch constraint.
- Broader exact catalog parity still flags `research_` tools absent from `docs/capability-library.json` and combined-string `webai_` rows. Current importer-tokenized webai parity only misses `webai_literature_task_status`.
- Source migration for `integration_registry` still encodes the older six-status SQLite `CHECK`; this wave recovered the untracked local DB only, per the no-`src/`/no-test-change constraint.
