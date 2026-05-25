# Capability closure validation report

- Status: complete
- Started: 2026-05-25T02:30:37.184Z
- Finished: 2026-05-25T02:47:12.447Z
- Elapsed seconds: 995
- Results JSONL: .runs/capability-explore-2026-05-25/closure-r2/closure-results.jsonl

## Summary

- Total targeted capabilities: 56
- Processed capabilities: 56
- Green: 11
- Red: 23
- Missing workflow: 0
- Fail-closed status total: 22
- Fail-closed skipped / previously failed: 22
- Skipped total: 22

## Red list

| service | id | errorCode | cause | evidence |
| --- | --- | --- | --- | --- |
| chatgpt | chatgpt-deep-research-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/chatgpt/chatgpt-deep-research-ext.json |
| chatgpt | chatgpt-select-model-thinking-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/chatgpt/chatgpt-select-model-thinking-ext.json |
| claude | claude-design-create-project-mgr | CLOSURE_CRITERION_MISMATCH | project_id/project_url gate failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-create-project-mgr.json |
| claude | claude-design-generate-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-generate-mgr.json |
| claude | claude-design-present-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-present-mgr.json |
| claude | claude-generate-file-csv-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-generate-file-csv-ext.json |
| claude | claude-generate-file-py-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-generate-file-py-ext.json |
| claude | claude-send-basic-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-basic-ext.json |
| claude | claude-send-incognito-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-incognito-ext.json |
| claude | claude-send-style-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-style-ext.json |
| claude | claude-send-thinking-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-thinking-ext.json |
| claude | claude-send-web-search-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-web-search-ext.json |
| claude | claude-upload-multi-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-upload-multi-ext.json |
| claude | claude-upload-single-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/claude/claude-upload-single-ext.json |
| gemini | gemini-canvas-edit-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-canvas-edit-mgr.json |
| gemini | gemini-conversation-reuse-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-conversation-reuse-mgr.json |
| gemini | gemini-generate-image-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-generate-image-ext.json |
| gemini | gemini-multimodal-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-multimodal-mgr.json |
| gemini | gemini-music-download-track-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-download-track-ext.json |
| gemini | gemini-music-generate-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-generate-ext.json |
| gemini | gemini-music-task-status-ext | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-task-status-ext.json |
| gemini | gemini-veo-quota-error-mgr | TIMEOUT | workflow-run-failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-veo-quota-error-mgr.json |
| gemini | gemini-workspace-mgr | CLOSURE_CRITERION_MISMATCH | workspace array/count gate failed | .runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-workspace-mgr.json |

## Manual second-check recommendations

- chatgpt/chatgpt-deep-research-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/chatgpt/chatgpt-deep-research-ext.json)
- chatgpt/chatgpt-select-model-thinking-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/chatgpt/chatgpt-select-model-thinking-ext.json)
- claude/claude-design-create-project-mgr: CLOSURE_CRITERION_MISMATCH — project_id/project_url gate failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-create-project-mgr.json)
- claude/claude-design-generate-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-generate-mgr.json)
- claude/claude-design-present-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-design-present-mgr.json)
- claude/claude-generate-file-csv-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-generate-file-csv-ext.json)
- claude/claude-generate-file-py-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-generate-file-py-ext.json)
- claude/claude-send-basic-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-basic-ext.json)
- claude/claude-send-incognito-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-incognito-ext.json)
- claude/claude-send-style-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-style-ext.json)
- claude/claude-send-thinking-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-thinking-ext.json)
- claude/claude-send-web-search-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-send-web-search-ext.json)
- claude/claude-upload-multi-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-upload-multi-ext.json)
- claude/claude-upload-single-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/claude/claude-upload-single-ext.json)
- gemini/gemini-canvas-edit-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-canvas-edit-mgr.json)
- gemini/gemini-conversation-reuse-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-conversation-reuse-mgr.json)
- gemini/gemini-generate-image-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-generate-image-ext.json)
- gemini/gemini-multimodal-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-multimodal-mgr.json)
- gemini/gemini-music-download-track-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-download-track-ext.json)
- gemini/gemini-music-generate-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-generate-ext.json)
- gemini/gemini-music-task-status-ext: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-music-task-status-ext.json)
- gemini/gemini-veo-quota-error-mgr: TIMEOUT — workflow-run-failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-veo-quota-error-mgr.json)
- gemini/gemini-workspace-mgr: CLOSURE_CRITERION_MISMATCH — workspace array/count gate failed (.runs/capability-explore-2026-05-25/closure-r2/gemini/gemini-workspace-mgr.json)

## Notes

- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.
- Missing workflow files were marked red with `MISSING_WORKFLOW`.
- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.
