# B1 — Settings & help inventory + language-display gap verification

**Status:** PASS

Clicked `button[aria-label="Settings & help"]` (sensitive heuristic blocked
first attempt; passed `--confirmed true`). Menu items observed verbatim:

- Activity
- Personal Intelligence
- Import memory to Gemini (badged `New`)
- Scheduled actions
- Your public links
- Theme
- Manage subscription
- Upgrade to Google AI Ultra
- NotebookLM
- Send feedback
- Help
- Footer: `California, USA From your IP address` and an `Update location`
  control, plus `Help Center` and `Privacy` links.

**Gap verifications:**

- `language-display` (catalog id) — **CONFIRMED gap-resolved**: there is
  NO `Language` entry in the Settings menu. The catalog row's note
  `Gemini web app follows browser or device language settings` is
  accurate — the in-app surface deliberately omits a language switch.
- `location-update` (catalog id `location-update`) — **PASS**: a literal
  `Update location` control with `California, USA From your IP address`
  is present. Not clicked (would change durable state).
- `scheduled-actions-manage` — entry **present in menu** (`Scheduled
  actions`); availability for personal Pro account confirmed (catalog
  says ai-pro+).
