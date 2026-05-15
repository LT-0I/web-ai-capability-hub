# Locale enforcement record

UI chrome of claude.ai/new is already in English on profile `claude-9224`. No
language preference change executed (per HARD rule about not changing durable
settings).

Sample English UI labels captured at A0:
- Composer placeholder: `Write your prompt to Claude`
- Sidebar items: `Home`, `New chat`, `Search`, `Chats`, `Projects`, `Code`, `Customize`, `Design`, `More`, `Recents`
- Model selector button: `Sonnet 4.6 Adaptive`
- Plan chip: `Max plan`
- Footer: `Add files, connectors, and more`
- Voice control: `Use voice mode`

Non-English text observed: Chinese in user-generated chat titles in the left
rail (`查询账户会员等级` — translation: "query account member tier"). This is
content authored by the signed-in user, not UI chrome.

Status: ENGLISH-OK (no switch needed).

Evidence: `A0-locale-enforce/read-1.json`.
