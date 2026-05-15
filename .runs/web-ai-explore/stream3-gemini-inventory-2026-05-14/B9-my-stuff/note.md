# B9 — my-stuff-folder catalog row verification

**Status:** PASS

URL: `https://gemini.google.com/library`. Page header `My stuff`.
Subnav: `Media` tab visible. Content area shows a `Preview or open` thumbnail
(matching the generated image from A12, the red-square).

Side panel sections at this page show only `New chat`, `My stuff`, `Gems`,
`Chats` — the `Notebooks` row is NOT shown here. (It appeared on `/app` in
B6/B8.) This is rollout drift / contextual side panel.

**Catalog cross-check:** `my-stuff-folder` (id) says `Use the redesigned
Gemini app "My Stuff" area to find generated images, videos, and reports`.
Confirmed: my generated image (A12) is visible in this view. Section is
served at `/library`, not `/my-stuff` — **selector drift**: catalog
`web_ui_path` doesn't specify URL, observed URL `/library`.

