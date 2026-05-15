# B1 — settings-language (catalog gap: `language-preference`)

**Status:** PASS
**Catalog row:** `language-preference`

The avatar dropdown's `Language` item opens an inline language submenu (NOT
a separate `/settings/language` route — `https://claude.ai/settings/general`
does not contain a language section). The submenu enumerates the following
language options (verbatim, in order):

1. `English (United States)`  ← currently selected
2. `Français (France)`
3. `Deutsch (Deutschland)`
4. `हिन्दी (भारत)` (Hindi — India)
5. `Indonesia (Indonesia)`
6. `Italiano (Italia)`
7. `日本語 (日本)` (Japanese — Japan)
8. `한국어(대한민국)` (Korean — Republic of Korea)
9. `Português (Brasil)`
10. `Español (Latinoamérica)`
11. `Español (España)`

**Catalog feedback:** The catalog row implies Settings → Language. In the
live UI, Language is reached via `avatar dropdown → Language` rather than a
sidebar tab in `/settings`. No durable change executed.

Evidence: `read-lang.json`, `click-language.json`.
