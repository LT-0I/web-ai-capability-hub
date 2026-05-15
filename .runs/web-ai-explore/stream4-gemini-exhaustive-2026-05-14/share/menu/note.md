# share/menu

Status: PASS (enumerated, did NOT click any "Share conversation" button)

Per-response menu items (already captured under `tools/composer-bar`
section in `generate/audio-overview/note.md`):
- `Listen` (audio TTS playback)
- `Export to Docs` (creates a Drive doc; exercised in
  `generate/canvas-text` and `generate/deep-research`)
- `Draft in Gmail` (creates a Gmail compose draft; NOT exercised — would
  durably create a draft in the user's mailbox)
- `Report legal issue` (external link)
- `Model name` (shows current model badge — informational)

Conversation-level menu:
- `button[aria-label="Share conversation"]` (top-of-chat). Per doctrine,
  this **auto-publishes a link** without intermediate confirmation; NOT
  clicked in this run.
- `button[aria-label="Open menu for conversation actions."]` (per-chat
  ellipsis). Stream #3 enumerated: `Share conversation, Pin, Rename, Delete`.
  Re-enumeration omitted to avoid accidentally clicking Share.
