# B5 — settings-improve-model-toggle

Catalog row: `settings-improve-model-toggle` (free, automation_notes
`unknown`). Catalog `web_ui_path`: `Profile → Settings → Data Controls →
Improve the model for everyone off/on.`

Status: PASS

## Observation

Allocated `B5-data` against `https://chatgpt.com/#settings/DataControls`.
The Data controls tab is the active settings panel. `visibleText` (verbatim):

> `Data controls — Improve the model for everyone Off — Location Off —
> When enabled, your location helps ChatGPT provide more relevant
> information, like local recommendations, news, and weather. Learn more —
> Remote browser data On — Shared links Manage — Archived chats Manage —
> Archive all chats Archive all — Delete all chats Delete all — Export
> data Export — Marketing privacy`

The `Improve the model for everyone` control is **NOT a flat switch** — it
renders as a `<button>` with stable selector
`button[data-testid="improve-model-open-modal-button"]` whose accessible
name is `"Improve the model for everyone Off"` (concatenated label + state).
The trailing `Off` token is the literal current state for this account.

Current toggle state: **Off** (training opt-out is engaged for this account;
consistent with a Pro account that has manually disabled model improvement).

Per doctrine, no click to flip the toggle (read-only).

Catalog `automation_notes` suggestion: change `unknown` to
`button[data-testid="improve-model-open-modal-button"]`; clicking opens a
confirmation modal; current state is reflected in the button's accessible
name as a trailing word `On` or `Off`; the catalog `web_ui_path` is
correct.

Bonus observations from the same panel (not catalog-row-bound but
useful for catalog hygiene):
- `Location` button reads `Off`.
- `Remote browser data` button reads `On`.
- Both `Archived chats Manage` and `Archive all chats / Delete all chats`
  affordances are present (covers catalog rows `chats-archive-manage` and
  `chats-archive-all` / `chats-delete-all`).
- `Export data Export` button (covers `data-export` row).
- A `Marketing privacy` link appears in the trailing copy.

Evidence: `dom-datacontrols.json`.
