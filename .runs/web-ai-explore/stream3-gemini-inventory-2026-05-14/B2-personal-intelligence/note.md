# B2 — memory-toggle + personal-intelligence overview

**Status:** PASS

Path: Settings & help → Personal Intelligence. URL settles at
`https://gemini.google.com/personalization-settings`.

Page header: `Personal Intelligence`. Subheader: `Get more helpful responses
and recommendations based on info about you and your world`.

Sections rendered:
- `Memory` — copy: `Gemini learns from your past chats to understand more
  about you. Coming soon to Live. Manage and delete your past chats anytime.`
- `Connected Apps` — copy: `You can choose to have Gemini use insights about
  you from some Connected Apps to personalize your experience and help you
  get more done`.
- `Instructions for Gemini` — copy: `Customize Gemini's responses, like "Use
  bullet points for long paragraphs"`.

Toggle observed verbatim:
- `[role="switch"]` at `#mat-mdc-slide-toggle-0-button` with
  `aria-label="Enables or disables the use of personal Gemini context"` and
  `aria-checked="true"` → **Personal context is ON** for this account.
- Inline link `Manage and delete` next to the Memory section, plus
  `Go to Connected Apps section` and `Go to Instructions for Gemini section`
  anchors.

**Catalog gap resolved:**
- `memory-toggle` — the master switch is the personal-context toggle above
  (single page rather than per-section memory toggle), `aria-checked="true"`.
- `personalization-overview` — page exists at the documented URL and matches
  catalog row.
- `personal-intelligence-connect` — Connected Apps link reachable from this
  page; full inventory captured in B4.
