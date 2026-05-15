# B3 — instructions-add / instructions-edit-delete gap verification

**Status:** PASS

Navigation: Settings & help → Personal Intelligence → `Go to Instructions for
Gemini section`. Landed at `https://gemini.google.com/saved-info`.

Page header verbatim: `Your instructions for Gemini`.
Subheader: `Customize how Gemini responds to you by giving it instructions.`
Examples shown verbatim: `Start responses with a TL;DR summary`, `Use bullet
points for long paragraphs`.

Empty-state copy verbatim: `You haven't asked Gemini to save anything about
you yet`.

Controls:
- A toggle `[role="switch"]` at `#mat-mdc-slide-toggle-1-button` with
  `aria-label="Enables or disables the saved info feature"` and
  `aria-checked="true"` (Saved info is **ON** for this account).
- An `Add` button — implies the add flow exists (not exercised — would
  create durable state per lane policy).

Additional surfaces under same URL:
- A `Your premium content` section: `Gemini prioritizes your paid subscriptions
  to generate better answers for you.` plus `Manage subscriptions linked to
  your Google Account` link. This is **not** in the v2 catalog as a row —
  flag for catalog-additions.

**Gap resolved:** catalog gap `instructions-add` says `Verification needed:
confirm current personal-account availability and exact desktop layout` —
both confirmed (URL + selector + toggle id + Add button + examples).

Catalog row mapping: `instructions-add` (id), `instructions-edit-delete` (id).
