## A2 model-selector-cheap

Mode-picker (composer `button[aria-label="Open mode picker"]`) opens a `mat-menu` whose top header reads "Gemini 3" and offers four menuitems on this personal Pro account:

- `Fast` — "Answers quickly" (cheapest)
- `Thinking` — "Solves complex problems"
- `Pro` — "Advanced math and code with 3.1 Pro" (was active by default)
- `Upgrade` — routes to Google AI Ultra purchase surface (out-of-scope)

Notably **no separate "2.5 Flash"** name is exposed in this account; the cheap variant is labeled `Fast` (Gemini 3 family). No `Deep Think` entry is visible in the model menu on this Pro account. A Deep Research / Canvas / Video / Image picker does not appear here — those surfaces have moved to the prompt-bar **Tools** button (verified separately in Part B).

Action: clicked menuitem matching xpath `//button[@role="menuitem" and contains(., "Fast")]`. Composer's mode-picker text changed from `Pro` to `Fast`. Selected model recorded as **Fast** (Gemini 3 family).

Status: PASS. Evidence: `A2-model-selector-cheap/menu-read4.json` (open menu DOM), `A2-model-selector-cheap/stdout.json` (post-selection state).
