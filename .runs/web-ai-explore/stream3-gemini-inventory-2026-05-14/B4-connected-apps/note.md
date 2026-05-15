# B4 — Connected Apps inventory (personal-intelligence-connect /
#         connected-apps-settings gap verification)

**Status:** PASS

Navigated via Personal Intelligence → `Go to Connected Apps section` →
URL `https://gemini.google.com/apps`. Page header: `Connected Apps —
Connect your favorite apps for smarter help.` Two top-level groups: `From
Google` and `Other`.

Apps catalogued verbatim (order from DOM `visibleText`):

**From Google:**
- `Google Workspace — Get personalized insights from your Workspace apps,
  and ask for info about your content.` Sub-rows shown: `Gmail`, `Google
  Calendar`, `Google Docs`, `Google Drive`, `Google Keep`, `Google Tasks`.
  Each sub-row has a `Learn more` link.
- `Google Photos — Get personalized insights based on your Photos. Find
  photos of a person, place, moment, and more.` Example prompt: `Plan a
  vacation itinerary for me this winter, inspired by photos of my prior
  trips.`
- `Search services — Get personalized insights using your saved data from
  services like Search, Maps, Shopping, News, and Google Flights and Hotels.`
  Example prompt: `Show me hidden patterns in my Google searches`.
- `YouTube — Get personalized insights based on your YouTube data, like
  video and music recommendations.` Example: `Recommend a film based on my
  YouTube history`.

**Other:**
- `YouTube Music @YouTube Music — Play, search, and discover your favorite
  songs, artists, playlists and more`. Example: `Play songs where Beyoncé
  and Jay-Z feature together.`
- `GitHub @GitHub — Import code from public or private repositories, and
  ask questions about it.` Example: `What external libraries are used in
  the attached code?`
- `OpenStax @OpenStax — Retrieves passages from openly licensed textbooks
  from OpenStax.` Example: `@OpenStax definition of a Lewis acid`
- `OpenTable @OpenTable — Discover and book a reservation at the best
  restaurants for every occasion.` Example: `Reserve a table for 2 at La
  Pecora Bianca SoHo on Friday at 7:30 PM.`
- `SynthID @SynthID — Tool to verify if medias are made with Google AI or
  not by detecting the SynthID watermark.`

Footer link: `Gemini Apps Privacy Hub` (opens new window).

Toggle states observed (9 `role="switch"` controls present):
- toggle-1 (`Google Workspace`): `aria-checked="false"` (OFF)
- toggle-2..6 (other From-Google rows): all `aria-checked="false"` (OFF)
- toggle-7: `aria-checked="true"` (ON)
- toggle-8: `aria-checked="false"` (OFF)
- toggle-9: `aria-checked="true"` (ON)

DOM ordering implies toggle-7 maps to OpenStax and toggle-9 to SynthID
(those are the two extensions with on-state) but the headings did not pair
to switches in the accessibility tree — recorded as ordering-based mapping
only.

**Catalog gap-resolved / additions:**
- `connected-apps-settings` (id) — settings UI present, route verified.
- `personal-intelligence-connect` (id) — apps listing reachable in current
  PRO account.
- **Catalog ADDITIONS:** `OpenTable @OpenTable` and `SynthID @SynthID` are
  NOT in `gemini-feature-catalog.md`. `YouTube Music @YouTube Music` is
  also not in the catalog. (`OpenStax` is in the catalog as
  `openstax-learning-extension`.)
