# A6 — upload-text

**Status:** PASS

Allocated a fresh tab at `https://claude.ai/new`. Discovered file input
`#chat-input-file-upload-onpage` via full-mode DOM read. Uploaded
`data/test-fixtures/smoke-text.txt` (sha256
`9b162ae3083c2df257fa86928ac13df4571144dc9a22d5df10324e5af0cd6165`,
3431 bytes) with `--confirmed` flag. Post-upload DOM contained the chip
`smoke-text.txt 55 lines TXT Remove` confirming filename presence.

Typed: `Summarize this file in one sentence.` Pressed Enter, waited 18s.

Claude response (captured in `response.txt`):
> This is a test fixture file for verifying file upload functionality on
> web AI surfaces, containing 50 lines of placeholder lorem ipsum text.

Response correctly references the file content (test fixture, lorem ipsum).

Evidence: `upload.json`, `read-post-upload.json`, `read-response.json`,
`response.txt`, `upload-target.txt`.
