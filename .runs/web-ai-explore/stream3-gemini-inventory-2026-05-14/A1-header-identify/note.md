# A1 — header-identify

**Status:** PASS

Avatar tooltip text from the same DOM read at A0 contains:
`Google Account: Shark 7 (cherrypie85arrow@gmail.com)`

Captured to `user-identifier.txt`. The string matches `^.+@.+\..+$`.
The header also shows `PRO` next to `Gemini` indicating the account has a
Google AI Pro subscription — recorded for downstream availability decisions
(do not exercise Pro/Ultra-gated features as cheap-model policy).

Evidence: `user-identifier.txt` and `$RUN_DIR/A0-locale-enforce/page-read.stdout.json`.
