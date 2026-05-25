# G4 blocker — gemini-generate-video-ext

Gemini Veo video generation did not meet the closure gate after the original run plus one retry.

- service: gemini
- profile: gemini-9225
- backend: extension-assisted-cdp
- conversation: https://gemini.google.com/app/260e7fc538aef136
- required flag: --reuse-conversation used in both attempts
- closure gate: path non-empty AND file exists AND filename ends with .mp4 AND size_bytes > 16384
- final status: FAIL_CLOSED_EXT_BACKEND
- final errorCode: ELEMENT_NOT_FOUND
- final cause: failed: ELEMENT_NOT_FOUND
- quota-limited: false
- evidence: .runs/capability-explore-2026-05-25/gemini/gemini-generate-video-ext.json
- recipe: examples/workflows/gemini-generate-video-ext.yaml

## Attempts

- attempt 1: cli_exit=0, wall_ms=196, task_id=task_1779650199193_58046fd4b0f8, task_status=failed, progress=failed: ELEMENT_NOT_FOUND, errorCode=ELEMENT_NOT_FOUND
- attempt 2: cli_exit=0, wall_ms=208, task_id=task_1779650265229_a95da180eb2f, task_status=failed, progress=failed: ELEMENT_NOT_FOUND, errorCode=ELEMENT_NOT_FOUND

## Required next action

Treat this bucket as failed (exit 1). Do not switch Gemini profiles for this bucket. Re-run only after the extension-assisted Gemini video selector/download flow is fixed or the live UI exposes the expected Veo controls.
