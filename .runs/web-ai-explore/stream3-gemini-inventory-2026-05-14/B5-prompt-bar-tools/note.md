# B5 — prompt-bar-tools-community gap verification

**Status:** PASS

Clicked `Tools` button in the prompt bar. The opened menu lists, verbatim:

- `Create image` (badge: `New`)
- `Create video`
- `Canvas`
- `Deep research`
- `Create music` (badge: `New`)
- `Guided learning`
- `Experimental features` (separator)
  - `Labs`
  - `Personal Intelligence — Personalize chat when helpful`

Below the menu, the home composer also shows quick-pick chips: `Create image`,
`Create music`, `Help me learn`, `Create video`, `Boost my day`,
`Write anything`. These are **shortcut buttons** that pre-select a Tool, not
distinct features.

**Catalog gap-resolved:**
- `prompt-bar-tools-community` — confirmed; the community-reported migration
  is real for this PRO account (Deep Research, Canvas, Create video all
  appear in the prompt-bar `Tools` menu).
- New labels not in v1 catalog:
  - `Boost my day` (chip) — **catalog addition**
  - `Write anything` (chip) — **catalog addition**
  - `Help me learn` chip equals `Guided learning` (catalog id
    `guided-learning`).
  - `Experimental features` group with `Labs` and `Personal Intelligence`
    nested — catalog mentions Labs/Gems but does not enumerate the
    `Experimental features` menu group label.

**Catalog cross-check:**
- `canvas-create` (catalog id) — entry `Canvas` present.
- `deep-research-run` (id) — entry `Deep research` present.
- `image-generate-nano-banana` (id) — `Create image`.
- `music-generate-lyria` (id) — `Create music`.
- `video-generate-veo` (id) — `Create video` present (Pro-gated; not
  exercised in this lane).
- `guided-learning` (id) — `Guided learning` present.

Did NOT see `Visual layout` or `Dynamic view` in the Tools menu — both are
Labs experiments and the gap rows note A/B variability. For this account
(US-area, PRO), neither was assigned.
