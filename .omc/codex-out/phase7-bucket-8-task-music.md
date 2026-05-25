Done and pushed.

- Commit: `02ab20e` — `webai: phase 7 bucket 8 — task_status + gemini music polling extension drivers (3 tools)`
- Pushed: `origin/main`
- Acceptance report: `.omc/codex-out/phase7-bucket-8-task-music.md`

Validation:
- `npm test` → `677/677` pass, includes build
- Bucket 8 targeted tests + golden/codemod → `8/8` pass
- `git diff -- src/generated` → empty
- 8-lock held: `1.0.0`, `consumer-contract-1.10.0`, `191/40/121/8/39`, golden `195`

Live smokes:
- `webai_task_status` → ok
- `webai_gemini_music_task_status` → ok
- `webai_gemini_music_download_track` → ok
- Artifacts captured under `.runs/phase7-bucket-8/smoke-*.json`

Left unstaged/unrelated:
- `.omc/codex-out/phase7-bucket-5-deep-research.md`
- `.omc/codex-out/phase7-bucket-6-chatgpt-codex.md`
- `.omc/codex-out/phase7-bucket-7-canvas-pulse-design.md`
- `.runs/phase7-bucket-7/`
- `docs/plans/web-research-literature-download-phase8.md`