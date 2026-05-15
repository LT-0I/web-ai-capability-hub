# core/new-chat

Status: PASS

## Observation

Tab `s4-newchat` allocated at `https://chatgpt.com/?model=gpt-5`; ChatGPT
redirected to `https://chatgpt.com/` (root new-chat surface). DOM composer
present (`Chat with ChatGPT` placeholder, `Add files and more` button,
`Start dictation` button). Composer is empty before send (no user message
bubble in DOM).

Evidence: `read.json`.
