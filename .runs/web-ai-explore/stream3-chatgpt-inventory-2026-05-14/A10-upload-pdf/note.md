# A10 — upload-pdf

Status: PASS

## Observation

Fresh tab `A10-cgpt` (temp chat). Temp-chat dialog dismissed. Uploaded `data/test-fixtures/smoke-doc.pdf` via `#upload-files` `--confirmed`. Filename observed in DOM.

Sent: `What is the title text of this PDF?`. Model reply, verbatim:
> The title text is "Stream #3 Web AI Inventory Test".

PASS — filename in DOM; response quotes the exact title `Stream #3 Web AI Inventory Test`.
