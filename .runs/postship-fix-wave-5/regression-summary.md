# Post-ship fix wave 5 workflow regression

Generated: 2026-05-26T08:14:14Z
Batch discipline: strict serial; grouped Gemini → Claude → other → ChatGPT; tab cleanup before/after each YAML; sleeps ≥10s non-ChatGPT and ≥30s ChatGPT; ChatGPT 429 retry/defer policy enabled.

Total YAMLs: 63
Completed: 63
PASS: 42
FAIL: 21
DEFERRED_RATE_LIMIT: 0
ChatGPT rate-limit detections: 0
Final PASS rate: 42/63

## Failure categories

- CHROME_EXTENSION_NOT_CONNECTED: 6
- COMMAND_TIMEOUT: 6
- ELEMENT_NOT_FOUND: 5
- UNKNOWN: 3
- ARTIFACT_DOWNLOAD_TIMEOUT: 1

## Per-yaml results

| # | Service | Workflow | File | Status | Error code | ChatGPT rate-limit? | Duration ms | Artifact | Message |
|---:|---|---|---|---|---|---:|---:|---|---|
| 1 | gemini | `gemini-canvas-edit-mgr` | `examples/workflows/gemini-canvas-edit.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 1588 | `.runs/postship-fix-wave-5/workflows/gemini-canvas-edit-mgr.json` | command gate failed: exit_code 1 !== 0; json_path canvas_opened !== true |
| 2 | gemini | `gemini-canvas-to-docs-mgr` | `examples/workflows/gemini-canvas-to-docs-mgr.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 126854 | `.runs/postship-fix-wave-5/workflows/gemini-canvas-to-docs-mgr.json` | command gate failed: exit_code 1 !== 0; json_path docs_url regex /docs\.google\.com/ failed |
| 3 | gemini | `gemini-deep-research-mgr` | `examples/workflows/gemini-deep-research-mgr.yaml` | PASS |  | no | 10050 | `.runs/postship-fix-wave-5/workflows/gemini-deep-research-mgr.json` | ok |
| 4 | gemini | `gemini-canvas-edit-mgr` | `examples/workflows/gemini-gemini-canvas-edit-mgr.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 21064 | `.runs/postship-fix-wave-5/workflows/gemini-canvas-edit-mgr--gemini-gemini-canvas-edit-mgr.json` | command gate failed: exit_code 1 !== 0; json_path canvas_opened !== true; json_path canvas_html_before empty; json_path canvas_html_after empty |
| 5 | gemini | `gemini-conversation-reuse-mgr` | `examples/workflows/gemini-gemini-conversation-reuse-mgr.yaml` | PASS |  | no | 18085 | `.runs/postship-fix-wave-5/workflows/gemini-conversation-reuse-mgr.json` | ok |
| 6 | gemini | `gemini-gems-converse-mgr` | `examples/workflows/gemini-gemini-gems-converse-mgr.yaml` | PASS |  | no | 9652 | `.runs/postship-fix-wave-5/workflows/gemini-gems-converse-mgr.json` | ok |
| 7 | gemini | `gemini-multimodal-mgr` | `examples/workflows/gemini-gemini-multimodal-mgr.yaml` | PASS |  | no | 13220 | `.runs/postship-fix-wave-5/workflows/gemini-multimodal-mgr.json` | ok |
| 8 | gemini | `gemini-music-download-track-ext` | `examples/workflows/gemini-gemini-music-download-track-ext.yaml` | PASS |  | no | 68006 | `.runs/postship-fix-wave-5/workflows/gemini-music-download-track-ext.json` | ok |
| 9 | gemini | `gemini-music-generate-ext` | `examples/workflows/gemini-gemini-music-generate-ext.yaml` | PASS |  | no | 88857 | `.runs/postship-fix-wave-5/workflows/gemini-music-generate-ext.json` | ok |
| 10 | gemini | `gemini-music-task-status-ext` | `examples/workflows/gemini-gemini-music-task-status-ext.yaml` | PASS |  | no | 52808 | `.runs/postship-fix-wave-5/workflows/gemini-music-task-status-ext.json` | ok |
| 11 | gemini | `gemini-select-model-flash-mgr` | `examples/workflows/gemini-gemini-select-model-flash-mgr.yaml` | PASS |  | no | 8454 | `.runs/postship-fix-wave-5/workflows/gemini-select-model-flash-mgr.json` | ok |
| 12 | gemini | `gemini-send-basic-mgr` | `examples/workflows/gemini-gemini-send-basic-mgr.yaml` | PASS |  | no | 8345 | `.runs/postship-fix-wave-5/workflows/gemini-send-basic-mgr.json` | ok |
| 13 | gemini | `gemini-send-thinking-mgr` | `examples/workflows/gemini-gemini-send-thinking-mgr.yaml` | PASS |  | no | 20950 | `.runs/postship-fix-wave-5/workflows/gemini-send-thinking-mgr.json` | ok |
| 14 | gemini | `gemini-send-web-search-mgr` | `examples/workflows/gemini-gemini-send-web-search-mgr.yaml` | FAIL | ELEMENT_NOT_FOUND | no | 4712 | `.runs/postship-fix-wave-5/workflows/gemini-send-web-search-mgr.json` | command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}/ failed |
| 15 | gemini | `gemini-upload-single-mgr` | `examples/workflows/gemini-gemini-upload-single-mgr.yaml` | PASS |  | no | 12384 | `.runs/postship-fix-wave-5/workflows/gemini-upload-single-mgr.json` | ok |
| 16 | gemini | `gemini-veo-quota-error-mgr` | `examples/workflows/gemini-gemini-veo-quota-error-mgr.yaml` | FAIL | COMMAND_TIMEOUT | no | 120265 | `.runs/postship-fix-wave-5/workflows/gemini-veo-quota-error-mgr.json` | command timed out |
| 17 | gemini | `gemini-workspace-mgr` | `examples/workflows/gemini-gemini-workspace-mgr.yaml` | PASS |  | no | 1174 | `.runs/postship-fix-wave-5/workflows/gemini-workspace-mgr.json` | ok |
| 18 | gemini | `gemini-gems-converse-mgr` | `examples/workflows/gemini-gems-converse.yaml` | PASS |  | no | 9618 | `.runs/postship-fix-wave-5/workflows/gemini-gems-converse-mgr--gemini-gems-converse.json` | ok |
| 19 | gemini | `gemini-generate-image-ext` | `examples/workflows/gemini-generate-image-ext.yaml` | PASS |  | no | 42677 | `.runs/postship-fix-wave-5/workflows/gemini-generate-image-ext.json` | ok |
| 20 | gemini | `gemini-generate-video-ext` | `examples/workflows/gemini-generate-video-ext.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 129186 | `.runs/postship-fix-wave-5/workflows/gemini-generate-video-ext.json` | command gate failed: exit_code 1 !== 0; json_path path empty |
| 21 | gemini | `gemini-image-draft` | `examples/workflows/gemini-image-draft.yaml` | FAIL | UNKNOWN | no | 12240 | `.runs/postship-fix-wave-5/workflows/gemini-image-draft.json` | {"ok":false,"error":"CDP endpoint did not become ready at http://127.0.0.1:36617/json/version: connect ECONNREFUSED 127.0.0.1:36617"} |
| 22 | gemini | `gemini-music-generate-chain` | `examples/workflows/gemini-music-generate-chain.yaml` | FAIL | ELEMENT_NOT_FOUND | no | 13757 | `.runs/postship-fix-wave-5/workflows/gemini-music-generate-chain.json` | command gate failed: exit_code 1 !== 0; json_path task_id empty |
| 23 | claude | `claude-conversation-manage-mgr` | `examples/workflows/claude-claude-conversation-manage-mgr.yaml` | PASS |  | no | 381 | `.runs/postship-fix-wave-5/workflows/claude-conversation-manage-mgr.json` | ok |
| 24 | claude | `claude-design-create-project-mgr` | `examples/workflows/claude-claude-design-create-project-mgr.yaml` | PASS |  | no | 5343 | `.runs/postship-fix-wave-5/workflows/claude-design-create-project-mgr.json` | ok |
| 25 | claude | `claude-design-generate-mgr` | `examples/workflows/claude-claude-design-generate-mgr.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 706 | `.runs/postship-fix-wave-5/workflows/claude-design-generate-mgr.json` | command gate failed: exit_code 1 !== 0; json_path fileName empty |
| 26 | claude | `claude-design-present-mgr` | `examples/workflows/claude-claude-design-present-mgr.yaml` | FAIL | CHROME_EXTENSION_NOT_CONNECTED | no | 487 | `.runs/postship-fix-wave-5/workflows/claude-design-present-mgr.json` | command gate failed: exit_code 1 !== 0; json_path presentUrl regex //serve/\|\?file=/ failed |
| 27 | claude | `claude-generate-file-csv-ext` | `examples/workflows/claude-claude-generate-file-csv-ext.yaml` | PASS |  | no | 25652 | `.runs/postship-fix-wave-5/workflows/claude-generate-file-csv-ext.json` | ok |
| 28 | claude | `claude-generate-file-docx-ext` | `examples/workflows/claude-claude-generate-file-docx-ext.yaml` | PASS |  | no | 47023 | `.runs/postship-fix-wave-5/workflows/claude-generate-file-docx-ext.json` | ok |
| 29 | claude | `claude-generate-file-md-ext` | `examples/workflows/claude-claude-generate-file-md-ext.yaml` | PASS |  | no | 37052 | `.runs/postship-fix-wave-5/workflows/claude-generate-file-md-ext.json` | ok |
| 30 | claude | `claude-generate-file-pptx-ext` | `examples/workflows/claude-claude-generate-file-pptx-ext.yaml` | FAIL | ARTIFACT_DOWNLOAD_TIMEOUT | no | 104085 | `.runs/postship-fix-wave-5/workflows/claude-generate-file-pptx-ext.json` | command gate failed: exit_code 1 !== 0; json_path path empty |
| 31 | claude | `claude-generate-file-py-ext` | `examples/workflows/claude-claude-generate-file-py-ext.yaml` | PASS |  | no | 20256 | `.runs/postship-fix-wave-5/workflows/claude-generate-file-py-ext.json` | ok |
| 32 | claude | `claude-select-model-sonnet-ext` | `examples/workflows/claude-claude-select-model-sonnet-ext.yaml` | PASS |  | no | 1466 | `.runs/postship-fix-wave-5/workflows/claude-select-model-sonnet-ext.json` | ok |
| 33 | claude | `claude-send-basic-ext` | `examples/workflows/claude-claude-send-basic-ext.yaml` | PASS |  | no | 9773 | `.runs/postship-fix-wave-5/workflows/claude-send-basic-ext.json` | ok |
| 34 | claude | `claude-send-incognito-ext` | `examples/workflows/claude-claude-send-incognito-ext.yaml` | PASS |  | no | 10183 | `.runs/postship-fix-wave-5/workflows/claude-send-incognito-ext.json` | ok |
| 35 | claude | `claude-send-style-ext` | `examples/workflows/claude-claude-send-style-ext.yaml` | PASS |  | no | 17945 | `.runs/postship-fix-wave-5/workflows/claude-send-style-ext.json` | ok |
| 36 | claude | `claude-send-thinking-ext` | `examples/workflows/claude-claude-send-thinking-ext.yaml` | PASS |  | no | 11135 | `.runs/postship-fix-wave-5/workflows/claude-send-thinking-ext.json` | ok |
| 37 | claude | `claude-send-web-search-ext` | `examples/workflows/claude-claude-send-web-search-ext.yaml` | PASS |  | no | 8651 | `.runs/postship-fix-wave-5/workflows/claude-send-web-search-ext.json` | ok |
| 38 | claude | `claude-upload-multi-ext` | `examples/workflows/claude-claude-upload-multi-ext.yaml` | PASS |  | no | 14497 | `.runs/postship-fix-wave-5/workflows/claude-upload-multi-ext.json` | ok |
| 39 | claude | `claude-upload-single-ext` | `examples/workflows/claude-claude-upload-single-ext.yaml` | PASS |  | no | 12612 | `.runs/postship-fix-wave-5/workflows/claude-upload-single-ext.json` | ok |
| 40 | claude | `claude-workspace-mgr` | `examples/workflows/claude-claude-workspace-mgr.yaml` | PASS |  | no | 414 | `.runs/postship-fix-wave-5/workflows/claude-workspace-mgr.json` | ok |
| 41 | claude | `claude-design-create-generate` | `examples/workflows/claude-design-create-generate.yaml` | PASS |  | no | 785 | `.runs/postship-fix-wave-5/workflows/claude-design-create-generate.json` | ok |
| 42 | claude | `claude-design-present` | `examples/workflows/claude-design-present.yaml` | FAIL | UNKNOWN | no | 483 | `.runs/postship-fix-wave-5/workflows/claude-design-present.json` | {"ok":false,"error":"Workflow claude-design-present result.type is not supported: text/html"} |
| 43 | other | `research-database-search-dry-run` | `examples/workflows/research-database-search-dry-run.yaml` | FAIL | UNKNOWN | no | 12255 | `.runs/postship-fix-wave-5/workflows/research-database-search-dry-run.json` | {"ok":false,"error":"CDP endpoint did not become ready at http://127.0.0.1:33937/json/version: connect ECONNREFUSED 127.0.0.1:33937"} |
| 44 | chatgpt | `chatgpt-canvas-create-export-ext` | `examples/workflows/chatgpt-canvas-create-export-ext.yaml` | FAIL | ELEMENT_NOT_FOUND | no | 48054 | `.runs/postship-fix-wave-5/workflows/chatgpt-canvas-create-export-ext.json` | command gate failed: exit_code 1 !== 0; json_path path empty |
| 45 | chatgpt | `chatgpt-codex-submit-task-ext-fallback` | `examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml` | FAIL | ELEMENT_NOT_FOUND | no | 781 | `.runs/postship-fix-wave-5/workflows/chatgpt-codex-submit-task-ext-fallback.json` | command gate failed: exit_code 1 !== 0; json_path task_id empty |
| 46 | chatgpt | `chatgpt-conversation-manage-ext-fallback` | `examples/workflows/chatgpt-chatgpt-conversation-manage-ext-fallback.yaml` | PASS |  | no | 396 | `.runs/postship-fix-wave-5/workflows/chatgpt-conversation-manage-ext-fallback.json` | ok |
| 47 | chatgpt | `chatgpt-generate-file-csv-ext` | `examples/workflows/chatgpt-chatgpt-generate-file-csv-ext.yaml` | FAIL | COMMAND_TIMEOUT | no | 240292 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-file-csv-ext.json` | command timed out |
| 48 | chatgpt | `chatgpt-generate-file-docx-ext` | `examples/workflows/chatgpt-chatgpt-generate-file-docx-ext.yaml` | FAIL | COMMAND_TIMEOUT | no | 240274 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-file-docx-ext.json` | command timed out |
| 49 | chatgpt | `chatgpt-generate-file-md-ext` | `examples/workflows/chatgpt-chatgpt-generate-file-md-ext.yaml` | FAIL | COMMAND_TIMEOUT | no | 240375 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-file-md-ext.json` | command timed out |
| 50 | chatgpt | `chatgpt-generate-file-pptx-ext` | `examples/workflows/chatgpt-chatgpt-generate-file-pptx-ext.yaml` | FAIL | COMMAND_TIMEOUT | no | 128311 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-file-pptx-ext.json` | command gate failed: exit_code 1 !== 0; json_path path empty |
| 51 | chatgpt | `chatgpt-generate-file-py-ext` | `examples/workflows/chatgpt-chatgpt-generate-file-py-ext.yaml` | FAIL | COMMAND_TIMEOUT | no | 240273 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-file-py-ext.json` | command timed out |
| 52 | chatgpt | `chatgpt-gpts-converse-ext-fallback` | `examples/workflows/chatgpt-chatgpt-gpts-converse-ext-fallback.yaml` | PASS |  | no | 1461 | `.runs/postship-fix-wave-5/workflows/chatgpt-gpts-converse-ext-fallback.json` | ok |
| 53 | chatgpt | `chatgpt-pulse-get-ext-fallback` | `examples/workflows/chatgpt-chatgpt-pulse-get-ext-fallback.yaml` | PASS |  | no | 2783 | `.runs/postship-fix-wave-5/workflows/chatgpt-pulse-get-ext-fallback.json` | ok |
| 54 | chatgpt | `chatgpt-pulse-onboard-ext-fallback` | `examples/workflows/chatgpt-chatgpt-pulse-onboard-ext-fallback.yaml` | PASS |  | no | 410 | `.runs/postship-fix-wave-5/workflows/chatgpt-pulse-onboard-ext-fallback.json` | ok |
| 55 | chatgpt | `chatgpt-select-model-thinking-ext` | `examples/workflows/chatgpt-chatgpt-select-model-thinking-ext.yaml` | PASS |  | no | 2449 | `.runs/postship-fix-wave-5/workflows/chatgpt-select-model-thinking-ext.json` | ok |
| 56 | chatgpt | `chatgpt-send-basic-ext` | `examples/workflows/chatgpt-chatgpt-send-basic-ext.yaml` | PASS |  | no | 11303 | `.runs/postship-fix-wave-5/workflows/chatgpt-send-basic-ext.json` | ok |
| 57 | chatgpt | `chatgpt-send-thinking-ext` | `examples/workflows/chatgpt-chatgpt-send-thinking-ext.yaml` | PASS |  | no | 12903 | `.runs/postship-fix-wave-5/workflows/chatgpt-send-thinking-ext.json` | ok |
| 58 | chatgpt | `chatgpt-send-web-search-ext` | `examples/workflows/chatgpt-chatgpt-send-web-search-ext.yaml` | FAIL | ELEMENT_NOT_FOUND | no | 10334 | `.runs/postship-fix-wave-5/workflows/chatgpt-send-web-search-ext.json` | command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}\|May\|5月\|January\|February\|March\|April\|June\|July\|August\|September\|October\|November\|December |
| 59 | chatgpt | `chatgpt-upload-multi-ext` | `examples/workflows/chatgpt-chatgpt-upload-multi-ext.yaml` | PASS |  | no | 19027 | `.runs/postship-fix-wave-5/workflows/chatgpt-upload-multi-ext.json` | ok |
| 60 | chatgpt | `chatgpt-upload-single-ext` | `examples/workflows/chatgpt-chatgpt-upload-single-ext.yaml` | PASS |  | no | 21199 | `.runs/postship-fix-wave-5/workflows/chatgpt-upload-single-ext.json` | ok |
| 61 | chatgpt | `chatgpt-workspace-ext-fallback` | `examples/workflows/chatgpt-chatgpt-workspace-ext-fallback.yaml` | PASS |  | no | 413 | `.runs/postship-fix-wave-5/workflows/chatgpt-workspace-ext-fallback.json` | ok |
| 62 | chatgpt | `chatgpt-deep-research-ext` | `examples/workflows/chatgpt-deep-research-ext.yaml` | PASS |  | no | 8189 | `.runs/postship-fix-wave-5/workflows/chatgpt-deep-research-ext.json` | ok |
| 63 | chatgpt | `chatgpt-generate-image-ext` | `examples/workflows/chatgpt-generate-image-ext.yaml` | PASS |  | no | 93245 | `.runs/postship-fix-wave-5/workflows/chatgpt-generate-image-ext.json` | ok |
