# A11 — download-code

Status: PASS

## Observation

Fresh tab `A11-cgpt` on `https://chatgpt.com/?temporary-chat=true`. Sent prompt:

> Generate a small Python file that prints hello world; produce it as a downloadable file.

(Needed `--confirmed` on `browser:type` because the literal text contains `download` which the sensitivity guard matches.)

Model produced an inline downloadable artifact. Visible response, verbatim:

> Done: Download hello_world.py

Render: a `<button class="behavior-btn">Download hello_world.py</button>` was rendered inline. Used `browser:artifact-click --profile chatgpt --tab-url-contains temporary-chat --button-selector "button.behavior-btn" --download-dir <A11>/download` to capture the artifact via the contract's CDP-level click path (no `download.click()`).

Captured file: `download/hello_world.py`
- size: 21 bytes
- sha256: `4660ab1ff310887b8f4727933f68eeb74012a5fbc7107d500b146796f0d95b6b`
- content: `print("hello world")\n`
- frameUrl: `https://chatgpt.com/?temporary-chat=true`
- elapsedMs: 2058

PASS — file on disk, size > 0, sha256 recorded, content matches request.
