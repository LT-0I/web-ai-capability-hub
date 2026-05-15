# B2 — capabilities-toggles (catalog gaps: `artifacts-enable-disable`, `file-creation-toggle`, `analysis-tool-toggle`, `past-chat-search-toggle`, `memory-summary`, `prebuilt-web-connectors` indirectly)

**Status:** PASS (surface enumerated; per-toggle binary state INCONCLUSIVE without DOM aria-checked exposure)
**Catalog rows:** `artifacts-enable-disable`, `file-creation-toggle`,
`analysis-tool-toggle`, `past-chat-search-toggle`, `memory-summary`.

Opened `https://claude.ai/settings/capabilities`. Sidebar tabs enumerated
(verbatim, in order):
- `General`, `Account`, `Privacy`, `Billing`, `Usage`, `Capabilities`,
  `Connectors`, `Claude Code`, `Claude in Chrome Beta`.

Capabilities body — toggles + controls enumerated verbatim:

1. **Search and reference chats** — toggle. Subtitle: "Allow Claude to search for relevant details in past chats."
2. **Generate memory from chat history** — toggle. Subtitle: "Allow Claude to remember relevant context from your chats. Memory includes your entire chat history with Claude."
3. **Import memory from other AI providers** — button `Start import`. Subtitle: "Bring relevant context and data from another AI provider to Claude. We'll provide a prompt you can use to fetch the memory from your other account."
4. **Tool access mode** — dropdown showing `Load tools when needed` (visible state token `on`). Subtitle: "Controls how connector tools are loaded in new conversations."
5. **Connector discovery** — toggle. Subtitle: "Let Claude surface connectors from the directory that may be relevant to your conversation."

(Section heading: **Visuals**)
6. **Artifacts** — toggle. Subtitle: "Generate code, documents, and designs in a dedicated window alongside your conversation."
7. **AI-powered artifacts** — toggle. Subtitle: "Build apps and interactive documents that use Claude inside the artifact."
8. **Inline visualizations** — toggle. Subtitle: "Allow Claude to generate interactive visualizations, charts, and diagrams directly in the conversation."

9. **Code execution and file creation** — toggle. Subtitle: "Claude can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports. Required for skills."
10. **Allow network egress** — toggle. Subtitle: "Give Claude network access to install packages and libraries in order to perform advanced data analysis, custom visualizations, and specialized file processing. Monitor chats closely as this comes with security risks (opens in new tab)."

**Effective state inference** (from observed behavior, not DOM aria-checked):
- `Code execution and file creation` = **ON** (A11 successfully produced a
  downloadable hello_world.py).
- `Artifacts` = **ON** (A12 rendered an MCP-app artifact iframe; code
  artifacts rendered with download buttons).
- `Inline visualizations` = **ON** (A12 SVG visualization rendered).

The Capabilities page uses `<switch>` ARIA-role widgets whose binary
on/off state was NOT surfaced as a queryable `checked`/`aria-checked`
attribute in the CLI's DOM extractor — only the labels were extracted.
Per HARD rule I did not click any toggle to flip durable settings.

**Catalog feedback:**
- Catalog row `artifacts-enable-disable` mapped to a single Settings →
  Capabilities → `Artifacts` toggle. There are in fact **three** distinct
  artifact-related toggles: `Artifacts`, `AI-powered artifacts`, and
  `Inline visualizations`. The catalog row should be split.
- Catalog row `file-creation-toggle` is present and labeled `Code execution
  and file creation`. The exact label matches except the catalog says
  "file creation toggle"; the surfaced label combines code-exec and
  file-creation into one toggle.
- Catalog row `analysis-tool-toggle` is NOT present as a separate toggle —
  it appears to have been merged into `Code execution and file creation`
  in the current UI.

Evidence: `read-1.json`, `read-full.json`, `screenshot.json` (textual,
not PNG).
