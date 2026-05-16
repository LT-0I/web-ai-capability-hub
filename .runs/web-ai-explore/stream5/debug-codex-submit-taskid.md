# Debug: chatgpt-codex submit-task returned the WRONG (stale) task id

Date: 2026-05-15
Mode: Opus max-effort interactive observe-first debugger
Scope edited: `src/mcp/submcp/chatgpt-codex/{flow.ts,tools.ts}`, `tests/consumerContract.test.ts`

## Symptom

`webai:chatgpt:codex:submit-task --confirmed` returned `status: submitted` with
`task_id: task_e_6a07e803d3e4832dab14de939e456e7f` — the id of a DIFFERENT,
earlier README-probe task, not the task the call just created. A false-useful
result (violates the project no-false-result honesty rule).

## Root cause (pinned, file:line)

`src/mcp/submcp/chatgpt-codex/flow.ts:165-172` (pre-fix `extractSubmittedTaskId`):

1. `page.url()` is read synchronously immediately after `submit.click()`. On this
   ChatGPT account the Codex app does NOT navigate to
   `/codex/cloud/tasks/<newId>` after Submit — the URL stays `/codex/cloud`. So
   the URL branch never matched.
2. It then `waitForSelector('a[href*="/codex/cloud/tasks/task_e_"]', attached)`
   and read `.first()` href. But the PREVIOUS run's task card is **already in the
   DOM** at Submit-click time; the freshly-created card has not been prepended
   yet (SPA not updated post-Submit). `waitForSelector` resolved instantly
   against the stale card, and `.first()` (document-order top = newest) returned
   the **previous** task id.

Live DOM confirmation (profile=chatgpt, CDP 9223, Chrome 148): the
`/codex/cloud` task list renders newest-first under "TODAY"; document-order
unique task hrefs were
`[6a0803eb…, 6a07e803…, 6a07e593…, 6a04064d…]` (top = most recent). The bug
always grabbed index 0, which at Submit time is the *previous* run's card.

## Fix (minimal, no graceful fallback)

`src/mcp/submcp/chatgpt-codex/flow.ts`
- Added `taskIdFromUrl()` helper and `readTopTaskCardId(page)` (reads the
  document-order first task-card href = current top/newest id).
- Rewrote `extractSubmittedTaskId(page, preSubmitTopId, timeoutMs=30000)`:
  bounded poll (1500ms cadence, same disciplined shape as
  `waitForCodexTaskHydration`, no ad-hoc wait mechanism) that returns the id
  only once it is genuinely new — either the route changed to
  `/tasks/<newId>` (`newId !== preSubmitTopId`) or the top task-list card id
  differs from the captured pre-submit top id. On bounded timeout it returns
  `null` (caller surfaces stable `POSTCONDITION_TIMEOUT`); it NEVER returns the
  stale id. The only non-null timeout return is when there was NO pre-submit
  card at all (empty list) — then the first card to appear is unambiguously the
  new task (correct logic, not a fallback).

`src/mcp/submcp/chatgpt-codex/tools.ts:82-90`
- Capture `preSubmitTopId = await readTopTaskCardId(page)` BEFORE clicking
  Submit, pass it into `extractSubmittedTaskId(page, preSubmitTopId)`.

`tests/consumerContract.test.ts`
- Extended `mockCodexPage` with `preSubmitTaskHref` + a `page._submitted` flag
  so the mock models the real SPA prepend (top-card href flips from the prior
  card to the new card on Submit; live-accurate path does NOT URL-navigate).
- Updated the existing submit-task test to assert the returned id is the new
  card id and `notEqual` the stale prior id.
- Added regression test "chatgpt-codex submit-task returns the freshly-created
  card id, never the stale top card" covering: (a) pre→post-submit top-card id
  flip after a few reads → returns the NEW id; (b) bounded-timeout where the
  top card never changes → returns `null` (honest failure, never the stale id).

## Live proof (this session)

Pre-submit top card id (captured live): `task_e_6a0803eb5780832d8cc6927474fdc0df`

`timeout 260 node dist/src/cli.js webai:chatgpt:codex:submit-task --profile chatgpt --prompt "Read-only: print the repository top-level file list. Make no changes, no commit, no PR." --confirmed --tab-id dbg-st-1`
→
```
{
  "task_id": "task_e_6a080562cf78832da107b29ccf4862e7",
  "task_url": "https://chatgpt.com/codex/cloud/tasks/task_e_6a080562cf78832da107b29ccf4862e7",
  "repo": "LT-0I/CN-", "env": "LT-0I/CN-",
  "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a", "status": "submitted"
}
```

Assertions PASS:
- `task_e_6a080562cf78832da107b29ccf4862e7` matches `^task_e_[0-9a-f]{32}$`
- != old probe id `task_e_6a07e803d3e4832dab14de939e456e7f`
- != pre-submit top card `task_e_6a0803eb5780832d8cc6927474fdc0df` (what the OLD
  bug would have returned)

Follow-up `task-status` on the NEW id (after task completed):
```
{ "task_id": "task_e_6a080562cf78832da107b29ccf4862e7",
  "repo": "LT-0I/CN-", "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a",
  "status": "complete", "done": true, "status_text": "Worked for 18s" }
```
(First immediate poll returned `INVALID_ARGS: not a known in-progress or
terminal state` — the brief pre-status window for an 18s task; the guard passed,
i.e. it WAS the LT-0I/CN- task, not a refusal. It resolved to `complete` ~25s
later.)

## No-regression evidence

- `task-status` on old probe `task_e_6a07e803d3e4832dab14de939e456e7f` →
  `status: complete`, "Worked for 33s", `repo: LT-0I/CN-` (get-diff /
  ownership-guard path still GREEN).
- `list-envs` → `status: ok`, single env `LT-0I/CN-`
  (`6a07e4ffdafc8191b77e6cff2264cd9a`), no noeticbraid leakage.
- Allowlist STRICT (`LT-0I/CN-` only), `--confirmed` gate intact, no
  Create-PR/Archive/Share/merge/push, no contract/count/version change, no commit.

## Gate

- `rm -rf dist && npm run build` → exit 0
- `npm test` → tests 219, pass 219, fail 0 (was 218; +1 new regression test)
- Contract/count constants unchanged (consumer-contract-1.4.0, webai 37,
  codex tools 4, error_codes 32).
