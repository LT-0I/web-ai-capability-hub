# settings/apps (Connected Apps)

Status: PASS (read-only)

URL: `/apps?hl=en`. Page header "Connected Apps — Connect your favorite
apps for smarter help".

Two sections:

**From Google**
- Google Workspace (umbrella) — sub-apps Gmail, Google Calendar, Google
  Docs, Google Drive, Google Keep, Google Tasks (single Workspace switch
  governs all sub-apps)
- Google Photos
- Search services (Search, Maps, Shopping, News, Flights, Hotels)
- YouTube
- YouTube Music (catalog addition vs v2)

**Other**
- GitHub
- OpenStax
- OpenTable (catalog addition vs v2)
- SynthID (catalog addition vs v2)

9 switches total (e17, e19, e24, e29, e34, e39, e44, e49, e51). None
flipped during this run.

Catalog drift vs v2: confirms Stream #3 catalog additions for OpenTable,
SynthID, YouTube Music. Removal: no `Personal Intelligence` switch on
this page (it's on `/personalization-settings`).
