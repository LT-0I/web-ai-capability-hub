# A11 — download-code

**Status:** PASS

Prompt (typed with `--confirmed true` after sensitive-word heuristic blocked
the first attempt — "downloadable" / "Generate" trigger the policy):
`Generate a small Python file that prints hello world; produce it as a
downloadable file.`

Gemini ran a code-execution turn that wrote `hello_world.py` and offered a
download button. Direct `browser:click` on `button[aria-label="Download code"]`
returned timeout because the button was attached but not visible
(code block was collapsed). After expanding via
`[data-test-id="toggle-code-button"]` and hovering `[data-test-id="code-content"]`,
the visible click still didn't surface a download artifact via
`browser:downloads`.

`browser:artifact-click` (the documented downstream path, CDP-level
`Browser.setDownloadBehavior`) succeeded with viewport `1500x1800`:
- Path: `download/gemini-code.py` (renamed from suggestedFilename
  `gemini-code-1778769575145.py`)
- Size: 210 bytes
- sha256: `2d12fbc24262a37574045e20165c4d06c87b3c9d358694220f2982c1235bdb5a`
- frameUrl: `https://gemini.google.com/app/5173cc693ef9f4c9`
- bbox: x=1070, y=290, w=40, h=40

Content is the Python helper Gemini ran to write the artifact (creates a
file `hello_world.py` with `print("Hello World")`).

Evidence: `artifact-click-5.stdout.json`, `download/gemini-code.py`.

**Selector drift caveat:** the official catalog row `file-download` says
`After Gemini creates a supported file, use the download control for local
formats.` In practice, the file is delivered through a code-execution sandbox
and the download icon is `button[aria-label="Download code"]` inside a
collapsible code panel — not next to the artifact pill (`hello_world PY`).
