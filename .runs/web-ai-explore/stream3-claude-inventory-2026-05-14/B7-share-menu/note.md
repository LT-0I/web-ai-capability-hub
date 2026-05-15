# B7 — share-menu (catalog gap: `shared-chats-manage`)

**Status:** PASS
**Catalog row:** `shared-chats-manage`

Opened the existing DOCX-creation chat
(`https://claude.ai/chat/345172b8-d5b5-4a6e-b7b5-334d669da92a`). Clicked the
in-chat `Share` button (required `--confirmed` because the word "share" is
treated as sensitive by the confirmation policy).

Share dialog enumerated (verbatim):

- Modal title: `Share chat`
- Helper text: `Only messages up to this point will be shared.`
- Radio/option 1: **`Keep private`** — subtitle `Only you have access`
- Radio/option 2: **`Create public link`** — subtitle `Anyone with the link
  can view`
- Disclaimer: `Don't share personal information or third-party content
  without permission, and see our Usage Policy (opens in a new tab).`
- Primary button: **`Create share link`**
- Secondary button: **`Close`**

Per the doctrine I did **NOT** click `Create share link` or `Create
public link` (forbidden public-publishing actions). Clicked `Close`
to dismiss.

**Catalog feedback:** `shared-chats-manage` row implies a separate
Settings → Privacy modal for revocation. The in-chat Share modal seen
here only has create-link / keep-private semantics; revocation is a
separate surface that requires an existing share link — out of scope
for this run since creating the link is forbidden.

Evidence: `click-share-2.json`, `read-share-2.json`, `click-close.json`.
