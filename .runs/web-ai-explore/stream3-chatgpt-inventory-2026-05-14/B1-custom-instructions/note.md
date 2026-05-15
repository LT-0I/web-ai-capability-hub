# B1 — settings-custom-instructions

Catalog row: `settings-custom-instructions` (free, automation_notes `unknown`).
Catalog `web_ui_path`: `Profile → Settings → Personalization → Custom Instructions.`

Status: PASS

## Observation

Allocated fresh tab `B1-custom` against `https://chatgpt.com/#settings/Personalization`. The settings dialog opened directly on the Personalization tab (sidebar tabs `General / Notifications / Personalization / Apps / Schedules / Billing / Data controls / Storage / Security / Parental controls / Account`, with `Personalization` carrying `data-state="active"`).

In the live web UI, Custom Instructions is rendered **inline** on the Personalization page (no separate modal/click required) under a `Custom instructions` heading containing a single subsection `About you` with three labelled controls:

- `Nickname`
- `Occupation` (shows a cycling placeholder; consecutive DOM reads observed `Gastroenterologist` then `Wedding photographer`, indicating a rotating example placeholder rather than a saved durable value)
- `More about you`

Above that, the Personalization page also exposes:
- `Base style and tone` selector with options observed via menu buttons: `Default / Warm / Enthusiastic / Headers & Lists / Emoji` (each carries a per-option `Default` toggle button).
- `Fast answers` switch — captured switch element `[switch] aria-checked="true" data-state="checked"`, currently **ON**.

No `Save` button was visible in the captured viewport (form likely auto-saves on blur, consistent with the help-center description). Per doctrine, **no field was modified**.

Catalog `web_ui_path` text `Profile → Settings → Personalization → Custom Instructions.` matches the live route, but the live UI does not require a separate `Custom Instructions` click — the form is inline on the Personalization tab. Suggested catalog edit: change `automation_notes` from `unknown` to `inline-on-Personalization-tab`; the catalog row's `web_ui_path` is correct as a navigation but should note "(inline section, not a sub-modal)".

Evidence: `dom-personalization.json` + `dom-after-scroll.json` (visibleText quoted above).
