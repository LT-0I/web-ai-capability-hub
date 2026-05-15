# upload/text

Status: PASS

Path: clicked `Open upload file menu` → `Upload files. Documents, data, code files` menuitem → posted file to `input[type="file"]` with `--confirmed true`.
Chip captured: `Remove file smoke-text.txt`.

Two distinct probes:
1. "Summarize this file in one sentence." → response references "fifty lines of placeholder text" + "documentation pass test fixture" (correct).
2. "How many lines are in this file? Answer with the integer only." → response: `52` (correct: 50 placeholder lines + header).
