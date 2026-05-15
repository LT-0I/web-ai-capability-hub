# generate/audio-overview

Status: PASS (streamed audio, no file artifact)

Path: post-response menu (`Show more options`) → menuitem `Listen` → audio
playback started (DOM updated to `button[aria-label="Pause"]`).

There is **no `Download audio` button** in the per-response menu — the
TTS playback is streamed in-browser only. To get a downloadable .mp3,
the user has to either:
1. Use NotebookLM's "Audio Overview" feature (separate product),
2. Capture system audio with an external tool (out of scope).

The surface itself works (audio plays), so this is PASS for "exercise the
surface" criterion, but it produces no file artifact. No mp3/wav written
to disk.
