# B8 — privacy-data-controls (catalog gap: data-controls + `shared-chats-manage`)

**Status:** PASS
**Catalog row:** Privacy / data controls + `shared-chats-manage` route.

Navigated to `https://claude.ai/settings/privacy` which redirected to
`https://claude.ai/settings/data-privacy-controls`. Page body enumerated
(verbatim):

Header:
- `Privacy Center` (link), `Privacy Policy` (link)
- Section subtitles: `How we protect your data`, `How we use your data`

Controls:
1. **Location metadata** — toggle. Subtitle: "Allow Claude to use coarse
   location metadata (city/region) to improve product experiences. Learn
   more."
2. **Help improve Claude** — toggle. Subtitle: "Allow the use of your
   chats and coding sessions to train and improve Anthropic AI models.
   Learn more."
3. **Export data** — button (3× duplicated label, likely
   primary/secondary stack).
4. **Shared chats** — `Manage` button. This is the entry point for the
   catalog row `shared-chats-manage`.
5. **Memory preferences** — `Manage` (dropdown / link).

Per HARD rule I did not click `Export data` (might initiate a real
data-export job) and did not flip either toggle.

**Catalog feedback:** The catalog row `shared-chats-manage` is reachable
from this page via `Manage` next to `Shared chats`, separate from the
in-chat `Share chat` modal (B7). Two distinct surfaces:
- B7 = create-share-link surface (in-chat).
- B8 = manage / revoke existing share links surface (Settings → Privacy
  → Shared chats → Manage).

Evidence: `read-1.json`.
