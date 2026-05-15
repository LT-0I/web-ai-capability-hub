# A9 — upload-image

**Status:** PASS

Uploaded `data/test-fixtures/smoke-image.png` via `#chat-input-file-upload-onpage`.
The image attachment chip does NOT display the filename string `smoke-image.png`
in lite or full DOM mode — Claude renders image attachments as a thumbnail tile
without surfacing the filename text. CLI upload action returned `ok:true` with
the file path confirmed.

Question typed: `Describe this image in one sentence.`

Claude response (captured `response.txt`):
> The image is a plain, solid red rectangle with no other visible elements.

Response references the actual image content (red color) — matches the fixture
(64×64 solid red PNG). PASS by "response references file content" branch of
the criterion; filename-in-DOM criterion is N/A for image chips on Claude.

Evidence: `upload.json` (ok:true), `read-response.json`, `response.txt`.
Note: this is a small **catalog observation** — Claude's image chip does not
expose the filename in DOM the way text/CSV/PDF chips do.
