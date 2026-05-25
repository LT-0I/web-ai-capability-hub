# Capability closure validation report

- Status: complete
- Started: 2026-05-24T21:08:57.387Z
- Finished: 2026-05-24T21:09:35.783Z
- Elapsed seconds: 38
- Results JSONL: .runs/capability-explore-2026-05-25/closure/closure-results.jsonl

## Summary

- Total targeted capabilities: 56
- Processed capabilities: 56
- Green: 0
- Red: 34
- Missing workflow: 9
- Fail-closed status total: 22
- Fail-closed skipped / previously failed: 22
- Skipped total: 31

## Red list

| service | id | errorCode | cause | evidence |
| --- | --- | --- | --- | --- |
| chatgpt | chatgpt-canvas-create-export-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-canvas-create-export-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-canvas-create-export-ext.json |
| chatgpt | chatgpt-codex-submit-task-ext-fallback | INVALID_WORKFLOW | Workflow chatgpt-chatgpt-codex-submit-task-ext-fallback result.type is not supported: task | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-codex-submit-task-ext-fallback.json |
| chatgpt | chatgpt-deep-research-ext | CLOSURE_CRITERION_MISMATCH | deep research report/framework gate failed | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-deep-research-ext.json |
| chatgpt | chatgpt-pulse-get-ext-fallback | CLOSURE_CRITERION_MISMATCH | digest_text gate failed | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-pulse-get-ext-fallback.json |
| chatgpt | chatgpt-select-model-thinking-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-select-model-thinking-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-select-model-thinking-ext.json |
| chatgpt | chatgpt-send-basic-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-send-basic-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-basic-ext.json |
| chatgpt | chatgpt-send-thinking-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-send-thinking-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-thinking-ext.json |
| chatgpt | chatgpt-send-web-search-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-web-search-ext.json |
| chatgpt | chatgpt-upload-multi-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-upload-multi-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-upload-multi-ext.json |
| chatgpt | chatgpt-upload-single-ext | INVALID_WORKFLOW | Workflow examples/workflows/chatgpt-chatgpt-upload-single-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-upload-single-ext.json |
| claude | claude-design-create-project-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/claude/claude-design-create-project-mgr.json |
| claude | claude-design-generate-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/claude/claude-design-generate-mgr.json |
| claude | claude-design-present-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/claude/claude-design-present-mgr.json |
| claude | claude-generate-file-csv-ext | CLOSURE_CRITERION_MISMATCH | CSV path/content gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-generate-file-csv-ext.json |
| claude | claude-generate-file-py-ext | CLOSURE_CRITERION_MISMATCH | PY path/content gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-generate-file-py-ext.json |
| claude | claude-send-basic-ext | CLOSURE_CRITERION_MISMATCH | response/completion/chat_url gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-send-basic-ext.json |
| claude | claude-send-incognito-ext | CLOSURE_CRITERION_MISMATCH | incognito response/url gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-send-incognito-ext.json |
| claude | claude-send-style-ext | CLOSURE_CRITERION_MISMATCH | style dual-response gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-send-style-ext.json |
| claude | claude-send-thinking-ext | CLOSURE_CRITERION_MISMATCH | thinking arithmetic gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-send-thinking-ext.json |
| claude | claude-send-web-search-ext | CLOSURE_CRITERION_MISMATCH | web-search date gate failed | .runs/capability-explore-2026-05-25/closure/claude/claude-send-web-search-ext.json |
| claude | claude-upload-multi-ext | INVALID_WORKFLOW | Workflow examples/workflows/claude-claude-upload-multi-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/claude/claude-upload-multi-ext.json |
| claude | claude-upload-single-ext | INVALID_WORKFLOW | Workflow examples/workflows/claude-claude-upload-single-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/claude/claude-upload-single-ext.json |
| gemini | gemini-canvas-edit-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-canvas-edit-mgr.json |
| gemini | gemini-conversation-reuse-mgr | CLOSURE_CRITERION_MISMATCH | reuse response apple gate failed | .runs/capability-explore-2026-05-25/closure/gemini/gemini-conversation-reuse-mgr.json |
| gemini | gemini-gems-converse-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-gems-converse-mgr.json |
| gemini | gemini-generate-image-ext | INVALID_WORKFLOW | Workflow examples/workflows/gemini-generate-image-ext.yaml requires id and target | .runs/capability-explore-2026-05-25/closure/gemini/gemini-generate-image-ext.json |
| gemini | gemini-multimodal-mgr | CLOSURE_CRITERION_MISMATCH | multimodal text/color/shape gate failed | .runs/capability-explore-2026-05-25/closure/gemini/gemini-multimodal-mgr.json |
| gemini | gemini-music-download-track-ext | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-music-download-track-ext.json |
| gemini | gemini-music-generate-ext | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-music-generate-ext.json |
| gemini | gemini-music-task-status-ext | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-music-task-status-ext.json |
| gemini | gemini-send-basic-mgr | CLOSURE_CRITERION_MISMATCH | response/completion gate failed | .runs/capability-explore-2026-05-25/closure/gemini/gemini-send-basic-mgr.json |
| gemini | gemini-upload-single-mgr | CLOSURE_CRITERION_MISMATCH | upload response alpha gate failed | .runs/capability-explore-2026-05-25/closure/gemini/gemini-upload-single-mgr.json |
| gemini | gemini-veo-quota-error-mgr | MISSING_WORKFLOW | missing-workflow | .runs/capability-explore-2026-05-25/closure/gemini/gemini-veo-quota-error-mgr.json |
| gemini | gemini-workspace-mgr | CLOSURE_CRITERION_MISMATCH | workspace array/count gate failed | .runs/capability-explore-2026-05-25/closure/gemini/gemini-workspace-mgr.json |

