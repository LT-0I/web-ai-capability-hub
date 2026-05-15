# upload/code

Status: PASS

## Observation

Tab `s4-up-code`. File `smoke-code.py` uploaded via `input#upload-files`.
Chip in DOM: `smoke-code.py Python`.

Q1: `What does add(4,5) return in this file? Give just the integer.`
A1: `9` (correct).

Q2: `Refactor add() to use a lambda. Show only the refactored line.`
A2: `add = lambda a, b: a + b` (semantically correct lambda).

Side-effect noted: a `Study Mode` promotion modal appeared mid-flow and
blocked the send button until dismissed via
`browser:click --selector "button[aria-label='Close']"`. Logged in
consent/dismiss log.

Evidence: `read-q1.json`, `read-q2.json`.
