status: PASS (entry surface observed; no task triggered)
url: https://claude.ai/settings/browser-extension
catalog_drift:
  - Sidebar label is "Claude in Chrome Beta"
  - Sidebar href is /settings/browser-extension (NOT /settings/claude-in-chrome, which returns "Not Found")
content:
  - Heading: "Claude in Chrome settings"
  - Section: "Site permissions"
  - Subheading: "Default for all sites"
  - Setting: "Choose whether Claude in Chrome works on all sites by default"
  - Dropdown: "Select default policy" (NOT opened — read-only probe)
observation: This is the Claude-in-Chrome (autonomous browsing) settings page. No "Run a task" entry on this page — Computer-use task launch lives in the Chrome extension itself, not the web UI. Per doctrine §3 bullet 4, only entry-surface observed; no autonomous task triggered.
