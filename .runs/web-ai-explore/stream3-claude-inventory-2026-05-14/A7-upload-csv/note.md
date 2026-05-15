# A7 — upload-csv

**Status:** PASS

Uploaded `data/test-fixtures/smoke-data.csv` via `#chat-input-file-upload-onpage`.
Post-upload chip text observed in DOM: `smoke-data.csv CSV`.

Question typed: `Which city has the largest population?`

Claude response (captured `response.txt`):
> Shanghai has the largest population at 24,870,895, followed closely by
> Beijing at 21,893,095.

Correct answer per CSV (Shanghai 24,870,895 > Beijing 21,893,095). Thinking
indicator observed: "Thinking about identifying the world's most populous
city".

Evidence: `upload.json`, `read-response.json`, `response.txt`.
