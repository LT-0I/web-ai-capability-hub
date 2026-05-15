# generate/data-analyst-chart

Status: INCONCLUSIVE

Tab `s4-g-chart` at `https://chatgpt.com/c/6a05fb51-2244-83e8-bfbe-2b9a9b73cba6`.

CSV uploaded: `smoke-data.csv` (5 cities). Prompt:
`Plot the populations as a bar chart and provide the chart as a downloadable
PNG named populations-bar.png.`

Model output chrome: `Done: Download populations-bar.png` plus an open dialog
exposing `Download populations-bar.png / Download populations-bar.png / Save
/ Share`.

`browser:artifact-click --button-selector "button.behavior-btn"` returned
`ARTIFACT_DOWNLOAD_TIMEOUT` (`No Browser.downloadWillBegin event was
observed`). Same with `:has-text` text selector and Escape→retry. The
download surface for the Data Analyst chart artifact appears to be a SAVE
DIALOG (not a single chip click), which the project's
`browser:artifact-click` path doesn't traverse.

Catalog feedback: chart artifacts from the Data Analyst tool use a save
dialog (`role="dialog"` containing duplicate `Download populations-bar.png`
buttons + `Save / Share`). Direct file capture requires clicking inside the
dialog, not the in-chat behavior chip. Suggested catalog addition:
`code-charts-export-png` with `automation_notes` = `chart artifact opens a
dialog with Save/Share controls; click button inside dialog (not behavior
chip) to fire Browser.downloadWillBegin`.

Evidence: `read.json`, `read-full.json`.
