# Consent dialogs encountered — ChatGPT lane

This is a brief log of every dialog handled during the Stream #3 ChatGPT run.
Only buttons in the doctrine's allowed set (`Agree / Allow / OK / Continue
/ Got it / Accept / Enable`) were clicked.

| Checkpoint | Dialog (verbatim) | Action | Allowed? |
|---|---|---|---|
| A6-upload-text | Temporary-chat consent `<dialog>` opened when first send fired after upload. The dialog asked the user to acknowledge temporary-chat behavior (training/retention notice) before sending. | Clicked `Continue` (`browser:click` with the dialog's Continue button selector). | YES (Continue is in the allowed list) |
| A7-upload-csv | Same temporary-chat consent `<dialog>` (one-time per fresh tab). | Clicked `Continue`. | YES |
| A8-upload-code | Same temporary-chat consent `<dialog>`. | Clicked `Continue`. | YES |
| A9-upload-image | Same temporary-chat consent `<dialog>`. | Clicked `Continue`. | YES |
| A10-upload-pdf | Same temporary-chat consent `<dialog>`. | Clicked `Continue`. | YES |
| A11-download-code | Same temporary-chat consent `<dialog>`. | Clicked `Continue` twice (see `A11/click-continue.json` and `click-continue-2.json`). | YES |
| A12-download-image (tab A12) | Same temporary-chat consent `<dialog>` (prior subagent). | First click reported `Timeout 30000ms exceeded` waiting for `locator('dialog button')` (see `A12/click-continue.json`), i.e. the dialog had already been auto-dismissed or didn't appear. No fallback dialog click was needed. | n/a (not blocking) |
| A12-download-image (tab A12b on `?model=gpt-5`) | No consent dialog observed. | None. | n/a |
| B1-B6 (settings tabs and `/gpts`) | No consent dialogs observed. The settings dialog (`role="dialog"`) is the Settings modal itself, not a consent prompt — no consent buttons clicked. | None. | n/a |

No `Publish` / `Share publicly` / `Make public` / `Upgrade` / `Subscribe` /
`Connect Google Drive` / `Connect GitHub` button was clicked at any point.
