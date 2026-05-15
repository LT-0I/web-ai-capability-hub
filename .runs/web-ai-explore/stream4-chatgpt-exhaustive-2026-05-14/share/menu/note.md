# share/menu

Status: PASS (enumerate only; no link created)

Tab `s4-newchat` at `https://chatgpt.com/c/6a05f2a2-4994-83e8-9146-856889276c77`.

Trigger: `button[data-testid="share-chat-button"]` in the conversation
toolbar. (There is **also** a per-turn Share button at
`getByTestId('conversation-turn-N').getByRole('button', { name: 'Share' })`;
both have `aria-label="Share"`, so `[aria-label='Share']` is ambiguous —
use `data-testid` for the conversation-level share.)

## Dialog options (verbatim)

Dialog content text:
```
<Conversation title>
<assistant turn text>
Copy link X LinkedIn Reddit
```

Buttons in dialog:
- `Copy link` (creates a public link on click — per catalog
  `chat-share-link-create`, this is the public-publish surface; per
  doctrine §3 "No public publishing", NOT clicked)
- `X` (post to twitter.com/x.com)
- `LinkedIn` (post to LinkedIn)
- `Reddit` (post to reddit.com)

No `Export to Markdown / Docs / PDF` option in this dialog. ChatGPT's
share menu is purely public-link + social-share. Per-conversation
markdown export is not exposed at this surface.

Dialog closed via Escape.

Evidence: `read.json`, `read2.json`, `read-full.json`.
