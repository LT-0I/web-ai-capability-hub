# A6 — upload-text

Status: PASS

## Observation

Allocated fresh tab `A6-cgpt` against `https://chatgpt.com/?temporary-chat=true`. Upload-input element discovered at `#upload-files` (`type="file"`, `multiple`). Composer is contenteditable div at `#prompt-textarea`; send button at `#composer-submit-button` (data-testid `send-button`).

Uploaded `data/test-fixtures/smoke-text.txt` (sha256 in `upload-target.txt`) via `browser:upload` with `--confirmed`. Post-upload DOM contained `smoke-text.txt Document` chip ("Filename in DOM: YES").

Temporary-chat consent modal `<dialog>` opened and intercepted the first send click — clicked the dialog's `Continue` button (consent allowed per doctrine). The previously-typed prompt was cleared by the dialog flow, so the first send attempt sent the file with empty body and the model replied `I received smoke-text.txt. What would you like me to do with it?`. Re-typed `Summarize this file in one sentence.`, clicked `#composer-submit-button`, waited 30s.

Final model reply, verbatim:

> The file is a test fixture for verifying upload/attachment flows on web AI surfaces, with metadata about "web AI capability inventory" followed by repeated placeholder text.

PASS criteria satisfied: (a) filename `smoke-text.txt` visible in DOM after upload; (b) response references file content (test fixture / web AI / upload flow / placeholder text). Per-checkpoint dialog handled per consent rules; recorded in `consent-log.md`.
