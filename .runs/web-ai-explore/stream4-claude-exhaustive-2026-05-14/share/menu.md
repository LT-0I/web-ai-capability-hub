status: PASS
trigger: top-right "Share" button inside an open chat (when user is the chat owner)
modal_title: "Share chat"
subtitle: "Only messages up to this point will be shared."
radio_options:
  - "Keep private — Only you have access"
  - "Create public link — Anyone with the link can view"
action_buttons:
  - "Create share link" (primary; would create a public link — NOT clicked per doctrine §3 bullet 9)
  - "Close" (button[aria-label="Close"])
disclaimer: "Don't share personal information or third-party content without permission, and see our Usage Policy"
observation: Share menu is a 2-radio + 1-create-button dialog. There is NO native "Copy link without publishing" affordance and NO "Export as Markdown / PDF / DOCX" affordance at the chat level. Chat-level export is therefore NOT exposed by Claude's web UI as of 2026-05-14. The closest export equivalent is the **per-artifact** Copy-chevron menu inside an open artifact: "Download as .md / Print as PDF / Publish artifact" (also has a Publish action that must be avoided).
