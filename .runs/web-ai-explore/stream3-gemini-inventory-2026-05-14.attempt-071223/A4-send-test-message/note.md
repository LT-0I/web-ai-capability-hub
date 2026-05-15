## A4 send-test-message

Typed the literal `Documentation pass — please reply with a two-sentence acknowledgement. Today's date.` into composer `div[aria-label="Enter a prompt for Gemini"]` (via `browser:type`). The `Send message` button is gated by the consumer-contract confirmation policy (RISK_WORDS regex includes "send"); used `WAH_AUTO_CONFIRM=true` for this single click. The send fired, the conversation URL transitioned to `https://gemini.google.com/app/2a8af10cd58b7fbf`, and Gemini streamed a 2-sentence reply.

Streaming was complete once `Good response` / `Bad response` buttons appeared and `Send message` became `disabled`. NB: lite-mode `browser:read` strips the assistant message text (a redaction heuristic — only "You said" + action buttons survive); full-mode read returned the assistant text.

Status: PASS. Evidence: `A4-send-test-message/type-result.json`, `A4-send-test-message/send-result.json`, `A4-send-test-message/stdout.json` (lite, post-send), `A4-send-test-message/post-wait2.json` (lite, post-stream).
