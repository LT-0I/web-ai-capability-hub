# generate/pptx

Status: INCONCLUSIVE

Tab `s4-g-pptx` at `https://chatgpt.com/c/6a05f9da-5c14-83e8-8e22-d01534febbe1`.

Prompt: `Produce a 3-slide PPTX titled 'Stream #4 Brief': Slide 1 cover,
Slide 2 goals, Slide 3 risks. Save as stream4-brief.pptx so I can download
it.`

Model spent `Thought for 1m 29s` and rendered: `Done: stream4-brief.pptx`
plus an embedded **presentation viewer** with a button `Open presentation in
full screen mode`. No `button.behavior-btn` download chip was emitted —
the PPTX is exposed only via the inline presentation viewer.

Click attempt on the `Open presentation in full screen mode` button timed
out after 30s in `browser:click`. Per doctrine "no retries", recorded
INCONCLUSIVE.

Catalog feedback: ChatGPT's presentation surface (Slidemaker tool) emits an
in-chat embedded viewer, not a `button.behavior-btn` download chip. Direct
file capture needs a different selector path — likely the export menu inside
the fullscreen viewer. Suggested addition to catalog: row
`presentation-export-download` with `automation_notes` = `requires opening
the inline presentation viewer; export-to-PPTX lives inside the viewer's
overflow menu, not in the in-chat behavior chip`.

Evidence: `read.json`, `read2.json`, `read-full.json`, `read-fs.json`.
