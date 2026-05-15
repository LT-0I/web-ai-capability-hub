# A2 — model-selector-cheap

Status: PASS

## Observation

Opened the composer model switcher (button name `Thinking` at `#radix-_r_i_`). The opened menu (`#radix-_r_j_`) contained: `Latest • 5.5 / Instant / Thinking / Pro • Extended / Configure...`.

Selected model: **Thinking** (under the `Latest • 5.5` group → effectively `GPT-5.5 Thinking`). This is the Thinking-class option, NOT `Pro • Extended`. Composer button text reflects `Thinking` after dismissal.

Per Stream #3 doctrine: must NOT pick `Pro` / `Pro • Advanced` / `GPT-5 Pro`. Selection complies.

Selector for switcher (radix id is dynamic) — stable alternative for catalog: `button[data-testid="model-switcher"]` not exposed; observed `button[id^="radix-"]` with name attribute `Thinking`. Catalog should record this drift.
