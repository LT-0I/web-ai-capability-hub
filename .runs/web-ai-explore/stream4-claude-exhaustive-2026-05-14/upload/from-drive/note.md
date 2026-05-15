status: NOT-REACHABLE
observation: Drive/GDocs file-picker upload UI not present in Claude UI for this Max account. Connectors panel at /customize/connectors exposes ONE pre-built integration: "GitHub Integration" (status: Not connected; Connect button). Doctrine forbids exercising OAuth flow for new connectors (privacy-safe rule §3 bullet 6). NO "Pick file from Drive" affordance visible in composer or anywhere reachable without first connecting an external service.
catalog_drift:
  - Stream #3 reported "/settings/connectors" returns "This isn't working right now."
  - This run shows /settings/connectors now displays static notice: "Connectors have moved to Customize. Head there to browse, connect, and manage them."
  - Actual connectors live at /customize/connectors (this URL works on this account).
new_findings:
  - /customize/connectors page surfaces: Search connectors button, Add connector button (#radix-_r_5h_), one connector card "GitHub Integration" with state "Not connected" + Connect button.
  - "Add connector" button suggests user-defined MCP/custom connector flow exists. NOT exercised this run.
evidence: customize-connectors.json
