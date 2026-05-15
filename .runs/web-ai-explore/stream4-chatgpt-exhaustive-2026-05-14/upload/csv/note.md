# upload/csv

Status: PASS

## Observation

Tab `s4-up-csv` at `https://chatgpt.com/c/6a05f3df-c6dc-83e8-a8da-d199655907c8`.
File uploaded via `input#upload-files` with `--confirmed true`. Filename chip
in DOM: `smoke-data.csv Spreadsheet`.

Send mechanism note: Enter-key send was NOT acted on while a file chip is
still pending; the visible `Send prompt` button is the active control on
that surface. Used `browser:click --selector "[data-testid=send-button]"
--confirmed true` and got streaming response.

Q1: `Which row has the largest population? Give just the city name.`
A1: `Shanghai` (matches CSV — Shanghai 24870895 > others).

Q2: `List all 5 cities from the CSV, comma-separated, no extra text.`
A2: `Beijing, Shanghai, Tokyo, Paris, New York` (matches CSV exactly).

Evidence: `read-q1c.json`, `read-q2.json`.
