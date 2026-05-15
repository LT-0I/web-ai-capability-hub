# B8 — recent-chats-manage catalog cross-check

**Status:** PASS

Opened side panel (`Main menu`), confirmed `Chats` header at top of the
recent-chats list. Each row uses `<a data-test-id="conversation"
href="/app/<chatId>">` with the chat's generated title as the role-button
name.

Hovered `a[href="/app/6790bbb4ecdf234a"]` (the A4 conversation) and a
`button[aria-label="More options for Date Acknowledgement And Request"]`
became visible. Clicked it; per-chat action menu shows verbatim:

- `Share conversation`
- `Pin`
- `Rename`
- `Delete`

No `Archive`, no `Star`, no `Export from list view`. Menu closed with Escape;
no durable changes made.

**Catalog cross-check:**
- `recent-chats-manage` (catalog id) — claims `select, rename, pin, or
  delete chats under Recent`. Observation matches catalog precisely.
- `share-chat` (id) — also reachable from this per-chat menu (in addition
  to the in-conversation `Share conversation` top-bar button observed in B7).

**Selector additions for the catalog:**
- Per-chat action trigger: `button[aria-label="More options for <chat
  title>"]`.
- Chat row: `a[data-test-id="conversation"]` with `href="/app/<chatId>"`.
- Side-panel sections (top-to-bottom): `New chat`, `My stuff`, `Notebooks`
  (with `New notebook` link), `Gems`, `Chats`.

