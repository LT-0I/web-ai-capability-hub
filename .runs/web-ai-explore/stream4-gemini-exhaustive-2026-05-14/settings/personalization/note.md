# settings/personalization

Status: PASS (read-only)

URL: `/personalization-settings?hl=en` (catalog gap row resolved with URL).

Elements:
- 1 switch (`#mat-mdc-slide-toggle-0-button`) — "Enables or disables the use
  of personal Gemini context". State NOT FLIPPED. Stream #3 noted this was
  `aria-checked="true"` on this account; this run also opened the page and
  did not interact.
- Link `Manage and delete` (data deletion page, external)
- Link `Learn more` (external help)
- Link `Go to Connected Apps section`
- Link `Go to Instructions for Gemini section`
- No other on/off toggles on this top-level page; deeper controls are on
  `/apps` and `/saved-info`.
