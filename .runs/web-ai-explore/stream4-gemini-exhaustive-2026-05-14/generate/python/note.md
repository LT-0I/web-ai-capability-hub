# generate/python

Status: PASS

Path: composer prompt for "first 10 primes" Python file → Gemini executed code
in sandbox → `Show code` panel exposes `button[aria-label="Download code"]`
after viewport ≥ 2400 px tall + sandbox iframe rendered. Used
`browser:artifact-click` (the project's CDP-level downloader).

Artifact:
- File: `download/f15bd82b5fc3bb13e49317fc081811305dfc02dfd9c9e35332b72a9402c92a8b.py`
- Suggested filename: `gemini-code-1778775522221.py`
- Size: 489 bytes
- sha256: `f15bd82b5fc3bb13e49317fc081811305dfc02dfd9c9e35332b72a9402c92a8b`

Quirk: file begins with `python_code = """...` — Gemini wrapped the actual
prime-finding script inside a string variable (artifact of its code-execution
sandbox export format). Still a valid `.py` per `file(1)` and runs.
