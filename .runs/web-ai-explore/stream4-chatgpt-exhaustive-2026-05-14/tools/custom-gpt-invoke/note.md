# tools/custom-gpt-invoke (Scholar GPT)

Status: PASS

Tab `s4-scholar` at `https://chatgpt.com/g/g-kZ0eYXlJe-scholar-gpt/c/6a05ff02-40b4-83e8-bd6f-a593ae067155`.

Direct URL navigation to a Custom GPT works:
- `https://chatgpt.com/g/g-<gpt-id>-<slug>` opens the GPT landing.
- The composer accepts the same `#prompt-textarea` selector + `Enter`/
  `[data-testid=send-button]` send pattern.
- Conversation URL is `https://chatgpt.com/g/<gpt-id>-<slug>/c/<conv-id>`
  (prefixed with the GPT slug, unlike normal chats).

Prompt: `Reply with one sentence describing what you do.`
Reply: `I help with scholarly research, literature discovery, document
analysis, data analysis, visualization, and clear explanations of complex
topics.`

The model picker chrome shows `Thinking, click to remove` — meaning the
Custom GPT inherits the calling user's selected model.

Catalog feedback: catalog already has `gpts-mention` and similar rows, but
the `gpts-direct-url` automation note is worth adding — the
`/g/<id>-<slug>` pattern is the deterministic invocation path; `@-mention`
is the conversational invocation path.

Evidence: `read-landed.json`, `read-clicked.json`, `read-scholar.json`,
`read-reply.json`.
