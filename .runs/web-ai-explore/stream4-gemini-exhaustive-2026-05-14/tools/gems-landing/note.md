# tools/gems-landing

Status: PASS

URL: `https://gemini.google.com/gems/view?hl=en`. Page header
"Gems premade by Google". 8 premade Gems enumerated verbatim:

1. **Chess champ** (Experiment) — "Play chess with a language model. Make your first move using chess notation to start your match."
2. **Storybook** (Experiment) — "Create a customized picture book, for either children or adults, given a topic, an optional target audience age, and an optional art style for the images."
3. **Brainstormer** — "Find inspiration easily. Fresh ideas for parties, gifts, businesses and more."
4. **Career guide** — "Unlock your career potential. Get a detailed plan to refine your skills and achieve your career goals."
5. **Coding partner** — "Level up your coding skills. Get the help you need to build your projects and learn as you go."
6. **Learning coach** — "Here to help you learn and practice new concepts. Tell me what you'd like to learn, and I'll help you get started."
7. **Productivity planner** — "Stay on top of your work. Schedule tasks, daily updates, and weekly summaries from apps like Gmail, Calendar, and Drive to boost your productivity."
8. **Writing editor** — "Elevate your writing. Get clear, constructive feedback, from grammar to structure."

A `New Gem` button is present (covered in `tools/gems-create`). A
"Notice about shared Gems" card with a Dismiss button and a "Learn more"
external link is also rendered.

Catalog selectors:
- Launch a premade Gem: `a[aria-label="Start a new conversation with Gem: <Name>"]`.
- More options per Gem: `button[aria-label="More options for \"<Name>\" Gem"]`.
