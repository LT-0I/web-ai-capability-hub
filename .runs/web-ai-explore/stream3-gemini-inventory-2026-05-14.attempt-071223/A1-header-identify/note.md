## A1 header-identify

The Gemini web app exposes the signed-in user via the top-left avatar `<a>` element with `aria-label="Google Account: <Name>\n(<email>)"`. The identifier was captured to `evidence/user-identifier.txt` (kept out of the inventory body per the personal-info handling rule).

Plan tier label: a disabled `<button>` with text **"PRO"** appears near the new-chat row, and the composer's mode-picker button (`button[aria-label="Open mode picker"]`) shows text **"Pro"** as the active mode. The sidebar shows: New chat / My stuff / Notebooks / Gems / Chats / Settings & help. The composer area shows quick-action buttons: Create image, Create music, Boost my day, Create video, Help me learn, Write anything, plus Tools, Open upload file menu, Microphone, Send message.

Status: PASS. Evidence: `A1-header-identify/stdout.json` and `evidence/user-identifier.txt`.
