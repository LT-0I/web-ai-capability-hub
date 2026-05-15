# A1 — header-identify

**Status:** PASS

Clicked the avatar/account button at selector `#_r_10_` (label "B Bb Max plan").
The avatar dropdown displayed the literal account email
`qYgwillardboothiist5@lobbyist.com`.

Dropdown menu items observed (verbatim, in order):
1. `qYgwillardboothiist5@lobbyist.com`
2. `Settings`  (with keybinding hint `⇧ Ctrl ,`)
3. `Language`
4. `Get help`
5. `View all plans`
6. `Get apps and extensions`
7. `Learn more`
8. `Log out`

Plan badge in trigger button: `Max plan`.

Evidence: `read-after-click.json` (regex match captured the email),
`evidence/user-identifier.txt` written at run root.
