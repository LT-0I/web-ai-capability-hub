# generate/voice-mode-entry

Status: PASS (entry surface observed; not clicked per scope)

Tab `s4-newchat` at `https://chatgpt.com/c/6a05f2a2-4994-83e8-9146-856889276c77`.

The composer chrome exposes a `Start Voice` button as a sibling of
`Start dictation` in the composer. Captured verbatim in `read-full.json`
visibleText footer: `Start dictation Start Voice`.

Audio surface intentionally NOT clicked (doctrine §3 "Audio / microphone
surfaces (shared host)" is privacy-safe-skip).

Catalog mapping: row `voice-start` → web entry is the composer
`Start Voice` button (observed selector path: `button[aria-label*='Voice']`
or `button:has-text('Start Voice')`). No `data-testid` exposed.

Evidence: `read-full.json` (extracted from `s4-newchat`).
