# core/model-select-cheap

Status: PASS

## Observation

The model picker on the fresh-chat composer currently reads `Thinking`
(GPT-5.5 Thinking class, cheap tier per project policy). No `Pro` selection
was performed. The composer reflects the selection:

```
What are you working on? Thinking
Add files and more
Chat with ChatGPT
```

Selection was inherited from the previous Stream #3 A2 setting; no re-click
was needed in this run. Pro selection is explicitly forbidden by cheap-model
policy and was not performed.

Evidence source: `../new-chat/read.json` (URL `https://chatgpt.com/`,
composer reads `Thinking`).
