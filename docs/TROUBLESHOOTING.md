# Troubleshooting

## Chrome/Edge not found

Set `WAH_BROWSER_EXECUTABLE` to the executable path.

## CDP port conflict

Pass `--cdp-port <free-port>` or unset `WAH_CDP_PORT` so the launcher chooses a free port.

## Login expired

Launch the same profile and log in again manually. Do not copy cookies.

## Stale selectors

Run `capability:update`, capture a site map, diff against the previous map, and update adapter notes.

## Paid database access blocked

Stop. Confirm institutional/IP access in the visible browser. Do not bypass login walls, CAPTCHA, bot checks, or export warnings.

## npm install fails in constrained environment

The Web GPT environment showed DNS `EAI_AGAIN` and Node engine warning because it ran Node 18 while the package targets Node 20+. Use Node 20+ with working npm registry access locally.
