# A9 — upload-image

Status: PASS

## Observation

Fresh tab `A9-cgpt` (temp chat). Temp-chat dialog dismissed. Uploaded `data/test-fixtures/smoke-image.png` via `#upload-files` `--confirmed`. Filename observed in DOM.

Sent: `Describe this image in one sentence.`. Model reply, verbatim:
> A plain red square with a solid, uniform color fill.

PASS — filename in DOM; response mentions `red`.
