status: PASS
url: https://claude.ai/customize/skills
observation: After navigation, only one installed personal skill is exposed on this Max account: **skill-creator** (Added by Anthropic). Stream #3 finding holds. Surfaces enumerated:
  - Top bar: Customize / Skills / Connectors tabs (Skills tab active)
  - Toolbar: "Search skills" button, "Add skill" button (#radix-_r_6d_)
  - Section header: "Personal skills"
  - Single skill card: skill-creator → "Trigger: Slash command + auto" / Description: Create new skills, modify and improve existing skills, and measure skill performance...
  - Skill detail panel: file tree (SKILL.md, agents/, assets/, eval-viewer/, references/, scripts/, LICENSE.txt), Toggle-file-list button, "More options for skill-creator" (#radix-_r_6i_) — not opened (could trigger enable/disable toggle behind it)
  - Full SKILL.md text visible in right pane (multi-thousand chars).
catalog_drift_from_stream3:
  - Stream #3 reported `Customize → Skills` with `Enable skill` toggle and `Add skill` action. This run confirms the Add skill button selector. The `Enable skill` toggle is NOT directly visible on the page — it must be inside the "More options for skill-creator" dropdown (not opened to avoid state change).
  - No image/PDF generation skills installed (`generate/skills-image-or-pdf` is therefore NOT-REACHABLE for this account state — see separate note).
