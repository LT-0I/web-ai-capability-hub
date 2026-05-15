# B3 — connectors-page (catalog gaps: `integrations-setup`, `prebuilt-web-connectors`, `custom-connector-add`)

**Status:** INCONCLUSIVE
**Catalog rows:** `integrations-setup`, `prebuilt-web-connectors`, `custom-connector-add`.

Allocated tab at `https://claude.ai/settings/connectors`. After 4-second
wait, page body showed an error toast: **`This isn't working right now.
You can try again later. Close`**. Repeated a second read 3 seconds later;
identical error.

Cannot enumerate prebuilt connectors, `Add connector` button, or custom
MCP form because the route fails to render content for this account
(Max plan).

**Catalog feedback:** This is a service-side or feature-flag failure at
the test time; the catalog cannot be verified here. Suggested catalog
note: `settings/connectors route returned a non-empty error toast for a
Max-plan account on 2026-05-14; connector enumeration requires either a
different account class or a service-side fix.` Worth a re-test in a
later run before marking as a stable defect.

Evidence: `read-1.json`, `read-2.json` (both contain the error toast text).
