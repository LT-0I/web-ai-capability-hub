# Stream #5 — ChatGPT Codex ownership-refusal root cause + fix

## Symptom

`webai:chatgpt:codex:task-status` and `webai:chatgpt:codex:get-diff` refused a
genuine completed `LT-0I/CN-` task (`task_e_6a07e803d3e4832dab14de939e456e7f`,
env `6a07e4ffdafc8191b77e6cff2264cd9a`):

```json
{ "ok": false, "status": "failed", "error_code": "INVALID_ARGS",
  "message": "ChatGPT Codex task refused: task page does not prove LT-0I/CN- ownership.",
  "repo": "LT-0I/CN-", "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a" }
```

Two prior blind codex fix rounds (go-live; "route reads through
readPageSnapshot") did not change the live refusal.

## Root cause — SPA hydration race (timing), proven by live instrumentation

Temporary instrumentation was added to `assertTaskBelongsToAllowlist` to dump the
exact text the guard evaluates at check time. The instrumented live run produced:

```json
{"at":"assertTaskBelongsToAllowlist",
 "url":"https://chatgpt.com/codex/cloud/tasks/task_e_6a07e803d3e4832dab14de939e456e7f",
 "textLen":0,"head":"","aroundLT":"<no LT-0I substring>",
 "delimitedRepoTest":false,"proves":false,"forbidden":false}
```

- The URL/tab is correct (hypothesis 2 — wrong tab/redirect — refuted).
- The predicate and separator glyph are correct: the known-good header read 8s
  later is 1240 chars, `"... May 15 · LT-0I/CN- · main · +2 -0 ..."`, with the
  separator at codepoint **183 (U+00B7 MIDDLE DOT)**, which the predicate char
  class `[\s·•|]` already matches (hypotheses 3 & 4 — bad predicate / reader
  option — refuted).
- The divergence: at guard time `visibleText(page)` returns **`""`** (`textLen:0`).

The Codex task detail page is a client-rendered React SPA with no SSR. Both
tool entry points (`webAiChatgptCodexTaskStatus`, `webAiChatgptCodexGetDiff` in
`src/mcp/submcp/chatgpt-codex/tools.ts:110-111,123-124`) navigate with
`page.goto(taskUrl, { waitUntil: "domcontentloaded" })` then immediately call
`readCodexStatus` → `assertTaskBelongsToAllowlist`. At `domcontentloaded` the
`<body>` is an empty shell, so `extractSnapshotFromPage`
(`src/reader/domExtract.ts:436-439`) reads `document.body.innerText === ""` and
`visibleText` is `""`. `pageTextProvesAllowedCodexTask("")` is correctly `false`,
so the guard honestly refuses. The orchestrator's manual probe only succeeded
because it waited ~8s between `browser:tab:alloc` and `browser:read`. Blind
codex never saw `textLen:0` because it cannot observe the live timing — hence
two failed blind rounds.

**Exact bug location:** read timing — `assertTaskBelongsToAllowlist` at
`src/mcp/submcp/chatgpt-codex/flow.ts:174-179` (pre-fix) read the snapshot once,
before SPA hydration. The predicate at `flow.ts:185-192` was never wrong.

## Fix (old → new)

`src/mcp/submcp/chatgpt-codex/flow.ts` — added `waitForCodexTaskHydration` and
made the guard await it. No predicate change, no graceful fallback (on timeout
the existing strict refusal still runs against the last text), guard remains
strict (forbidden noeticbraid still refused).

Old:
```ts
export async function assertTaskBelongsToAllowlist(page: any): Promise<Record<string, unknown> | null> {
  const text = await visibleText(page);
  if (CODEX_FORBIDDEN_REPO_RE.test(text)) return allowlistError("... forbidden noeticbraid ...");
  if (!pageTextProvesAllowedCodexTask(text)) return allowlistError("... does not prove LT-0I/CN- ownership.");
  return null;
}
```

New (poll the canonical snapshot until the SPA header hydrates, bounded; guard unchanged):
```ts
export async function waitForCodexTaskHydration(page: any, timeoutMs = 60000): Promise<string> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let text = await visibleText(page);
  while ((!text || (!pageTextProvesAllowedCodexTask(text) && !CODEX_FORBIDDEN_REPO_RE.test(text)))
         && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    text = await visibleText(page);
  }
  return text;
}

export async function assertTaskBelongsToAllowlist(page: any): Promise<Record<string, unknown> | null> {
  const text = await waitForCodexTaskHydration(page);
  if (CODEX_FORBIDDEN_REPO_RE.test(text)) return allowlistError("... forbidden noeticbraid ...");
  if (!pageTextProvesAllowedCodexTask(text)) return allowlistError("... does not prove LT-0I/CN- ownership.");
  return null;
}
```

Both `readCodexStatus` and `readCodexDiff` go through
`assertTaskBelongsToAllowlist`, so a single fix covers task-status and get-diff.
The instrumentation block was removed before finishing.

## Live re-verification (after fix, clean rebuild)

`webai:chatgpt:codex:task-status --profile chatgpt --task-id task_e_6a07e803d3e4832dab14de939e456e7f`:
```json
{ "task_id": "task_e_6a07e803d3e4832dab14de939e456e7f",
  "repo": "LT-0I/CN-", "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a",
  "status": "complete", "done": true, "status_text": "Worked for 33s" }
```

`webai:chatgpt:codex:get-diff --profile chatgpt --task-id task_e_6a07e803d3e4832dab14de939e456e7f`:
```json
{ "task_id": "task_e_6a07e803d3e4832dab14de939e456e7f",
  "repo": "LT-0I/CN-", "env_id": "6a07e4ffdafc8191b77e6cff2264cd9a",
  "status": "complete", "files": ["README.md"],
  "diff_text": "README.md +2 -0\n@@ -57,25 +57,27 @@ ... 82 + 83 +<!-- codex-sandbox-probe 2026-05-15 -->",
  "create_pr_available": true }
```

Both return the real done status / real unified diff (README.md, `@@` hunk, the
`codex-sandbox-probe 2026-05-15` line) — no ownership refusal, no fabrication.

## Guard still strict — unit tests

`tests/consumerContract.test.ts`:
- `chatgpt-codex ownership guard waits for SPA hydration before refusing (regression)`
  — mock page returns `visibleText: ""` for the first reads, then the real
  `· LT-0I/CN- ·` header; asserts the guard polls past the empty shell and
  passes (`assertTaskBelongsToAllowlist` → `null`).
- `chatgpt-codex ownership guard still refuses a noeticbraid task page`
  — mock page returns `· LT-0I/noeticbraid ·`; asserts `errorCode === "INVALID_ARGS"`
  and message matches `/forbidden noeticbraid/`.
- Pre-existing `chatgpt-codex task readers use snapshot visibleText ...` (which
  also exercises a noeticbraid `snapshotVisibleText` refusal) still passes.

## Final gate

- `rm -rf dist && npm run build` → exit 0.
- `npm test` → **218 tests, 218 pass, 0 fail** (exit 0; was 216, +2 new tests).
- Contract/count constants unchanged: webai count 37
  (`expectedWebaiToolCount === 37`), codex tools 4 (`codexTools.length === 4`),
  `consumer-contract-1.4.0`, error_codes 32. No `configs/`, `docs/`, or
  contract files touched by this fix.
- Files changed by this fix: `src/mcp/submcp/chatgpt-codex/flow.ts`,
  `tests/consumerContract.test.ts`. No commit made.
