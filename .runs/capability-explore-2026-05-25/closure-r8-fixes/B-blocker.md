# Bucket B blocker — gemini-conversation-reuse-mgr

Status: skipped after the allowed single retry.

Changes tried:
- Added Gemini completion no-response floor in `src/mcp/tools.ts` (`GEMINI_MIN_NO_RESPONSE_WAIT_MS = 8000`).
- Added the same floor to Gemini prompt submit confirmation so the first send does not fail in ~500ms while SPA state is still settling.

Fresh evidence:
- `/tmp/gemini-conversation-reuse-mgr.r8.json`
- `.runs/capability-explore-2026-05-25/closure-r8-fixes/gemini-conversation-reuse-mgr.json`
- Evidence mtime newer than `dist/src/mcp/tools.js`.

Observed after retry:
- `create_conversation` still failed `COMMAND_TIMEOUT`.
- `wait_ms` increased from ~537ms to `8001`, confirming the min-wait patch is active.
- `response_text` remained empty and `chat_url` remained `https://gemini.google.com/app`.
- `reuse_conversation` still succeeded and returned text containing `apples` against an existing Gemini conversation.

Root-cause update:
- The r7 early 524ms failure was partly submit-confirmation timing, not only completion detection.
- After the 8s floor, the first fresh-composer send still does not create/claim a new conversation URL in this environment; likely the first send click is not actually accepted by the current Gemini zero-state SPA composer, while reuse on an existing conversation still works.

Recommended next path:
- Instrument the first-send path around `sendPromptAndConfirmSubmitted`: capture send button enabled/aria-disabled, composer text, and pending state after each click.
- Compare fresh composer selector/click behavior with the successful existing-conversation path.
- Do not add graceful fallback; keep `COMMAND_TIMEOUT` if the prompt truly does not submit.
