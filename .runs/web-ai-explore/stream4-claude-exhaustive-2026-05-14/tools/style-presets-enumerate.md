status: PASS
presets_enumerated:
  - Normal (role=menuitemcheckbox, default state)
  - Learning (role=menuitemcheckbox)
  - Concise (role=menuitemcheckbox)
  - Explanatory (role=menuitemcheckbox)
  - Formal (role=menuitemcheckbox)
  - Create & edit styles (role=menuitem, custom-style entry)
access_path:
  - From composer: click button[aria-label="Add files, connectors, and more"] → click menuitem "Use style" → 5 menuitemcheckbox + 1 menuitem visible.
  - Quick toggle (after a non-default style is selected): button[aria-label="Style: <Selected>"] appears directly on composer toolbar.
switch_test:
  - Switched from Normal → Concise: composer toolbar updated to display "Style: Concise" badge + new aria-label="Style: Concise" button.
  - Switched back to Normal: composer Style: badge removed, default state restored.
mcp_design_note: Style preset switch is a single click on a menuitemcheckbox. Stable selectors are the visible labels (Normal/Learning/Concise/Explanatory/Formal) not the radix #base-ui-_r_* IDs which rotate each session. Recommend selector via text-match.
output_style_custom:
  - "Create & edit styles" menuitem captured (#base-ui-_r_9l_). NOT exercised — would open custom-style authoring flow which may persist account state.
