# A6 — upload-text

**Status:** PASS

Upload flow:
1. Clicked `button[aria-label="Open upload file menu"]` and got the
   first-use disclaimer (`Creating content from images and files` — see
   `consent-log.md`).
2. Clicked `Agree` (logged).
3. Re-opened the menu (`Open upload file menu`) and clicked `Upload files`
   (`[role="menuitem"]:has-text("Upload files")`).
4. Uploaded `smoke-text.txt` to `input[type="file"]` with `--confirmed true`.
5. Post-upload DOM contained `Remove file smoke-text.txt` chip.
6. Typed `Summarize this file in one sentence.` and pressed Enter.
7. After 18s, response (full mode read): `This document is a test fixture
   designed to verify file upload capabilities for web AI surfaces,
   containing fifty lines of placeholder text and associated source tags.`

Evidence: `upload-3.stdout.json`, `post-upload.stdout.json`,
`response-read.stdout.json`, `response.txt`, `upload-target.txt`.
