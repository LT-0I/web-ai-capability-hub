# generate/scheduled-action

Status: PASS (form opened, NOT saved per doctrine)

Path: navigated to `https://gemini.google.com/scheduled?hl=en` (URL gap
filled — `/scheduled-actions` 404s).

Page header: "Scheduled actions manager" + "You haven't scheduled anything
yet". Templates listed:
- `News digest — Catch me up on the news`
- `Explorations — Feed my curiosity by teaching me something new every day`
- `What's for dinner? — Send me healthy dinner recipes every weekend`
- `Morning motivation — Perk me up each morning with a motivational quote`

Side promo card: **"Get ahead of your day with CC by Google Labs - Personal
daily insights and help, right in your email inbox"** (this is a separate
mailing service, requires email opt-in).

Clicked `New action` → modal showed `Name / Instructions / Schedule (Daily
9:00 AM) / Cancel / Create`. Form text captured to `form.json`. **Cancel
clicked, NOT Create** — doctrine requires never durably modifying account
settings.

Catalog addition: URL is `/scheduled` (not `/scheduled-actions`).
