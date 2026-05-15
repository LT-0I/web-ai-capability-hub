# A8 — upload-code

**Status:** PASS

Uploaded `data/test-fixtures/smoke-code.py` via `#chat-input-file-upload-onpage`.
Post-upload chip text observed: `smoke-code.py 10 lines PY`.

Question typed: `What does the add function return for inputs 4 and 5?`

Claude response (captured `response.txt`):
> The add function returns 9 for inputs 4 and 5. It simply adds the two
> arguments together: 4 + 5 = 9.

Correct answer per fixture (`def add(a, b): return a + b`).

Evidence: `upload.json`, `read-response.json`, `response.txt`.
