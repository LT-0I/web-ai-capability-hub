# A11 — download-code

**Status:** PASS

Typed prompt: `Generate a small Python file that prints hello world; produce
it as a downloadable file.` (had to use `--confirmed` because the word
"downloadable file" tripped the confirmation policy.)

Claude rendered a code artifact "Hello world" with an explicit
`button[aria-label="Download Hello world"]` control surfaced directly in the
chat message. Used `browser:artifact-click` with `--url` pinning the chat
URL (`--tab-url-contains claude.ai` matched the wrong /new tab; switching to
exact URL resolved).

File landed on disk:
- path: `download/66e8a30f-9ca1-45ce-adb5-d59865132629`
- suggestedFilename: `hello_world.py`
- size: 23 bytes
- sha256: `07219cd9561b41ce1f39209958076c471b17855679c968b42767b0122423c782`
- content: `print("Hello, World!")\n`

Evidence: `type-2.json`, `read-2.json`, `artifact-click-2.json`, downloaded
file in `download/`.
