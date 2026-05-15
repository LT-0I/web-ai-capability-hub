# Settings sweep — read-only

## /settings/general (PASS)
Sections enumerated (no toggles flipped):
- Profile: Full name field, "What best describes your work?" select dropdown
- Instructions for Claude: free-form textarea (e.g. "keep explanations brief and to the point")
- Preferences:
  - Appearance: light/dark/system options
  - Chat font: "Anthropic Serif" (current)
  - Voice: "Buttery" (current voice profile)
- Notifications (5 toggles, current state read-only):
  - "Response completions" — notify when response done
  - "Code notifications" — Claude Code updates
  - "Code permission requests" — push when approval needed
  - "Emails from Claude Code on the web" — build/needs-response emails
  - "Dispatch messages" — phone push from Dispatch

## /settings/account (PASS)
- "Log out of all devices" button
- "Delete account" link: "To delete your account, please cancel your Claude Max subscription first."
- Organization ID: 9a23efa1-be5a-4da2-8039-74492ab9877e
- Active sessions table (5 rows):
  - Chrome (Linux) Current — Los Angeles, CA — May 14 6:31 AM
  - Chrome (Windows) — Asagaya-minami, Tokyo, JP — May 14 1:27 AM
  - Android (Android) — Los Angeles, CA — May 13 8:44 AM
  - Chrome (Linux) — Los Angeles, CA — May 13 8:27 AM
  - Chrome (Linux) — Los Angeles, CA — May 13 8:26 AM
- No durable state changed (no log-out clicked).

## /settings/usage (PASS)
- Plan: Max (20x)
- Current session: 26% used, resets in 3 hr 2 min
- Weekly limits:
  - All models: 13% used, resets in 21 hr 42 min
  - Sonnet only: 0% used
  - Claude Design: 0% used ("You haven't used Claude Design yet")
- Additional features:
  - Daily included routine runs: 2 / 15 used, resets in 17 hr 21 min
  - Extra usage: toggle (not flipped)

## /settings/claude-code (PASS)
- Code appearance:
  - Code font (custom monospace font setting)
  - Theme: Claude Light / Claude Dark
- General toggles:
  - "Classify session states" (auto-classify blocked/ready/done)
  - "Create pull requests automatically"
  - "Autofix pull requests" (Claude monitors CI + comments)
- Authorization tokens (3 entries):
  - Claude Code (Connected 46 min ago) — scopes: user:file_upload, user:inference, user:mcp_servers, user:profile, user:sessions:claude_code
  - Claude Code (Connected 1 hour ago) — scopes: user:ccr_inference, user:file_upload
  - Claude Code on the Web
- "Delete sessions stored by Anthropic" button (NOT clicked — destructive)
- Sharing settings: "Control how your claude.ai/code sessions are shared. Manage"

## /settings/browser-extension (PASS — sidebar label "Claude in Chrome Beta")
- Catalog drift: sidebar label "Claude in Chrome Beta" → href /settings/browser-extension (NOT /settings/claude-in-chrome which 404s)
- "Claude in Chrome settings"
- Section: Site permissions
- "Default for all sites" dropdown: "Select default policy" (not opened)

## /settings/privacy (Stream #3 B8) — referenced
- Already exercised in Stream #3: Location-metadata toggle, Help-improve-Claude toggle, Export-data button, Shared-chats Manage button, Memory-preferences Manage.

## /settings/capabilities (Stream #3 B2) — referenced
- 10 controls enumerated in Stream #3 — Artifacts/AI-powered artifacts/Inline visualizations toggles, Code-execution-and-file-creation toggle, Tool-access-mode dropdown, Allow-network-egress toggle, Connector-discovery toggle, Past-chat-search toggle, Memory-summary section.

## /settings/connectors (Stream #3 B3 / re-attempted this run)
- Stream #3: "This isn't working right now."
- This run: page now renders static "Connectors have moved to Customize" notice. The real connector UI lives at /customize/connectors (1 connector visible: GitHub Integration / Not connected). See upload/from-drive note.

## /settings/billing (NOT-REACHABLE)
- Skipped per doctrine §3 bullet 1: billing/subscription routes forbidden.
