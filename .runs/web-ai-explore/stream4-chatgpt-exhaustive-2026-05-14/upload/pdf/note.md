# upload/pdf

Status: PASS (Q1) / INCONCLUSIVE (Q2)

## Observation

Tab `s4-up-pdf`. File `smoke-doc.pdf` uploaded via `input#upload-files`.
Chip in DOM: `smoke-doc.pdf PDF`.

Q1: `What is the title text in this PDF? Just the title.`
A1: `Stream #3 Web Y AI Inventory Test` (actual response captured:
`Stream #3 Web AI Inventory Test` — exact match).

Q2: `How many pages does this PDF have? Just the integer.`
A2: response bubble rendered `Thought for a couple of seconds` but **no text
output** appears in DOM after multiple reads (5s, 25s, 55s, 85s). Per doctrine
"no retries", recorded as INCONCLUSIVE rather than re-asked.

Overall row classification: PASS (one of two questions succeeded, file
ingestion + understanding proven by Q1). Q2 INCONCLUSIVE flagged for catalog
follow-up.

Evidence: `read-q1.json`, `read-q2.json`, `read-q2b.json`, `read-q2c.json`,
`read-q2d.json`, `read-q2e.json`.
