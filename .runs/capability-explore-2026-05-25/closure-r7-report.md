# Capability closure validation report

- Status: complete
- Started: 2026-05-25T05:41:33.648Z
- Finished: 2026-05-25T05:51:58.380Z
- Elapsed seconds: 625
- Results JSONL: .runs/capability-explore-2026-05-25/closure-r7/closure-results.jsonl

## Summary

- Total targeted capabilities: 56
- Processed capabilities: 56
- Green: 28
- Red: 6
- Missing workflow: 0
- Fail-closed status total: 22
- Fail-closed skipped / previously failed: 22
- Skipped total: 22

## Red list

| service | id | errorCode | cause | evidence |
| --- | --- | --- | --- | --- |
| claude | claude-generate-file-py-ext | CLOSURE_CRITERION_MISMATCH | PY path/content gate failed | .runs/capability-explore-2026-05-25/closure-r7/claude/claude-generate-file-py-ext.json |
| claude | claude-send-style-ext | CLOSURE_CRITERION_MISMATCH | style dual-response gate failed | .runs/capability-explore-2026-05-25/closure-r7/claude/claude-send-style-ext.json |
| gemini | gemini-conversation-reuse-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-conversation-reuse-mgr.json |
| gemini | gemini-generate-image-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-generate-image-ext.json |
| gemini | gemini-music-generate-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-music-generate-ext.json |
| gemini | gemini-veo-quota-error-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-veo-quota-error-mgr.json |

## Manual second-check recommendations

- claude/claude-generate-file-py-ext: CLOSURE_CRITERION_MISMATCH — PY path/content gate failed (.runs/capability-explore-2026-05-25/closure-r7/claude/claude-generate-file-py-ext.json)
- claude/claude-send-style-ext: CLOSURE_CRITERION_MISMATCH — style dual-response gate failed (.runs/capability-explore-2026-05-25/closure-r7/claude/claude-send-style-ext.json)
- gemini/gemini-conversation-reuse-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-conversation-reuse-mgr.json)
- gemini/gemini-generate-image-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-generate-image-ext.json)
- gemini/gemini-music-generate-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-music-generate-ext.json)
- gemini/gemini-veo-quota-error-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r7/gemini/gemini-veo-quota-error-mgr.json)

## Notes

- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.
- Missing workflow files were marked red with `MISSING_WORKFLOW`.
- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.
