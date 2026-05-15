# A8 — upload-code

Status: PASS

## Observation

Fresh tab `A8-cgpt` (temp chat). Temp-chat consent dismissed. Uploaded `data/test-fixtures/smoke-code.py` via `#upload-files` `--confirmed`. Filename observed in DOM.

Sent: `What does the add function return for inputs 4 and 5?`. Model reply, verbatim:
> The add function returns 9 for inputs 4 and 5, because it returns a + b.

PASS — filename in DOM; correct answer `9` in response.
