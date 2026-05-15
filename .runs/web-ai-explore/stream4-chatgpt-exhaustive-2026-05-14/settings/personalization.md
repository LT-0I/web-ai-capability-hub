# settings/Personalization

Status: PASS (read-only)

Tab `s4-set`, Personalization tab.

## Visible sections + controls (read-only)

### Base style and tone
- `Default` (active selector)
- Characteristics row of independent toggle-buttons: `Warm Default`,
  `Enthusiastic Default`, `Headers & Lists Default`, `Emoji Default`
  (each currently set to `Default`).

### Fast answers
- Description: `ChatGPT can sometimes use its general knowledge to give
  fast, in-depth answers. These aren't personalized and don't use your
  memory.`
- Discrete `role="switch"` widget (per Stream #3 evidence
  `aria-checked="true"` — ON).

### Custom instructions / About you
- `Nickname` (empty in lite read)
- `Occupation` = `Engineering student at University of Waterloo`
  (user-set value)
- `More about you` (free-text field)

### Memory
- `Manage` button → opens `Saved memories` panel (Stream #3 B2 confirmed
  empty-state literal `No saved memories`).
- `Reference saved memories` toggle (`Let ChatGPT save and use memories
  when responding.`)
- `Reference chat history` toggle (`Let ChatGPT reference all previous
  conversations when responding. ChatGPT may use Memory to personalize
  queries to search providers, such as Bing.`)

### Pulse (Pro account)
- `Reference Memory in suggestions` toggle (`Let ChatGPT use memories
  proactively in suggestions. Turning this off will disable "Pulse".`)
- `Show "Pulse" in new chats` toggle.

### Record mode
- `Reference record history` toggle (`Let ChatGPT reference all previous
  recording transcripts and notes when responding.`) — note: Record mode
  itself is macOS-only per catalog; this toggle still shows on web Pro.

No state changes performed; all reads only.

Evidence: `personalization.json`.
