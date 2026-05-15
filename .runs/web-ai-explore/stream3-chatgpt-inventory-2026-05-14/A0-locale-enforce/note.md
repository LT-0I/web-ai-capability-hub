# A0 — locale-enforce

Status: PASS

## Observation

Pre-state: Settings → General → Language showed `简体中文` (Simplified Chinese). The composer placeholder read `与 ChatGPT 聊天` ("Chat with ChatGPT") and sidebar showed `新聊天 / 最近聊天 / 项目`.

Action: Opened `https://chatgpt.com/#settings/General`, clicked the language combobox (currently `简体中文`), selected `English (US)` from the listbox.

Post-state: UI chrome flipped to English: `Skip to content / Open sidebar / New chat / Search chats / Recents / Open profile menu / Home / Close sidebar / Codex / Projects / New project / Show chats / Open project options / Open conversation options / Settings`. User-created chat & project names remain in their original Chinese (e.g. `1浏览器自动化（读取+操作）`, `强化学习在反无人机应用`); those are user content, not UI labels, so no translation needed for them.

Evidence: this dir; settings dialog text confirms English in post-switch read.
