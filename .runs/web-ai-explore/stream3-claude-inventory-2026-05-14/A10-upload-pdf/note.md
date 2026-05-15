# A10 — upload-pdf

**Status:** PASS

Uploaded `data/test-fixtures/smoke-doc.pdf` via `#chat-input-file-upload-onpage`.
The PDF attachment chip shows the type token `PDF` in DOM but NOT the literal
filename `smoke-doc.pdf` (similar to image chips — see A9 catalog
observation). CLI upload action returned `ok:true`.

Question typed: `What is the title text of this PDF?`

Claude response (captured `response.txt`):
> The title text of the PDF is "Stream #3 Web AI Inventory Test".

Matches the expected fixture title exactly. PASS by "response references file
content" branch of the criterion.

Evidence: `upload.json`, `read-response.json`, `response.txt`.
