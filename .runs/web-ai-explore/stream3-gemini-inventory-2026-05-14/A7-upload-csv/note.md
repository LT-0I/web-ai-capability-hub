# A7 — upload-csv

**Status:** PASS

Allocated new tab. An email-opt-in discovery card (`Stay in the know`) blocked
the composer; dismissed with `Not now` (logged in consent-log.md #2). Re-opened
upload menu, clicked `Upload files`, set `smoke-data.csv` on `input[type="file"]`.
Filename `smoke-data.csv` appeared in DOM. Typed `Which city has the largest
population?` and pressed Enter. After 18s, response contained:
`Based on the data in smoke-data.csv, Shanghai has the largest population
with 24,870,895 residents.` — correct answer (Shanghai).

Evidence: `upload-2.stdout.json`, `response.stdout.json`, `response.txt`.
