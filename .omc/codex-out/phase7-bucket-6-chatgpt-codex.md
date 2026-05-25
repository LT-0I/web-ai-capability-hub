Done and pushed.

- Commit: `e7d6647` — `webai: phase 7 bucket 6 — chatgpt codex_* extension drivers (4 tools)`
- Pushed: `origin/main`
- Acceptance report: `.omc/codex-out/phase7-bucket-6-chatgpt-codex.md`

Validation:
- `npm run build` → pass
- `npm test` → `677/677` pass
- Targeted B6/golden/codemod → `8/8` pass
- 8-lock held: `1.0.0`, `consumer-contract-1.10.0`, `191/40/121/8/39`

Live smoke:
- `codex_list_envs` extension smoke → ok
- `codex_task_status` → non-blocking `INVALID_ARGS` LT-0I/CN- proof failure recorded
- `codex_submit_task` / `codex_get_diff` skipped per instruction; no codex `--dry-run` exposed

Left unstaged/unrelated:
- `.omc/codex-out/phase7-bucket-5-deep-research.md`
- `docs/plans/web-research-literature-download-phase8.md`