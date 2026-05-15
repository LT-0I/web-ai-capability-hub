# B6 — gpts-browse

Catalog row: closest match is `gpt-create` (`Explore GPTs → Create, or open
chatgpt.com/gpts/editor.`) — there is no dedicated `gpts-browse` row in the
catalog. Treated as a Part-B verification of the `/gpts` landing surface.

Status: PASS

## Observation

Allocated `B6-gpts` against `https://chatgpt.com/gpts`. Page title: `Explore
GPTs`. URL resolved to `https://chatgpt.com/gpts`. Landing renders:

- Header text: `Explore GPTs` with `My GPTs` and `Create` controls.
- Tagline: `Discover and create custom versions of ChatGPT that combine
  instructions, extra knowledge, and any combination of skills.`
- Category tabs (Chinese chrome string leaks through despite locale
  enforcement — see Selector drift note): `精选推荐 DALL·E Productivity
  Lifestyle Education Research & Analysis Writing Programming` (translation:
  `精选推荐` = `Featured`).

**Featured GPTs section (`本周精选推荐` = "This week's featured")**, ≥5
names captured verbatim from `visibleText`:

1. `Video AI by invideo` — `4.0 ★ - AI video maker GPT (Supercharged
   with Sora 2) - generate engaging videos with voiceovers in any
   language! By invideo.io`
2. `Expedia` — `Bring your trip plans to life – get there, stay there,
   find things to see and do. By expedia.com`
3. `Canva` — `Effortlessly design anything: presentations, logos, social
   media posts and more. By community builder`

**Trending section (`热门 社区中最受欢迎的 GPT` = "Popular: Most popular
GPTs in the community")**:

4. `Scholar GPT` — `Enhance research with 200M+ resources and built-in
   critical reading skills... By awesomegpts.ai`
5. `Fitness, Workout & Diet - PhD Coach` — `By Newgen PhD`
6. `Consensus` — `Ask the research, chat directly with the world's
   scientific literature... By consensus.app`
7. `챗` (Korean name) — `챗GPT로 경험하는 가장 자연스러운 한국어 대화...
   By gptonline.ai`

**ChatGPT-team-created GPTs section (`由 ChatGPT 提供 ChatGPT 团队创建的
GPT` = "By ChatGPT: GPTs created by the ChatGPT team")**:

8. `Monday` — `A personality experiment... By ChatGPT`
9. `DALL·E` — `OpenAI's legacy image generation model... By ChatGPT`
10. `Data Analyst` — `Drop in any files and I can help analyze and
    visualize your data... By community builder`
11. `Hot Mods` — `Let's modify your image into something really wild...
    By ChatGPT`
12. `Creative Writing Coach` — `I'm eager to read your work... By
    ChatGPT`
13. `Coloring Book Hero` — `Take any idea and turn it into whimsical
    coloring book pages. By ChatGPT`

Far more than the required 5 featured names. No `Publish` / `Submit` button
was clicked.

Catalog feedback: the catalog has rows `gpt-create`, `gpts-mention`,
`gpts-gpt-store` (likely) but the `/gpts` landing's category-tab labels
(`精选推荐 DALL·E Productivity Lifestyle Education Research & Analysis
Writing Programming`) are not captured as a row. Suggested catalog
addition: `gpts-explore-landing` covering the `/gpts` route, category
tabs, and the three section headings (Featured / Trending / By ChatGPT).

Evidence: `dom-gpts.json` (visibleText 11.5KB).
