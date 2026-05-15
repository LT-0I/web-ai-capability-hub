# A8 — upload-code

**Status:** PASS

Uploaded `smoke-code.py` through Open upload file menu → Upload files → file
input. Post-upload chip `Remove file smoke-code.py` confirmed filename in DOM.
First Enter press did not submit (textbox wasn't focused); clicked composer
then pressed Enter again — URL changed to /app/144207ae9cdb1c22 and Gemini
responded:

`Based on the code provided in the file smoke-code.py, the add function
returns the sum of its two inputs. ... For the inputs 4 and 5, the function
performs the operation 4+5. The add function returns 9.`

Correct answer (9) appears verbatim. Evidence: `upload.stdout.json`,
`response-4.stdout.json`, `response.txt`. Selector drift note: the typed
prompt does not autoload focus after upload; click composer before Enter.
