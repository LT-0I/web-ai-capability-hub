# B4 — pulse-toggle

Catalog row: `pulse-toggle` (pro, automation_notes `unknown`).
Catalog `web_ui_path`: `Settings → Personalization → Reference memories in
Suggestions off, or Show Pulse in new chats off.`

Status: INCONCLUSIVE

## Observation

Same Personalization tab DOM as B1/B2/B3 (`B2-memory` tab,
`dom-memories.json`). The `Pulse` section is present in `visibleText`
verbatim:

> `Pulse — Reference Memory in suggestions — Let ChatGPT use memories
> proactively in suggestions. Turning this off will disable "Pulse". Learn
> more — Show "Pulse" in new chats`

Both toggles named by the catalog are surfaced as plain text labels:
- `Reference Memory in suggestions` (with explicit explanatory copy that
  switching it off disables Pulse).
- `Show "Pulse" in new chats`.

As with B3, neither toggle is exposed as a discrete `role="switch"` widget
in the DOM-snapshot output, so the current on/off state cannot be cited
from evidence. The account is Pro (B5 verifies via header text `Shark Pro`),
so the catalog's `pro` plan gating does not block visibility — the labels
are visible. The visibility itself is the partial observation.

Per doctrine, NO toggle was changed.

Catalog `automation_notes` suggestion: change `unknown` to `label visible
on Personalization tab for Pro accounts; copy explicitly confirms toggling
off Reference Memory in suggestions disables Pulse; switch widget not
captured via role=switch.`

Evidence: `../B2-manage-memories/dom-memories.json` visibleText quoted above.
