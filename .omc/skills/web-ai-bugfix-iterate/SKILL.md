---
name: web-ai-bugfix-iterate
description: After a failed live smoke (web-ai-live-smoke), read evidence, find root cause, dispatch a targeted bugfix prompt to Codex, then run exactly ONE re-smoke. Never chain smokes blindly. Use whenever a smoke report shows FAIL with a stable error code.
---

# Bugfix iteration after a failed live smoke

A failed smoke is data, not a request for another attempt. This skill
encodes the read-evidence → root-cause → targeted-bugfix → one-re-smoke
loop that shipped through `phase1-bugfix-page-selection.md` →
`phase1-bugfix2-scroll.md` → `phase1-bugfix3-menu-discovery.md`.

## When to use

- The latest smoke report shows FAIL with a stable error code from the
  consumer contract taxonomy (`ELEMENT_NOT_FOUND`, `IFRAME_NOT_FOUND`,
  `ARTIFACT_DOWNLOAD_TIMEOUT`, `ELEMENT_OUT_OF_VIEWPORT`,
  `ARTIFACT_VERIFICATION_FAILED`, `POSTCONDITION_TIMEOUT`).
- The evidence JSON includes actionable fields (`pageUrl`, `frameCount`,
  `triedFrames`, bbox).
- The fix scope is bounded — a single file or a small contract patch.

## When NOT to use

- Smoke marked INCONCLUSIVE (environmental). Fix the environment first
  (Chrome relaunch with DISPLAY, network, profile state), then re-smoke.
- Failure has no stable error code → the smoke itself is broken; fix the
  smoke harness via `web-ai-dispatch-codex` instead.
- Fix scope crosses the consumer contract minor — that needs a deliberate
  contract-bump dispatch, not a bugfix iteration.
- Already on the third bugfix iteration without progress → escalate. Stop
  and ask the user before dispatching again.

## Read evidence first

From the latest smoke report:

1. **Error code** — pin the root cause to one row in the contract taxonomy.
2. **`pageUrl`** — was the right tab selected? Common Phase-1 bug:
   `pages()[0]` was `chatgpt.com/` not the conversation.
3. **`frameCount`** — was the iframe present at all? Round-3 sandbox iframes
   load late; `--prerender-wait-ms` or `--locate-timeout-ms` may be too
   low.
4. **`triedFrames`** — did any candidate match the selector?
   `hadFrameTextFilterMatch` tells you if the text filter excluded
   everything.
5. **`bbox`** — was the candidate in viewport? `y > 1000` means a scroll
   recipe is needed.
6. **`elapsedMs`** — did it time out before the click, between clicks, or
   on the download wait?

## Write a targeted bugfix prompt

The prompt **must** include:

1. **Bug** — quote the failing file and line, the evidence JSON, the smoke
   report path.
2. **Fix** — labeled changes (Change A / B / C…), each scoped to a single
   file or surface. Example from `phase1-bugfix-page-selection.md`:
   - Change A: page selection by URL match
   - Change B: `findCandidate` retry on transient iframe absence
   - Change C: surface frame count + page url in error evidence
3. **Tests to add / update** — concrete vitest cases that would have caught
   the bug.
4. **Acceptance** — `npm run build` clean, `npm test` all green, doc
   touched (e.g. `docs/PRIMITIVE_ARTIFACT_CLICK.md`), implementation report
   gets a "Bugfix iteration" subsection.
5. **Out of scope** — usually "don't bump the contract", "don't refactor
   postconditions", "don't add a Python sidecar to TS code", "don't add
   local-synthesis fallbacks".
6. **Anti-slop** — no fallback layers, no scope creep, no commits.
7. **Time budget** + `GO.`

Save to `.omc/codex-prompts/<task>-bugfix<N>-<what>.md`.

## Dispatch

Use `web-ai-dispatch-codex`:

```bash
PROMPT_FILE=.omc/codex-prompts/phase1-bugfix3-menu-discovery.md
OUT_FILE=.omc/codex-out/phase1-bugfix3-menu-discovery.md

omx exec -C /home/l1u/workspace/noeticmind/web-ai-capability-hub \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o "$OUT_FILE" \
  - < "$PROMPT_FILE"
```

## Re-smoke — exactly once

After build + tests are green inside the bugfix dispatch, run **one**
re-smoke via `web-ai-live-smoke`. Use a fresh `SMOKE_NAME` suffix
(`-resmoke`, `-resmoke2`, etc.) so download artifacts don't clobber prior
runs.

If the re-smoke passes: stop. Hand back to the orchestrator for review +
commit decision.

If the re-smoke fails:
- Re-read evidence. If it's the **same** error code, the fix was wrong —
  do **not** dispatch a third bugfix without explicit user OK.
- If it's a **new** error code, that's progress; one more iteration is
  fine.
- Never chain a third smoke without a fresh root-cause read.

## Failure modes

- **"Just retry the smoke."** Banned. Read the evidence first.
- **Bugfix prompt drifts into refactor.** Split into a separate dispatch.
- **Bugfix bumps the consumer contract by accident.** Re-dispatch with
  explicit "do not change `contract_version`".
- **Re-smoke uses the same `SMOKE_NAME`** → output overwrites the prior
  report. Use a `-resmokeN` suffix.

## Engine hooks

- Use `omc:trace` with the `tracer` agent when evidence supports multiple plausible root causes.
- If the bugfix becomes iterative-until-done, switch to `omc:ralph` / `omx ralph` rather than chaining ad-hoc dispatches.

## References

- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §C.5
- `docs/CONSUMER_CONTRACT.md` §Error code taxonomy
- `.omc/codex-prompts/phase1-bugfix-page-selection.md`
- `.omc/codex-prompts/phase1-bugfix2-scroll.md`
- `.omc/codex-prompts/phase1-bugfix3-menu-discovery.md`
- `.omc/skills/web-ai-dispatch-codex/SKILL.md`
- `.omc/skills/web-ai-live-smoke/SKILL.md`
- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.8, §F, §G — OMC/OMX engines, monitoring, and MCP hooks.
