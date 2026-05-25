# C5 blocker — all ChatGPT code generate-file probes failed

Created: 2026-05-24T18:40:48.326Z

All three C5 capabilities failed closed under extension-assisted-cdp.

| capability | status | evidence | error | cause |
| --- | --- | --- | --- | --- |
| chatgpt-generate-file-py-ext | FAIL_CLOSED_EXT_BACKEND | .runs/capability-explore-2026-05-25/chatgpt/chatgpt-generate-file-py-ext.json | ELEMENT_NOT_FOUND | attempt 1: ELEMENT_NOT_FOUND: No element matched --button-selector; attempt 2: ELEMENT_NOT_FOUND: No element matched --button-selector |
| chatgpt-generate-file-md-ext | FAIL_CLOSED_EXT_BACKEND | .runs/capability-explore-2026-05-25/chatgpt/chatgpt-generate-file-md-ext.json | UNKNOWN | attempt 1: ELEMENT_NOT_FOUND: No element matched --button-selector; attempt 2: UNKNOWN: page.goto: net::ERR_CONNECTION_CLOSED at https://chatgpt.com/?model=gpt-4o Call log: [2m - navigating to "https://chatgpt.com/?model=gpt-4o", waiting until "load"[22m  |
| chatgpt-generate-file-csv-ext | FAIL_CLOSED_EXT_BACKEND | .runs/capability-explore-2026-05-25/chatgpt/chatgpt-generate-file-csv-ext.json | UNKNOWN | attempt 1: UNKNOWN: page.goto: net::ERR_CONNECTION_CLOSED at https://chatgpt.com/?model=gpt-4o Call log: [2m - navigating to "https://chatgpt.com/?model=gpt-4o", waiting until "load"[22m ; attempt 2: UNKNOWN: page.goto: net::ERR_NAME_NOT_RESOLVED at https://chatgpt.com/?model=gpt-4o Call log: [2m - navigating to "https://chatgpt.com/?model=gpt-4o", waiting until "load"[22m  |
