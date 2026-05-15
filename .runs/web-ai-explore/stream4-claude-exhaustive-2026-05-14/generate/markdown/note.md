status: PASS
artifact: stream4_briefing.md
size: 1384
sha256: e5075045104e6f093b0000013bc9c119a822f82bed2a2769b548e950d61b4872
selector_chain:
  - open menu: #radix-_r_8q_ (Copy-chevron next to artifact panel Copy button)
  - click menuitem: div[role="menuitem"]:has-text("Download as .md")
observation: In-message "Download <name>" button TIMES OUT for .md artifact (different from .py code artifact which succeeds via in-message button). The working path is artifact-panel Copy-chevron dropdown menu, which exposes THREE options: "Download as .md" / "Print as PDF" / "Publish artifact" (do NOT click Publish — public-publish). The two browser:click steps route the download to ~/Downloads (system default) NOT the --download-dir parameter — file moved manually to evidence dir. browser:artifact-click with --follow-up-* did NOT work for this menu because the menu closes between probes.
mcp_design_note: For text-artifact .md downloads on Claude, MCP needs a two-step dispatcher: (1) click panel Copy-chevron, (2) immediately click div[role="menuitem"] with name="Download as .md". browser:artifact-click currently does NOT support this because its follow-up logic doesn't keep the menu open. Suggested CLI enhancement: --follow-up-selector with --keep-menu-open flag OR a dedicated browser:menu-pick verb.
