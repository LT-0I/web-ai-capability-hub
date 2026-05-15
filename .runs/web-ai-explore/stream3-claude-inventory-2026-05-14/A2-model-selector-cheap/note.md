# A2 — model-selector-cheap

**Status:** PASS

Opened the model selector at `#_r_1b_` (button labeled "Sonnet 4.6 Adaptive").
Menu enumerated the following model options (verbatim, in order):
- `Opus 4.7 — Most capable for ambitious work`
- `Sonnet 4.6 — Responsive everyday work`
- `Haiku 4.5 — Fastest, most efficient`
- `Adaptive thinking — Thinks for more complex tasks` (toggle/sub-option)
- `More models` (submenu trigger)

The composer's pre-existing selection was already `Sonnet 4.6 Adaptive` (the
Sonnet variant with the Adaptive-thinking toggle on). Per the cheap-model
policy this is the correct cheap pick — NOT Opus 4.7. I did not click any
menu item beyond opening the dropdown (the pre-existing selection already
satisfied the PASS criterion: composer reflects a Sonnet variant).

Literal model name recorded for the run: **`Sonnet 4.6 Adaptive`**.

Evidence: `read-menu.json` (menu visible text), `read-after.json` (composer
state confirmed Sonnet after escaping the menu).
