# Post-ship fix wave 7 workflow re-smoke

- Finished: 2026-05-26T09:51:53.188Z
- Result: 6/8 PASS (gate: >=5/8 PASS)
- Ship gate: PASS

| Cluster | Workflow | Result | Exit | Notes |
|---|---|---:|---:|---|
| G | chatgpt-generate-file-csv-ext | PASS | 0 |  |
| G | chatgpt-generate-file-docx-ext | PASS | 0 |  |
| G | chatgpt-generate-file-md-ext | PASS | 0 |  |
| G | chatgpt-generate-file-pptx-ext | FAIL | 0 | invoke-cli::command gate failed: exit_code 1 !== 0; json_path path empty |
| F#50 | chatgpt-generate-file-py-ext | PASS | 0 |  |
| H | chatgpt-canvas-create-export-ext | PASS | 0 |  |
| H | chatgpt-codex-submit-task-ext-fallback | FAIL | 0 | invoke-cli::command gate failed: exit_code 1 !== 0; json_path task_id empty |
| H | chatgpt-send-web-search-ext | PASS | 0 |  |
