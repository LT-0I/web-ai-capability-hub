# Capability closure validation report

- Status: complete
- Started: 2026-05-25T05:14:31.838Z
- Finished: 2026-05-25T05:29:32.695Z
- Elapsed seconds: 901
- Results JSONL: .runs/capability-explore-2026-05-25/closure-r6/closure-results.jsonl

## Summary

- Total targeted capabilities: 56
- Processed capabilities: 56
- Green: 29
- Red: 5
- Missing workflow: 0
- Fail-closed status total: 22
- Fail-closed skipped / previously failed: 22
- Skipped total: 22

## Red list

| service | id | errorCode | cause | evidence |
| --- | --- | --- | --- | --- |
| chatgpt | chatgpt-deep-research-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r6/chatgpt/chatgpt-deep-research-ext.json |
| claude | claude-design-present-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r6/claude/claude-design-present-mgr.json |
| claude | claude-send-thinking-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r6/claude/claude-send-thinking-ext.json |
| gemini | gemini-conversation-reuse-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r6/gemini/gemini-conversation-reuse-mgr.json |
| gemini | gemini-veo-quota-error-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r6/gemini/gemini-veo-quota-error-mgr.json |

## Manual second-check recommendations

- chatgpt/chatgpt-deep-research-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r6/chatgpt/chatgpt-deep-research-ext.json)
- claude/claude-design-present-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r6/claude/claude-design-present-mgr.json)
- claude/claude-send-thinking-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r6/claude/claude-send-thinking-ext.json)
- gemini/gemini-conversation-reuse-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r6/gemini/gemini-conversation-reuse-mgr.json)
- gemini/gemini-veo-quota-error-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r6/gemini/gemini-veo-quota-error-mgr.json)

## Notes

- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.
- Missing workflow files were marked red with `MISSING_WORKFLOW`.
- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.
