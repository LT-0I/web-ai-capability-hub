# upload/multifile

Status: PASS

## Observation

Tab `s4-up-multi`. Three files uploaded sequentially via the same
`input#upload-files` selector (the composer accepts multiple chips):
`smoke-text.txt`, `smoke-data.csv`, `smoke-image.png`.

Chips in DOM after upload: `smoke-text(2).txt Document`,
`smoke-data.csv Spreadsheet` (implicit by inline preview table),
`Open image: smoke-image(1).png` (Filename suffixes `(1)`/`(2)` indicate the
fixtures were uploaded into this profile in earlier runs.)

Q: `I attached three files. State (a) the topic of the .txt, (b) the city
with the largest population in the .csv, and (c) the color of the .png.
Reply in three lines.`

A (lines):
- `web AI capability inventory` (correct topic of smoke-text.txt)
- `Shanghai` (correct CSV largest-population row)
- `red` (correct smoke-image.png color)

All three answers correct. Multi-file ingestion across mixed MIME types
(text/csv/image) confirmed.

Evidence: `read-q1.json`.