## Manual second-check recommendations

- chatgpt/chatgpt-canvas-create-export-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-canvas-create-export-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-canvas-create-export-ext.json)
- chatgpt/chatgpt-codex-submit-task-ext-fallback: INVALID_WORKFLOW — Workflow chatgpt-chatgpt-codex-submit-task-ext-fallback result.type is not supported: task (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-codex-submit-task-ext-fallback.json)
- chatgpt/chatgpt-deep-research-ext: CLOSURE_CRITERION_MISMATCH — deep research report/framework gate failed (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-deep-research-ext.json)
- chatgpt/chatgpt-pulse-get-ext-fallback: CLOSURE_CRITERION_MISMATCH — digest_text gate failed (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-pulse-get-ext-fallback.json)
- chatgpt/chatgpt-select-model-thinking-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-select-model-thinking-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-select-model-thinking-ext.json)
- chatgpt/chatgpt-send-basic-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-send-basic-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-basic-ext.json)
- chatgpt/chatgpt-send-thinking-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-send-thinking-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-thinking-ext.json)
- chatgpt/chatgpt-send-web-search-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-send-web-search-ext.json)
- chatgpt/chatgpt-upload-multi-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-upload-multi-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-upload-multi-ext.json)
- chatgpt/chatgpt-upload-single-ext: INVALID_WORKFLOW — Workflow examples/workflows/chatgpt-chatgpt-upload-single-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/chatgpt/chatgpt-upload-single-ext.json)
- claude/claude-design-create-project-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/claude/claude-design-create-project-mgr.json)
- claude/claude-design-generate-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/claude/claude-design-generate-mgr.json)
- claude/claude-design-present-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/claude/claude-design-present-mgr.json)
- claude/claude-generate-file-csv-ext: CLOSURE_CRITERION_MISMATCH — CSV path/content gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-generate-file-csv-ext.json)
- claude/claude-generate-file-py-ext: CLOSURE_CRITERION_MISMATCH — PY path/content gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-generate-file-py-ext.json)
- claude/claude-send-basic-ext: CLOSURE_CRITERION_MISMATCH — response/completion/chat_url gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-send-basic-ext.json)
- claude/claude-send-incognito-ext: CLOSURE_CRITERION_MISMATCH — incognito response/url gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-send-incognito-ext.json)
- claude/claude-send-style-ext: CLOSURE_CRITERION_MISMATCH — style dual-response gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-send-style-ext.json)
- claude/claude-send-thinking-ext: CLOSURE_CRITERION_MISMATCH — thinking arithmetic gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-send-thinking-ext.json)
- claude/claude-send-web-search-ext: CLOSURE_CRITERION_MISMATCH — web-search date gate failed (.runs/capability-explore-2026-05-25/closure/claude/claude-send-web-search-ext.json)
- claude/claude-upload-multi-ext: INVALID_WORKFLOW — Workflow examples/workflows/claude-claude-upload-multi-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/claude/claude-upload-multi-ext.json)
- claude/claude-upload-single-ext: INVALID_WORKFLOW — Workflow examples/workflows/claude-claude-upload-single-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/claude/claude-upload-single-ext.json)
- gemini/gemini-canvas-edit-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-canvas-edit-mgr.json)
- gemini/gemini-conversation-reuse-mgr: CLOSURE_CRITERION_MISMATCH — reuse response apple gate failed (.runs/capability-explore-2026-05-25/closure/gemini/gemini-conversation-reuse-mgr.json)
- gemini/gemini-gems-converse-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-gems-converse-mgr.json)
- gemini/gemini-generate-image-ext: INVALID_WORKFLOW — Workflow examples/workflows/gemini-generate-image-ext.yaml requires id and target (.runs/capability-explore-2026-05-25/closure/gemini/gemini-generate-image-ext.json)
- gemini/gemini-multimodal-mgr: CLOSURE_CRITERION_MISMATCH — multimodal text/color/shape gate failed (.runs/capability-explore-2026-05-25/closure/gemini/gemini-multimodal-mgr.json)
- gemini/gemini-music-download-track-ext: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-music-download-track-ext.json)
- gemini/gemini-music-generate-ext: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-music-generate-ext.json)
- gemini/gemini-music-task-status-ext: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-music-task-status-ext.json)
- gemini/gemini-send-basic-mgr: CLOSURE_CRITERION_MISMATCH — response/completion gate failed (.runs/capability-explore-2026-05-25/closure/gemini/gemini-send-basic-mgr.json)
- gemini/gemini-upload-single-mgr: CLOSURE_CRITERION_MISMATCH — upload response alpha gate failed (.runs/capability-explore-2026-05-25/closure/gemini/gemini-upload-single-mgr.json)
- gemini/gemini-veo-quota-error-mgr: MISSING_WORKFLOW — missing-workflow (.runs/capability-explore-2026-05-25/closure/gemini/gemini-veo-quota-error-mgr.json)
- gemini/gemini-workspace-mgr: CLOSURE_CRITERION_MISMATCH — workspace array/count gate failed (.runs/capability-explore-2026-05-25/closure/gemini/gemini-workspace-mgr.json)

## Notes

- `FAIL_CLOSED_*` capabilities were checked first, not re-run, and marked `previously-failed`.
- Missing workflow files were marked red with `MISSING_WORKFLOW`.
- `workflow:run` commands were launched with `WAH_BROWSER_EXECUTABLE=/bin/false` so a stale/missing CDP endpoint cannot open a new Chrome process. Existing CDP sessions may still be attached.
