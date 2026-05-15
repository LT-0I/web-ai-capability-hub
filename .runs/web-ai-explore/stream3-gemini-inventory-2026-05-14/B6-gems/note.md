# B6 — Gems landing (gems-create, experimental-gems, gems-labs-create gap
#       verification)

**Status:** PASS

URL `https://gemini.google.com/gems/view?hl=en` (reached via Main menu →
Gems). Note: `gemini.google.com/gems` 404s; the live route is `/gems/view`.

Gems landing observed verbatim (8 premade by Google):

| name | tag | description verbatim |
|---|---|---|
| Chess champ | `Experiment` | Play chess with a language model. Make your first move using chess notation to start your match. |
| Storybook | `Experiment` | Create a customized picture book, for either children or adults, given a topic, an optional target audience age, and an optional art style for the images. |
| Brainstormer | (none) | Find inspiration easily. Fresh ideas for parties, gifts, businesses and more. |
| Career guide | (none) | Unlock your career potential. Get a detailed plan to refine your skills and achieve your career goals. |
| Coding partner | (none) | Level up your coding skills. Get the help you need to build your projects and learn as you go. |
| Learning coach | (none) | Here to help you learn and practice new concepts. |
| Productivity planner | (none) | Stay on top of your work. Schedule tasks, daily updates, and weekly summaries from apps like Gmail, Calendar, and Drive to boost your productivity. |
| Writing editor | (none) | Elevate your writing. Get clear, constructive feedback, from grammar to structure. |

Plus:
- `New Gem` button — `gems-create` entry point reachable.
- `Notice about shared Gems` notice with `Learn more` and `Dismiss` link.
- Per-Gem `More options for "<name>" Gem` button.

**Catalog gap-resolved:**
- `experimental-gems` (gap) — confirmed `Experiment` badge appears next to
  exactly 2 of the premade Gems (`Chess champ`, `Storybook`). There is NO
  separate "My Gems from Labs" section visible on this account (gap row
  `gems-labs-create` asked specifically about that; **NOT REACHABLE** for
  this PRO/personal account).
- `gems-create` (id) — `New Gem` button visible.
- `storybook-create-gem` (id) — `Storybook` Gem confirmed in premade list,
  also `Experiment`-tagged.

**Catalog ADDITIONS** (not in v2 catalog):
- `Chess champ` Gem (Experiment) — premade Gem not enumerated in
  `gemini-feature-catalog.md`.
- `Brainstormer`, `Career guide`, `Coding partner`, `Productivity planner`,
  `Writing editor` are premade Gems — the catalog mentions premade Gems
  generally (`gems-use`) but does not enumerate them.

**Not exercised** (would create durable state): clicking `New Gem`.
