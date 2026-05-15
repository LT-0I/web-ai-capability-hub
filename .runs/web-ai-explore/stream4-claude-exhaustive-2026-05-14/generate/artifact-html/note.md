status: PASS
artifact: dark-mode-toggle.html
size: 7712
sha256: cf3d46d592408cb24642e904f320efc4dc4067a02b8339abaf528fe6afa843fc
file_type: HTML5 standalone page with vanilla JS dark-mode toggle
selector_chain:
  - open menu: #radix-_r_kq_ (artifact panel Copy-chevron)
  - click menuitem: div[role="menuitem"]:has-text("Download as .html")
observation: HTML standalone artifact rendered in artifact pane (Preview confirmed). In-message Download button TIMED OUT (same as .md prose-class artifact). Working path is the panel-chevron menu. The download routes through ~/Downloads (system default), moved manually to evidence dir.
gotcha: Network-error toast intercepted the chevron click — had to press Escape 3 times then re-acquire selectors before menu-click worked. Toast was a transient blip from an earlier failed Enter-press, not a network outage.
