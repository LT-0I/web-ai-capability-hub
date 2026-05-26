# Post-ship fix wave 6 workflow re-smoke

- Finished: 2026-05-26T09:01:19.986Z
- Result: 2/8 PASS
- Ship gate: STOP

| Cluster | Workflow | Result | Exit | Notes |
|---|---|---:|---:|---|
| D | gemini-image-draft | FAIL | 1 |  |
| D | research-database-search-dry-run | FAIL | 1 |  |
| F | claude-generate-file-pptx-ext | PASS | 0 |  |
| C#14 | gemini-send-web-search-mgr | FAIL | 0 | command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}/ failed |
| C#16 | gemini-veo-quota-error-mgr | FAIL | 0 | command gate failed: exit_code 1 !== 0; json_path path empty |
| E#42 | claude-design-present | PASS | 0 | final=text/html |
| F | chatgpt-generate-file-pptx-ext | FAIL | 0 | command gate failed: exit_code 1 !== 0; json_path path empty |
| H#58 | chatgpt-send-web-search-ext | FAIL | 0 | command gate failed: exit_code 1 !== 0; json_path response_text regex /20\d{2}|May|5月|January|February|March|April|June|July|August|September|October|November|December/ failed; json_path completion_detected !== true |
