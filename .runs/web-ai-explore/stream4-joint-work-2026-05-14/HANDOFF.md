# Stream #4 — Handoff (2026-05-15)

Blind codex-dispatch approach exhausted after 5 evidence-grounded fix
rounds + 5 live smokes. This documents exactly what is solid, what is
still RED, the precise current root causes, and why the next step must
be **interactive debugging, not another codex dispatch**.

## ✅ Solid / done / committed

- **Gemini `upload_and_query` native-OS-file-chooser hang — FIXED &
  VERIFIED.** Root cause: clicking the Gemini "Upload files" menu item
  opened Chrome's native OS file dialog (modal GTK), freezing the
  browser/CDP (reproduced live 2×). Fix: Playwright filechooser
  interception (`Promise.all([page.waitForEvent('filechooser'),
  click])` → `chooser.setFiles()`). Confirmed working in r3, r4, r5
  (file attaches via chip, real conversation created, **no OS dialog**).
  Commit `a3eb02c`.
- Build green, `npm test` 151/151, `consumer-contract-1.3.0`
  unchanged, no regressions, ChatGPT/Claude upload + completion paths
  untouched (still GREEN).
- `.omc/skills/web-ai-launch-browsers/SKILL.md`: documented
  `browser:read --tab-id` requires `--profile` (else defaults to 9222).

## ❌ Still RED (3 tools) — precise current root causes

Evidence: `resmoke-r5-*.json`, `dom-probe-r2.md` (Opus, HIGH-confidence,
controlled, literal-DOM).

1. **`webai_chatgpt_generate_image`** — `locator.click: Timeout 15000ms
   ... waiting for [role="menuitemradio"]:has-text("Create image")`.
   - dom-probe-r2 §A proved the selectors (`#composer-plus-btn` →
     that radio) are CORRECT *when the menu is open*. Under the tool's
     Playwright execution path the **menu never opens** (the radio
     never appears) even though it does under the probe's
     `browser:click` CLI path. The divergence is the
     automated-interaction layer, not the selector.
   - **Also a contract violation:** this path leaks the raw Playwright
     error instead of emitting `ELEMENT_NOT_FOUND` (CLAUDE.md §2.3).
     The error escapes the `WebAiToolError` wrapping in
     `activateChatgptImageMode` / the generate_image path. Fix the
     wrapping regardless of the menu issue.

2. **`webai_gemini_generate_image`** — `COMMAND_TIMEOUT` "Image
   generation did not complete". Either Create-image activation
   (zero-state chip OR `button.toolbox-drawer-button` →
   `[role="menuitemcheckbox"]:has-text("Create image")` per
   dom-probe-r2 §B) or the completion gate fails to converge in 180s.
   Needs live observation to tell which.

3. **`webai_gemini_upload_and_query`** — upload + send **work**
   (`files_in_chip:["r5-probe.txt"]`, conversation
   `gemini.google.com/app/007e62c813a0b756` created, no OS dialog).
   Failure is purely Phase-B: the completion gate (now keyed on
   `button[data-test-id="regenerate-button"]` present + Send enabled +
   no "Stop response", per dom-probe-r2 §C) **never fires in 120s**.
   Unknown whether (a) Gemini isn't responding at all for this account
   (heavily test-prompted tonight), or (b) the in-page `waitForFunction`
   check doesn't match in the tool's execution context. Must be
   disambiguated by watching a real Gemini response.

## Why NOT another codex round

5 rounds (timing-fix → image-mode-fix → gemini-filechooser-fix →
image-mode-r2-fix → final-converge-fix), each grounded in progressively
better evidence (culminating in the HIGH-confidence Opus
`dom-probe-r2.md`), moved exactly ONE tool to GREEN (the filechooser
one — because its root cause was precisely correct). The other 3 fail
at the automated-interaction layer (menu won't open under Playwright;
completion gate won't fire) which prompt-only dispatch cannot observe
or diagnose. CLAUDE.md explicitly bans the "run another smoke and just
retry" loop. More blind rounds are not warranted.

## Recommended next step — interactive debugging (fresh session)

Run the EXACT tool code while watching the live browser, specifically:

1. **ChatGPT menu:** instrument `activateChatgptImageMode` — does
   Playwright `#composer-plus-btn` `.click()` actually open the menu?
   Compare Playwright `.click()` vs CLI `browser:click`. Check whether
   the composer must be focused first, whether a trusted user gesture
   is required, or whether this account sees a different (A/B) composer
   UI without the menuitemradio. Then fix the raw-error→`ELEMENT_NOT_FOUND`
   wrapping on this path unconditionally.
2. **Gemini liveness:** manually send one prompt in the gemini-9225
   window and watch — does Gemini respond at all right now? If yes,
   confirm `button[data-test-id="regenerate-button"]` appears and that
   the tool's in-page completion check actually evaluates it in the
   page context (vs. the CLI extractor's filtered DOM). If Gemini is
   not responding, the RED is environmental (account/rate), not code.
3. Re-smoke the 3 only after a specific, observed root cause — not
   speculatively.

## Environment / safety notes for the next session

- Managed browsers: chatgpt→9223, claude-9224→9224, gemini-9225→9225.
  Launch via `scripts/launch-web-ais.sh` (serial; needs
  `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority`).
- **Never** use a `pkill`/`pgrep` pattern containing
  `data/browser-profiles/` — it self-matches the shell command and
  kills its own process. Kill by explicit PID or by the
  `remote-debugging-port=922x` flag instead.
- A **separate `noeticbraid` project** runs its own OMC/codex job
  pipeline (`~/.claude/jobs/...`, `cwd .../noeticbraid`) concurrently
  on this host. Those `codex resume`/`omx exec` processes are NOT
  rogue — never kill them.
- `.omc/codex-prompts/` and `.omc/codex-out/` are gitignored (prompts
  for this stream: `stream4-{image-mode-fix,gemini-filechooser-fix,
  image-mode-r2-fix,final-converge-fix}.md`).
- The Gemini upload native-OS-dialog hang is FIXED — do not fear
  running `gemini_upload_and_query`; it no longer freezes the browser.

## Key code anchors (`src/mcp/tools.ts`)

- `activateChatgptImageMode` — ChatGPT image-mode entry (menu issue +
  error-wrap gap).
- `activateGeminiImageMode` — zero-state chip + Tools-drawer paths.
- Gemini completion gate / `GEMINI_RESPONSE_SELECTOR` / Phase-A/Phase-B
  helpers — now keyed on `regenerate-button`; verify it fires in-page.
- `uploadFilesInExistingPage` Gemini branch — filechooser interception
  (DONE, do not regress).
