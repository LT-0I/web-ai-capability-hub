# Settings sweep (read-only)

Status: PASS (9 tabs enumerated; nothing flipped)

All notes are read-only: no toggle, dropdown, or button affecting durable
state was triggered.

## Sidebar tab list (Pro account)

`General / Notifications / Personalization / Apps / Schedules / Billing /
Data controls / Storage / Security / Parental controls / Account`

Skipped: **Billing** (doctrine §3 forbid).

## Tab summaries

| tab | notable controls | evidence |
|---|---|---|
| General | Appearance=System, Contrast=System, Accent=Green, Language=`English (US)`, Spoken language=`Auto-detect`, Voice=`Vale`, `Set up MFA`, `Enable Dictation` switch, `Separate Voice` switch | `general.json`, `general.md` |
| Personalization | Base style/tone selector, 4 Characteristics toggles (Warm/Enthusiastic/Headers & Lists/Emoji, all `Default`); `Fast answers` switch (ON per Stream #3); Custom instructions (Nickname empty, Occupation=`Engineering student at University of Waterloo`, More about you); Memory `Manage`+`Reference saved memories`+`Reference chat history`; Pulse 2 toggles; Record mode toggle | `personalization.json`, `personalization.md` |
| Apps | `Connectors are now called Apps`; `GitHub Advanced settings`; `Add more`; `Explore all apps` | `apps.json` |
| Schedules | `ChatGPT can be scheduled to run again after it completes a task. Choose Schedule from the menu in a conversation to set up future runs.`; `Manage` button | `schedules.json` |
| Data controls | `Improve the model for everyone` Off (button); `Location` Off (button); `Remote browser data` On (button); `Shared links Manage`; `Archived chats Manage`; `Archive all chats Archive all`; `Delete all chats Delete all`; `Export data Export`; `Marketing privacy` (no observed inline state) | `data-controls.json` |
| Storage | `5.78 MB of 100 GB used`; library breakdown `Files 3.92 MB • 28 files`, `Images 1.86 MB • 17 images`; `Manage storage` button | `storage.json` |
| Security | `Password Add`; `Security keys & passkeys Add`; `Authenticator app`; `Text message`; `Trusted Devices`; `Advanced account security Enroll`; `Log out of this device`; `Log out of all devices`; `Secure sign in with ChatGPT`; `Codex CLI Disconnect` (existing connection); `Enable device code authorization for Codex` | `security.json` |
| Parental controls | `Parents and teens can link accounts...`; `Add family member` | `parental-controls.json` |
| Notifications | Codex `Push`; Group chats `Push`; Projects `Email`; Pulse daily updates `Push`; Recommendations `Push, Email`; Responses (truncated) | `notifications.json` |
| Account | Name=`Shark`, Email=`cherrypie85arrow@gmail.com`, `Delete account`, `GPT builder profile`, `Links Select a domain LinkedIn Add GitHub Add`, `Receive feedback emails` | `account.json` |

Note: the Account tab exposes the account email. This is now recorded in
project memory as part of the user identifier (already known from
`evidence/user-identifier.txt`: handle `Shark`, plan `Pro`).

Tab freed at end of group.
