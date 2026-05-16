# Stream #5 — Claude BLOCKED_NEEDS_USER items

## claude-sidebar-code — Claude Code (cloud agent at claude.ai/code)

**Status:** BLOCKED_NEEDS_USER

### What was discovered (path IS known up to the composer)
- Entry point: sidebar link `a[aria-label="Code"]` (href `/code`) OR direct nav `https://claude.ai/code`. Page title "Claude Code", labelled "Research preview".
- "New session" button: `xpath=//button[contains(.,"New session")]` (also `⇧⌘O`). Renders the new-session panel ("What's up next, Bb?").
- Model selector button: `xpath=//button[contains(.,"Opus 4.7")]` (dynamic id like `#_r_gu_`). Opens a `role=menu`.
  - Model menuitems (role=menuitemradio, dynamic base-ui ids — address by name):
    `xpath=//*[@role="menuitemradio"][contains(.,"Haiku 4.5")]`, `... "Sonnet 4.6"`, `... "Opus 4.7"`, `... "Opus 4.7 1M"`.
    Effort menuitemradios: Low / Medium / High / Max. **Successfully switched model to Haiku 4.5 (verified via button label).**
- Environment selector button: `xpath=//button[contains(.,"Default")]`. Opens menu with menuitemradios:
  `Local · Desktop only`, `Default` (cloud sandbox), and menuitem `Add cloud environment…`.
  Also a `Select repo…` button → repo picker popover ("No repos match. Repo missing? Install the Claude GitHub app…"). No GitHub repos are connected (connecting one is an OAuth/account integration = OUT_OF_SCOPE per campaign rules).
- "Default" cloud environment can be selected without a repo (selected the `Default` menuitemradio successfully).

### Exactly what is blocked
The **task input editor cannot be driven via the project CLI**:
1. `browser:read --mode full` surfaces NO composer node. There is no element with
   `placeholder="Describe a task or ask a question"`, no `contenteditable`, no
   ProseMirror/CodeMirror/textarea, no `data-testid*="composer"` in the surfaced DOM.
2. The only `role=textbox`/`input` present is `#base-ui-_r_g9_`, which is a
   **hidden base-ui sink**: `aria-hidden="true"`, `tabindex="-1"`,
   `style="clip: rect(0px,0px,0px,0px); width:1px; height:1px; position:fixed; top:0; left:0"`.
   Typing into it does not populate the visible composer (value stays `""`).
3. `browser:type` against `xpath=//*[contains(@placeholder,"Describe a task")]`
   times out — the locator never resolves.
4. The visible **Send** button (`button[aria-label="Send"]`) is refused by the
   project CLI's sensitive-content guard ("Human confirmation required before
   click: Target or content looks sensitive"). Pressing Enter on the hidden input
   instead opens the repo-picker popover (focus is not on the real editor).

So: navigation, model selection (Haiku confirmed), and environment selection all
work; the **prompt entry + submit** step cannot be completed through the CLI
because the real editor is not exposed to `browser:read`/`browser:type` and Send
is safety-guarded.

### Live DOM observed at block point
- Composer area visible text: "Describe a task or ask a question" (placeholder),
  controls: "Accept edits" (mode), "Add" (+), mic/"Press and hold to record",
  "Send" (`button[aria-label="Send"]`), model "Haiku 4.5", "Usage: plan 25%".
- Env row: "Default" + "Select repo…".
- Screenshots: `.runs/web-ai-explore/stream5/claude-code-landing.png`,
  `claude-code-newsession.png`, `claude-code-aftersend.png`.

### Precise question for the user
For Claude Code at `https://claude.ai/code` (Default cloud environment, no GitHub
repo), what is the exact manual UI sequence to enter a task prompt and submit it?
Specifically:
1. What is the stable selector / DOM shape of the real task editor (is it a
   ProseMirror/Lexical contenteditable inside a shadow root or portal that our
   `browser:read` accessibility walk is skipping)? How should we target it
   (e.g. click coordinates, a specific `[data-...]` attribute, focus via the
   hidden base-ui input then `browser:press` a key sequence)?
2. Is clicking the `button[aria-label="Send"]` for Claude Code an action you
   authorize the automation to perform (it is currently refused by the CLI
   sensitive-content guard)? Or should submission always go via a key press, and
   if so, which element must hold focus?
3. With the `Default` cloud environment and no connected repo, does a submitted
   task actually run, or is a connected GitHub repo / the `Local · Desktop only`
   (desktop app) environment mandatory? If a repo is required, that connection is
   OUT_OF_SCOPE (OAuth) — please confirm whether Claude Code should then be
   marked OUT_OF_SCOPE for this campaign.
