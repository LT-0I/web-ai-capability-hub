status: INCONCLUSIVE
url: https://claude.ai/design
observation: Claude has a dedicated "Design" sub-app (separate from main chat) reachable at /design. It is NOT a Canvas/artifact editor — it is a Figma-style design generator. Surfaces enumerated:
  - Top bar: Project name input, Wireframe/High-fidelity radio toggle, Create button
  - Sidebar tabs: Docs / Designs / Examples / Design systems
  - "Recent / Your designs" feed (empty for this account — Stream #3 usage page confirmed 0% used)
  - "Set up design system" CTA
not_exercised: The "Create" button would trigger a Design generation that may incur per-design plan usage. Since Claude usage shows 0% for Claude Design (Stream #3 /settings/usage), one trial would be safe — but the artifact format and download path of a Design output are NOT documented anywhere in the catalog. Out-of-scope this run; flagged for next run.
catalog_addition_candidate: "claude-design-app" — separate sub-app at /design with its own routes (/design/docs, /design/examples, etc.) and its own artifact format (presumably an embeddable design URL, NOT a downloadable file).
mcp_design_note: Not yet a stable automation candidate; needs a focused probe of the Create flow output format.
