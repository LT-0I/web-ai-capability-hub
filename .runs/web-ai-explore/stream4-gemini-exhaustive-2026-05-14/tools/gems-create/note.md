# tools/gems-create

Status: PASS (form captured, NOT saved per doctrine)

URL: `https://gemini.google.com/gems/create?hl=en`. The page renders the
**Gem Editor / Preview** split-view:

Editor fields:
- **Name** — `Input for a Gem name`
- **Description** — `Describe your Gem and explain what it does`
- **Instructions** — `Enter a prompt for Gemini` (rich-text composer with
  Undo / Redo / `Power up` rewrite-button)
- **Default tool** — dropdown, currently `No default tool`
- **Knowledge** — file-upload section (`Open upload file menu for Gem
  knowledge section`); auto-help: "If you share this Gem, the titles of
  the Gem's attached files will be visible. You'll be prompted separately
  to share the attached file's contents."
- **Disable Knowledge Citations** toggle

Preview pane shows "To preview your Gem start by giving it a name" — has
its own composer + mode picker (`Fast`) + Send message.

Footer buttons: `Save Gem` (primary) and `Cancel edit or creation`.

Form text captured verbatim to `page.json`. Did NOT click Save.

Catalog row `gems-create` confirmed reachable.
