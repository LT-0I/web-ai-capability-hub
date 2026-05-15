# generate/canvas-text

Status: INCONCLUSIVE (canvas opened, generated text confirmed; download
chip click timed out)

Tab `s4-g-canvas` at `https://chatgpt.com/c/6a05fcec-a7b0-83e8-950f-529e49812362`.

Prompt: `Open a canvas and write a 100-word note titled 'Stream #4 canvas
test' about web AI exploration in the canvas.`

PASS evidence: canvas opened, the rendered text included
`Stream #4 Canvas Test`, `Copy Edit Download`, and the body text begins
`Web AI exploration tests how conversational ...`. The Canvas surface is
reachable.

INCONCLUSIVE evidence: clicked `button[aria-label='Download']` (the canvas
header button) but `browser:click` timed out (30s). The download trigger
in Canvas appears to be a dropdown menu (the catalog notes mention
Markdown / PDF / Docx options), not a single-click capture. The
`browser:artifact-click` shape with `button.behavior-btn` did not see a
download event; same with the canvas header Download button.

Catalog feedback: Canvas download is a dropdown menu — automate by clicking
the trigger then selecting the format menuitem; `browser:artifact-click`
should be paired with `--follow-up-selector` pointing at the menuitem.

Evidence: `read.json`, `read-full.json`, `read-dl.json`.
