# tools/gems-launch-premade

Status: PASS (Gem launched, but in iframe-based Gem Lab — not standard chat)

Path: `/gems/view` → clicked `a[aria-label="Start a new conversation with
Gem: Brainstormer"]`.

Outcome: Brainstormer opened at **`https://gemini.google.com/gem-labs/<id>`**
— NOT the standard `/app/...` chat URL. The Gem renders inside an
**`<iframe>`** (top-level page has only 11 elements: nav + iframe).
The composer is inside the iframe and is not reachable from the main page
DOM via our standard composer selector — `browser:type` failed with
30s timeout.

This is a major behavioral finding: **selected premade Gems on this account
render as iframed Gem Labs apps (Opal-style)**, not as plain Gemini chats.
Custom Gem invocations from the catalog v2 row `gems-create` likely follow
the standard chat path, but **at least Brainstormer (the v2 catalog
example used by Stream #3) has migrated to gem-labs**.

Catalog change candidate: split `gems-launch-premade` into two rows:
1. `gems-launch-classic-gem` — opens at `/app/<id>` chat path.
2. `gems-launch-gem-lab` — opens at `/gem-labs/<id>` iframe app.

The 8 premade Gems were enumerated verbatim (see `gems-landing/page.json`):
1. Chess champ (Experiment)
2. Storybook (Experiment)
3. Brainstormer
4. Career guide
5. Coding partner
6. Learning coach
7. Productivity planner
8. Writing editor
