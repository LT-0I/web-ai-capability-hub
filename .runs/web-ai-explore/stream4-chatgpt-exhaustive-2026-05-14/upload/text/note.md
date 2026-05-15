# upload/text

Status: PASS

## Observation

Tab `s4-up-text` at `https://chatgpt.com/c/6a05f2f4-c28c-83e8-8f7f-966f348d06d8`.
File uploaded via `browser:upload --tab-id s4-up-text --selector
"input#upload-files" --file data/test-fixtures/smoke-text.txt --confirmed true`.
Filename chip in DOM: `smoke-text(1).txt Document`.

Q1: `Summarize this file in one sentence.`
A1: `The file is a Stream #3 documentation pass test fixture used to verify
web AI upload/attachment flows, with the topic "web AI capability inventory"
and repeated placeholder text.`

Q2: `How many lines does the file have? Give just the integer.`
A2: `54` — matches actual `wc -l` of the fixture (54).

Evidence: `read-q1.json`, `read-q2.json`.
