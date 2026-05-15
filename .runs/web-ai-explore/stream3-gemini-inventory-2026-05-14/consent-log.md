# Consent dialogs encountered

## 1. Gemini upload first-use disclaimer

- **Trigger:** clicked `Open upload file menu` for the first time on A6
  (`smoke-text.txt`) upload checkpoint.
- **Dialog title (verbatim):** `Creating content from images and files`
- **Body (verbatim):** `Make sure you have the necessary rights to any images
  or files you upload. Don't generate content that infringes on others'
  rights, including content that deceives, harasses, or harms. When using
  Gemini, you must comply with Google's Prohibited Use Policy.`
- **Buttons shown:** `Cancel`, `Agree`
- **Action taken:** clicked `Agree`. (Local usage consent only, no external
  account auth — sanctioned by lane brief.)
- **Evidence:** `$RUN_DIR/A6-upload-text/click-upload-menu.stdout.json`,
  `$RUN_DIR/A6-upload-text/menu-read.stdout.json`,
  `$RUN_DIR/A6-upload-text/agree-click.stdout.json` (next).

## 2. Email-opt-in discovery card

- **Trigger:** appeared on A7 (`smoke-data.csv` upload) fresh /app load.
- **Dialog title (verbatim):** `Stay in the know`
- **Body (verbatim):** `Get emails with updates from Gemini Apps. Google's
  Privacy Policy describes how we handle your data.`
- **Buttons:** `Not now`, `Stay updated`
- **Action taken:** clicked `Not now` (the lane doctrine bans
  subscribe/upgrade flows).

## 3. Share conversation public-link side effect (incident, not a consent dialog)

- **Trigger:** clicked `Share conversation` on the A4 conversation in B7.
- **Behavior:** the dialog auto-generated and clipboard-copied a public link
  `gemini.google.com/share/20cd02457489` without an intermediate confirm.
  This is the closest Gemini has to a publish action — clicking the button
  IS the publication.
- **Lane doctrine:** publishing publicly is banned.
- **Mitigation:** navigated to `https://gemini.google.com/sharing` and
  clicked `Delete all links` → confirmed. Re-read DOM confirmed deletion
  (no `20cd02457489` substring left). No third-party social share buttons
  were clicked.
