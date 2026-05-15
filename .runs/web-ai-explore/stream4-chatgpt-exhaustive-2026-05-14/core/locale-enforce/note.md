# core/locale-enforce

Status: PASS

## Observation

Stream #3 A0 had already switched Settings → General → Language from `简体中文`
to `English (US)`. This Stream #4 run verifies the post-switch state remains
English in UI chrome.

- Tab `s4-locale` allocated at `https://chatgpt.com/#settings/General`.
- `browser:read --mode lite` returned UI chrome strings in English: `Skip to
  content / Open sidebar / New chat / Search chats / Recents / Open profile
  menu / Home / ChatGPT / Close sidebar / Codex / Projects / New project /
  Show chats / Settings`.
- Chinese characters present in the read are user-created **chat titles**
  (e.g. `强化学习在反无人机应用`, `PPTX下载和内容总结`) and **project names**
  (`1浏览器自动化（读取+操作）`, `3Radar`, `2notebooklm自动化`). Those are user
  content, not UI chrome.

No locale change performed in this run (Stream #3 already established it).

Evidence: `read.json`.
