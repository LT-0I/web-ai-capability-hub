# A2 — model-selector-cheap

**Status:** PASS

Clicked `button[aria-label="Open mode picker"]`, observed 3 selectable
entries verbatim:
- `Fast` — `Answers quickly`
- `Thinking` — `Solves complex problems`
- `Pro` — `Advanced math and code with 3.1 Pro`
- (Plus Ultra upsell card: `Google AI Ultra — Get the highest access to
  models & features` and an `Upgrade` button — not a selectable model.)

Banner above the list reads `Gemini 3`. Picked `Fast` per cheap-model policy
(NOT Pro/Ultra/Deep Think). Composer chip re-read showed `Fast` still
present, confirming selection.

Evidence: `click-picker.stdout.json`, `menu-open.stdout.json`,
`click-fast.stdout.json`, `after-fast.stdout.json`.

**Selected model name (literal):** `Fast`.
