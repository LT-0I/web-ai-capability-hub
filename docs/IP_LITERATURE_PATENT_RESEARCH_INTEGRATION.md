# IP literature/patent research integration

The uploaded `reference-ip-literature-patent-research` package influenced the research database design:

- Launch a visible browser with CDP.
- Prefer institutional/IP access already available in the browser.
- Use official advanced search/filter/export controls.
- Capture evidence and site maps.
- Stop on login walls, CAPTCHA, bot checks, access denial, unusual download behavior, or export limits.

This package does not require users to type paid-database account/password into the package. If IP/institutional access is unavailable, it returns a blocker report instead of attempting bypass.

The imported registry is preserved in `site_registry_entries` and exposed through `site-registry://sites`.
