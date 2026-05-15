# generate/python-file-runner

Status: PASS (text-result only; no downloadable file)

Tab `s4-g-pyrun` (model `gpt-5-thinking`).

Prompt: `Run this Python in your interpreter: print(sum(range(100))). Then
state the printed value.`

Model response: `4950` (correct — `sum(range(100)) == 4950`).

**No downloadable Python file** is produced by this surface. The interpreter
runs in a hidden sandbox and only emits the printed value into the chat
bubble. No `Download <name>.py` chip is rendered. The chat does NOT expose a
download for an `.py` artifact from this flow — that is what
`generate/python` produces (where the prompt explicitly asks the model to
write a file).

Catalog feedback: distinguish two ChatGPT surfaces in the catalog —
- `code-python-notebook` / `python-file-runner` = run code, return text only.
- `generate/python` (`Generate a Python file...`) = produce a downloadable
  `.py` chip (covered separately in this run).

Evidence: `read.json`.
