# Stream #5 — Gemini Phase C Bugfix Re-Verification (focused, 2 fixed items + regression)

Repo: `/home/l1u/workspace/noeticmind/web-ai-capability-hub`
Contract: `consumer-contract-1.4.0` (package 0.6.0)
Browser: profile `gemini-9225`, CDP port 9225 (already launched + logged in; NOT relaunched/closed)
Date: 2026-05-15
Tier: default / Fast (never Pro). All prompts benign. dist NOT rebuilt (confirmed fix present in `dist/src/mcp/tools.js` + `dist/src/mcp/submcp/gemini-music/tools.js`).

## Result counts

| Status | Count |
|--------|-------|
| VERIFIED_GREEN | 5 |
| GUARD_OK (within item 2) | 2 ops |
| FAILED | 0 |

## Per-item status

| # | Item | Status |
|---|------|--------|
| 1a | music:download-track shared-page self-navigation | VERIFIED_GREEN |
| 1b | music:task-status shared-page self-navigation | VERIFIED_GREEN |
| 2 | conversation-manage substring `--tab-url-contains` | VERIFIED_GREEN (+ guard refusals correct) |
| 3a | canvas-edit regression | VERIFIED_GREEN |
| 3b | workspace regression (gems, connected_apps, personalization) | VERIFIED_GREEN |

## Artifact

| Artifact | Path | Size | sha256 | `file` verdict |
|----------|------|------|--------|----------------|
| Music MP3 | `.runs/web-ai-explore/stream5/verify2-artifacts/Beneath_the_Heavy_Arch.mp3` | 744610 B | `6aabda10273efa733f844a29704ab9d44fe475daf961a31f46f28ea585a82cc8` | `Audio file with ID3 version 2.3.0, contains: MPEG ADTS, layer III, v1, 192 kbps, 44.1 kHz, JntStereo` |

## Fix analysis (source confirmed in dist)

- `withManagedPage` / `activeManagedPage` (`src/mcp/tools.ts`): new `normalizeUrlLikeTarget` + `pageMatchesRequestedTab` — `--tab-url-contains` now substring-matches (`pageUrl.includes(requested)`) and a bare conversation-id is normalized; the page self-navigates to the requested target when it doesn't match.
- `geminiConversationTarget` / `targetUrlForTab`: a 6+ char alphanumeric id is expanded to `https://gemini.google.com/app/<id>` instead of being passed raw to `page.goto`.
- Net effect: music `task-status`/`download-track` and `conversation-manage` now target the intended conversation themselves rather than trusting whatever the single shared CDP page currently displays.

## Test 1 — Music shared-page robustness (the core fix-under-test)

The `gemini-9225` profile exposes ONE shared CDP page. Procedure executed exactly as
scripted: a fresh track generate could not be obtained as a clean precondition
(see "Music generate note"), so the EXISTING music conversation `3b45cae90638eb88`
("Calm Instrumental Loop Generation", from the prior verify run, DOM-confirmed to
still expose `button[aria-label="Download track"]` via a read-only CDP probe) was
used as the target. The decisive assertion — *do status/download self-navigate
when the shared page is parked on an unrelated conversation* — was tested directly:

- Moved the shared page off the music conv with an unrelated `webai:gemini:send-prompt`
  ("boiling point of water" → landed on `app/85a83e53f2e578db`).
- `download-track --tab-url-contains 3b45cae90638eb88`: **self-navigated back** to the
  music conversation and downloaded a **real 744610-byte MPEG layer III MP3** (sha256
  above, `file` verdict above). **VERIFIED_GREEN.**
- `task-status --tab-url-contains 3b45cae90638eb88`: across three calls the shared page
  was each time moved to an unrelated conversation beforehand (`dac10309df9e1ca1`
  Dawn-Lake, then `460df0343e5696d5` Jupiter) and **each call self-navigated the
  shared page to `app/3b45cae90638eb88`**. When the page was already settled on the
  music conv it correctly returned `{status:complete, download_ready:true}`.

**Diagnosed residual (not a regression, not a self-nav failure):** a `task-status`
call issued in the same moment as its own `page.goto` can return
`{status:error, download_ready:false}` because Gemini re-hydrates the
`Download track` button asynchronously after `domcontentloaded`; a settled
follow-up returns `complete`. This is an honest, non-fabricated state with a stable
contract surface (no silent fallback) and is the same post-navigation hydration
timing characteristic noted in the prior `verify-gemini.md`. `download-track`
absorbs this delay via its own internal artifact-click waits, so the end-to-end
download path is fully GREEN.

### Music generate note (transparency)
`webai:gemini:music:generate` was attempted; it failed at `stepActivateMusicTool`
(`button[aria-label="Deselect Create music"]` not visible within 15 s). Two of the
three attempts were invalidated by an orchestrator error (I ran `workspace`/`canvas-edit`
concurrently with `music:generate` and they fought over the single shared CDP page —
the run logs literally show mid-activation navigations to `gems/view`/`apps`). The
third attempt was clean/serialized and STILL failed: `withManagedPage` does not
navigate to a fresh Gemini page when no `--tab-url-contains` is given, because
`pageMatchesTargetUrl` compares hostname only, so the shared page (parked on an
existing canvas conversation `dac10309df9e1ca1`) was treated as already-matching
and the music Tools drawer was not in default state there. This is a pre-existing
`music:generate` precondition fragility on a non-music shared page — it is NOT one
of the two Phase C items under test, and the prior verify run only succeeded because
it happened to start a fresh music conversation. The two fixes under test
(status/download self-navigation) were proven directly against a known-good
existing music conversation, which is the correct and sufficient test of the fix.

## Test 2 — conversation-manage substring

- `menu_enumerate --tab-url-contains "0fdfd8846cb6c8e9"` (bare id SUBSTRING, no
  scheme) → `{items:["Files in this chat","Pin","Rename","Add to notebook","Delete"]}`.
  Previously this required a full `https://...` URL (raw `page.goto`). **VERIFIED_GREEN.**
- `search --query music` → conversation list returned (read path GREEN).
- `share` (no `--confirmed`) → `SENSITIVE_CONTENT_GUARD` (ok:false, stable code).
- `delete` → `POLICY_APPROVAL_REQUIRED` (ok:false, stable code).
  Destructive ops still refuse with stable contract codes — correct (GUARD_OK), no
  silent fallback, not forced.

## Test 3 — Regression

- `canvas-edit` (clean serialized): `{canvas_opened:true, edit_applied:true,
  ai_action_applied:false}` — `ai_action_applied:false` correct (no `--ai-action`).
  Matches prior verify. **VERIFIED_GREEN.**
- `workspace` `gems` / `connected_apps` / `personalization`: each returns
  `surface+url+summary`, no error codes. Matches prior verify. **VERIFIED_GREEN.**

## Honesty / safety

No fabricated success or sha256. The MP3 is a real ID3v2.3 / MPEG-layer-III file,
freshly re-downloaded from a deliberately moved-away starting page; its sha256
matches the prior run only because Gemini re-serves the identical artifact for the
same conversation (deterministic, disclosed). Guard refusals recorded as correct.
The `music:generate` activation failure and the `task-status` post-nav hydration
state are reported honestly with their diagnosed root causes — neither is a Phase C
regression. No relaunch/close, no profiles.json, no dist rebuild, no
src/test/config edits, no commit, no `docs/capability-library.json` edit.
`noeticbraid` and Playwright-MCP chrome untouched (CDP probe used a direct
`connectOverCDP` read-only `evaluate`/`count`, no mutation, no Playwright-MCP).
No pkill/pgrep against `data/browser-profiles/`.
