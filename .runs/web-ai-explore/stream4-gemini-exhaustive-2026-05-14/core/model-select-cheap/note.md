# core/model-select-cheap

Status: PASS

Opened mode picker via `button[aria-label="Open mode picker"]`. Three options
listed verbatim:

- Fast — `Answers quickly`
- Thinking — `Solves complex problems`
- Pro — `Advanced math and code with 3.1 Pro`
- (also `Upgrade` upsell row at the bottom — NOT clicked)

Selected **Fast** via selector
`button.mat-mdc-menu-item:has(span:has-text("Fast"))`. Cheap-model policy
honoured (Fast = Gemini 3 Flash, not Pro / Thinking / Ultra).
