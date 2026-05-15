status: NOT-REACHABLE
observation: /customize/skills exposes a single installed skill on this Max account: skill-creator (meta-skill for authoring new skills). No image-creation or PDF-creation skill is installed and reachable without an "Add skill" flow that would require uploading an external skill bundle. Therefore no skill-driven image/PDF generation can be exercised in this run.
upstream_paths:
  - To enable: user would need to click "Add skill" (#radix-_r_6d_) on /customize/skills and upload a Skill bundle. This is a state-changing action (durable account modification) and outside the safe-write boundary of this run.
