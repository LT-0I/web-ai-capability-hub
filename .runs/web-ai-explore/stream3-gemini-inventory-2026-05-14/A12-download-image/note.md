# A12 — download-image

**Status:** PASS

Prompt: `Generate a small simple image: a red square on a white background.`
Required `--confirmed true` again because "Generate" trips the sensitive
heuristic. After ~35s, the response replaced the text bubble with an image
artifact whose toolbar exposes `Share image`, `Copy image`, and
`Download full size image` buttons.

Used `browser:artifact-click` on `button[aria-label="Download full size image"]`
with viewport `1500x1800`:
- Path: `download/Gemini_Generated_Image_p05gkwp05gkwp05g.png`
  (renamed from suggestedFilename)
- Size: 5,593,901 bytes (~5.34 MiB; 1024x1024-class PNG)
- sha256: `3bae95a18925ca397a61b3bbeb42097a95014b5032318bd047fa586b17a14ab9`
- frameUrl: `https://gemini.google.com/app/56ba0b4fe4fd0aea`
- elapsedMs: 12421

Note: Nano Banana 2 generates 1024x1024 even when the prompt says "small";
no in-UI size selector found for free tier. `Redo with Pro` (Nano Banana Pro)
appears under `Show more options` but is Pro-gated — not exercised.

Evidence: `artifact-click.stdout.json`, downloaded PNG.
