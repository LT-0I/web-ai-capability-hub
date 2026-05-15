# generate/video

Status: PASS

Path: Tools menu chip `Create video` → composer prompt for a 2-second
red bouncing ball → wait ~3-4 minutes → `button[aria-label="Download video"]`
clicked via `browser:artifact-click` (viewport 1500x2000).

Artifact:
- File: `download/b275d5156efb88a433da973042f26b485298287e1fc640ddf55c6e0327c4e2ce.mp4`
- Suggested filename: `mp_.mp4` (suggested by Gemini)
- Size: 767,503 bytes (~750 KiB)
- sha256: `b275d5156efb88a433da973042f26b485298287e1fc640ddf55c6e0327c4e2ce`
- Verified via `file(1)` to be a real MP4 (ISO MP4 container).

PRO account confirmed access to Veo video generation. Generation latency:
~3-5 minutes for a 8-second clip (DOM shows "0:00 / 0:08" duration scrubber).
