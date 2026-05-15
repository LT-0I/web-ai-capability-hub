# tools/composer-bar

Status: PASS

Tools menu opened via the toolbox-drawer button (composer footer span
text "Tools"). Menu id `#toolbox-drawer-menu`. Items enumerated verbatim:

- `Create image` (badge: `New`)
- `Create video`
- `Canvas`
- `Deep research`
- `Create music` (badge: `New`)
- `Guided learning`

Each item rendered as `button[role="menuitemcheckbox"]`. Selecting an
item adds the corresponding "Deselect <Tool>" chip to the composer
footer when active.

Home-screen quick chips (visible without opening Tools): `🖼️ Create image`,
`🎸 Create music`, `Create video`, `Help me learn`, `Write anything`,
`Boost my day`. These are catalog additions (not in v2 catalog as a
distinct surface).

Stream #3 noted an `Experimental features → Labs, Personal Intelligence`
submenu. On this run, that submenu was not visible — possible A/B drift
since Stream #3 (2026-05-14 same day).
