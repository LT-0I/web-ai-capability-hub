# generate/csv

Status: PASS

Tab `s4-g-csv` at `https://chatgpt.com/c/6a05f781-c624-83e8-8c57-053daddd9424`.

Prompt: `Produce a CSV of 5 capital cities with columns city, country,
population, area_km2. Save as a file named capitals.csv so I can download it.`

Model response chrome: `Done: Download capitals.csv`.

Artifact:
- path: `download/capitals.csv` (193 bytes)
- sha256: `2193503546f380b90aa6a6d967b5a40848e759993cc6c50ba7314278b3f97abd`
- contents: 5 rows (Tokyo, London, Paris, Berlin, Canberra) + header
  `city,country,population,area_km2`.

Captured via `browser:artifact-click --button-selector "button.behavior-btn"`.

Evidence: `read.json`, `read2.json`, `download/capitals.csv`.
