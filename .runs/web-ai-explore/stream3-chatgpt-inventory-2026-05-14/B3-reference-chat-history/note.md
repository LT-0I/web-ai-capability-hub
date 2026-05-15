# B3 — memory-reference-chat-history

Catalog row: `memory-reference-chat-history` (plus+, automation_notes
`unknown`). Catalog `web_ui_path`: `Settings → Personalization → Reference
chat history toggle.`

Status: INCONCLUSIVE

## Observation

The B2-memory tab DOM (`dom-personalization.json` / `dom-memories.json`,
shared with B1/B2/B4 since all three live on the same Personalization tab)
shows the literal label `Reference chat history` followed by descriptive
copy `Let ChatGPT reference all previous conversations when responding.`
in `visibleText`. So the **feature surface is present** for this Pro
account (matching the catalog's `plus+` plan gating).

However, the DOM snapshot tool only extracted **2 `role="switch"` widgets**
in the entire dialog (both aria-labelledby the same id `_r_10m_`,
both `aria-checked="true"`), corresponding to the inline `Fast answers`
switch at the top. The Memory section's `Reference saved memories` and
`Reference chat history` toggles, plus the Pulse `Reference Memory in
suggestions` and `Show "Pulse" in new chats` toggles, render their labels as
plain text in `visibleText` but their actual toggle widgets are not exposed
as discrete `role="switch"` elements in the snapshot output. They may be
custom non-aria widgets, off-viewport, or lazy-mounted only on hover.

Without a confirmed on/off state read from a discrete switch element, this
checkpoint is INCONCLUSIVE: the surface (label + description) is observed,
but the actual toggle state cannot be cited from evidence. Per doctrine I
did **not** retry, did not toggle anything, did not scroll-and-rescan.

Catalog `automation_notes` suggestion: change `unknown` to `label visible on
Personalization tab; toggle widget not exposed via role=switch in current
DOM snapshot output — automation needs a CSS path other than role for
state read.`

Evidence: `../B2-manage-memories/dom-memories.json` (visibleText shows the
label string; no role=switch element matches `Reference chat history`).
