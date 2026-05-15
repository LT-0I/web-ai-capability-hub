# generate/pptx

Status: INCONCLUSIVE-by-design

Tested empirically (see `generate/csv`, `generate/markdown`): Gemini's
code-execution sandbox always returns the **source Python script** that
would *produce* the requested artifact, never the artifact itself. The
generated .pptx file lives ephemerally at /mnt/data/ in the sandbox and
there is no end-user click to retrieve it.

A separate empirical attempt for pptx is omitted (one-attempt budget, no
retries). True pptx download requires either:
1. Canvas + Export-to-Docs (exercised in `generate/canvas-text`).
2. A Drive→Sheets/Slides round-trip that would require OAuth (out of scope).

This is a **catalog finding**: Gemini does not have a direct
.pptx download surface for assistant-generated artifacts.
