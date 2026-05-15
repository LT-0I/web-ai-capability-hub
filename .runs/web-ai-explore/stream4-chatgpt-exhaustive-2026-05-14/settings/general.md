# settings/General

Status: PASS (read-only)

Tab `s4-set`. URL `https://chatgpt.com/#settings/General`.

## Visible controls (Pro account, read-only)

| widget | label | current state | action surface |
|---|---|---|---|
| inline action | `Secure your account` | -- | `Set up MFA` button |
| select | `Appearance` | `System` | dropdown |
| select | `Contrast` | `System` | dropdown |
| select | `Accent color` | `Green` | dropdown |
| select | `Language` | `English (US)` | dropdown |
| switch | `Enable Dictation` (`Use dictation in the chat composer.`) | (state not exposed as role=switch in lite read) | -- |
| select | `Spoken language` | `Auto-detect` | dropdown |
| select | `Voice` | `Vale` | dropdown + `Play` preview |
| switch | `Separate Voice` (`Keep ChatGPT Voice in a separate full screen, without real time transcripts and visuals.`) | (state not exposed) | -- |

Sidebar tab list confirmed (Pro): `General / Notifications / Personalization
/ Apps / Schedules / Billing / Data controls / Storage / Security /
Parental controls / Account`.

No toggles flipped; no Save clicked.

Evidence: `general.json`.
