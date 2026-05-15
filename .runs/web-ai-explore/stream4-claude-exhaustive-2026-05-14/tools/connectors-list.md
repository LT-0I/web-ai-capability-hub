status: PASS
url: https://claude.ai/customize/connectors
observation: One pre-built connector visible on this Max account: "GitHub Integration" (status: Not connected; Connect button). Plus an "Add connector" button (#radix-_r_5h_) for user-defined / MCP connectors and a "Search connectors" button.
selectors:
  - search: button[aria-label="Search connectors"]
  - add: #radix-_r_5h_
  - connector_card: button:has-text("GitHub Integration")
  - connect_action: button:has-text("Connect")
catalog_drift:
  - /settings/connectors is a redirect notice ("Connectors have moved to Customize").
  - Real surface is /customize/connectors.
