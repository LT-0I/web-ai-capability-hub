# Capability closure validation report

- Status: complete
- Started: 2026-05-25T07:10:50.673Z
- Finished: 2026-05-25T07:26:32.173Z
- Elapsed seconds: 942
- Results JSONL: .runs/capability-explore-2026-05-25/closure-r8/closure-results.jsonl

## Summary

- Total targeted capabilities: 56
- Processed capabilities: 56
- Green: 33
- Red: 1
- Missing workflow: 0
- Fail-closed status total: 22
- Fail-closed skipped / previously failed: 22
- Skipped total: 22

## Red list

| service | id | errorCode | cause | evidence |
| --- | --- | --- | --- | --- |
| gemini | gemini-conversation-reuse-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r8/gemini/gemini-conversation-reuse-mgr.json |

## Manual second-check recommendations

- gemini/gemini-conversation-reuse-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r8/gemini/gemini-conversation-reuse-mgr.json)

## Notes

- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.
- Missing workflow files were marked red with `MISSING_WORKFLOW`.
- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.
