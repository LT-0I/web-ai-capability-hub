# A7 — upload-csv

Status: PASS

## Observation

Fresh tab `A7-cgpt` on `https://chatgpt.com/?temporary-chat=true`. Temp-chat consent dialog dismissed with `Continue`. Uploaded `data/test-fixtures/smoke-data.csv` to `#upload-files` (`--confirmed`). Filename `smoke-data.csv` observed in DOM (`Document` chip).

Sent prompt: `Which city has the largest population?` via type into `#prompt-textarea` then click `#composer-submit-button` (`--confirmed`). Waited 35s.

Model reply, verbatim (first line after "Thought for 12s"):
> Shanghai has the largest population: 24,870,895.

PASS — filename in DOM; correct answer `Shanghai` in response.
