# A12 — download-image

Status: INCONCLUSIVE (MODE_UNCERTAIN)

## Observation

Two tabs were allocated for this checkpoint (orphan from prior subagent).

1. `A12-cgpt` against `https://chatgpt.com/?temporary-chat=true` — typed
   `Generate a small simple image: a red square on a white background.` and
   submitted. The model replied verbatim:
   > `Image generation isn't available in this temporary chat. Switch to a
   > regular chat to use the image generation tool.`
   (See `dom-after-gen.json` `visibleText`.) No image artifact was produced and
   no download control rendered. Image generation is gated behind a
   non-temporary conversation.

2. `A12b-cgpt` against `https://chatgpt.com/?model=gpt-5` — same prompt was
   typed and sent. The conversation persisted at
   `https://chatgpt.com/c/6a05e09b-d554-83e8-a905-aea3b3c9c6e1`. Post-send DOM
   (`dom-b1.json` + a fresh `browser:read` at 14:52 UTC) `visibleText` shows
   the prior subagent's prompt echoed back plus the indicator `Thought for 21s`
   and an `Edit` affordance on the user turn — but **no rendered `<img>`
   element, no `Download` artifact button, no `behavior-btn` for an image, and
   no assistant text describing an image**. The only DOM `Download` tokens are
   the sidebar `Download apps` button and the `Share` link; the only
   `behavior-btn` match is the `Skip to content` skip-link. The model run
   either produced no visible image artifact, was still pending, or the
   artifact had already been cleared from the DOM by the time the snapshots
   were taken. The evidence does not show an image landing on disk.

Per instructions, the generation was NOT re-run. `download/` is empty.

Result: INCONCLUSIVE — feature surface (non-temporary chat with model=gpt-5
selected) was reached and the prompt was accepted, but no image artifact and
no download control were captured in evidence; nothing was saved to disk.
Suggested catalog action: keep `image-generation` row but mark its observed
state for this run as `unverified` rather than PASS or NOT-REACHABLE.

## Tab disposition

`A12-cgpt` was freed in this finalization pass. `A12b-cgpt` was also freed
(see `inventory-report.md` §Handoff).
