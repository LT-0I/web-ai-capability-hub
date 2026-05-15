# B4 — skills-overview (catalog gap: `skills-overview`, `skills-enable-disable`)

**Status:** PASS
**Catalog rows:** `skills-overview`, `skills-enable-disable`.

Navigated to `https://claude.ai/customize/skills` (sidebar entry "Skills"
on `/customize` landing routed here). Page enumerated (verbatim):

- Tab strip: `Skills`, `Connectors`.
- Top-bar controls: `Search skills` (input), `Add skill` (button).
- Section header: `Personal skills`.
- One personal skill installed: **`skill-creator`** with the following
  expandable file tree:
  - `SKILL.md`
  - `agents/`
  - `assets/`
  - `eval-viewer/`
  - `references/`
  - `scripts/`
  - `LICENSE.txt`
- Per-skill controls observed: **`Enable skill`** (toggle), `More options
  for skill-creator` (kebab menu).
- A `Preview` panel rendered the skill's SKILL.md content, including
  example folder structures, example markdown templates, and example
  shell commands (skill-creator's contents — not the UI itself, but the
  skill body it ships).

**Catalog feedback:** Catalog row `skills-overview` is confirmed on
account: Customize → Skills route reachable, per-skill enable/disable
toggle present.

Evidence: `read-skills.json`.
