# A0 — locale-enforce

**Status:** PASS

UI chrome of claude.ai/new is already in English. Observed labels (literal):
- Composer placeholder: `Write your prompt to Claude`
- Sidebar: `Home`, `New chat`, `Search`, `Chats`, `Projects`, `Code`, `Customize`, `Design`, `More`, `Recents`
- Model selector button: `Sonnet 4.6 Adaptive`
- Account chip: `Max plan`, `Settings`
- Subtitle line: `Add files, connectors, and more`
- Voice control: `Use voice mode`
- Prompt category tabs: `Write`, `Learn`, `Code`, `Life stuff`, `Claude's choice`

Chinese text seen in left-rail recent-chat history (`查询账户会员等级`) is user-generated chat title content, not UI chrome — language switch is not required for chrome.

No language preference change executed (per HARD rule about durable settings).

Evidence: `read-1.json`.
