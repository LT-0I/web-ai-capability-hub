---
name: web-ai-interactive-explore
description: Systematically exercise the live web UI of one of ChatGPT, Claude, or Gemini — login check, model selection, send-message, file upload, artifact download — and catalog what actually works. Use for Stream #3 (interactive web AI exploration), not for single-positive smokes. One service per dispatch.
---

# Interactive web AI exploration (Stream #3)

This skill drives Codex (via `omx exec`) through the live web UI of a single
service, exercising the real interaction surface the project wants to
automate later: login state, model selection (cheap-default), send a test
message, upload a file, download an AI-generated artifact, record what each
feature actually looks like in the DOM and event log.

Distinct from `web-ai-live-smoke` (one positive case for a built CLI) and
from `web-ai-cross-model-research` (doc-driven catalog, no live UI). This
is the loop that turns help-center claims into observed behaviour.

## When to use

- Stream #3: the user has said "重新进行 web 端各类 ai 功能的探索" or similar.
- Codex has shipped a `browser:*` primitive but the project hasn't yet driven
  it end-to-end against a new service / new feature.
- A doc-driven catalog (see `web-ai-cross-model-research`) flagged a feature
  and we need to verify it interactively.

## When NOT to use

- The task is "ship one positive run of a known feature" → use
  `web-ai-live-smoke`.
- The task is "catalog features from the help center" → use
  `web-ai-cross-model-research`.
- The user has not granted live-UI authorization for this service this
  session.
- The model selection would force ChatGPT Pro consumption — refuse and ask.

## Hard rules

- **One service per dispatch.** Don't ChatGPT-and-Claude-and-Gemini in the
  same Codex run; cross-service prompts produce mush.
- **Cheap model default.** ChatGPT testing uses a Thinking-class model,
  **never Pro** unless the user explicitly authorizes Pro for this run.
  Claude and Gemini use the cheapest available chat-tier; do not select
  paid-tier models.
- **Login check before anything else.** If `curl
  http://127.0.0.1:9223/json` does not show a tab logged into the target
  service, stop and hand back to the user for relogin. ChatGPT is currently
  logged in; Claude and Gemini may need fresh login. Do not enter credentials
  from automation.
- **No CAPTCHA bypass, no stealth tooling, no account changes, no
  billing-page interaction, no public publishing.**
- **No silent fallbacks.** A feature that doesn't work surfaces a stable
  error code (`ELEMENT_NOT_FOUND`, `IFRAME_NOT_FOUND`, `MODE_UNCERTAIN`,
  `HUMAN_HANDOFF_REQUIRED`) and the observation is recorded as "feature X is
  not currently reachable via the automation surface", not faked.
- **No commits inside the explore run.** The orchestrator commits after
  reviewing the deliverable.

## Required variables

```bash
REPO_DIR=/home/l1u/workspace/noeticmind/web-ai-capability-hub
SERVICE=chatgpt                       # or claude / gemini — one per dispatch
EXPLORE_NAME=stream3-chatgpt-explore-round1
PROMPT_FILE="$REPO_DIR/.omc/codex-prompts/$EXPLORE_NAME.md"
OUT_FILE="$REPO_DIR/.omc/codex-out/$EXPLORE_NAME.md"
RUN_DIR="$REPO_DIR/.runs/web-ai-explore/$EXPLORE_NAME"
LOG_FILE="/tmp/$EXPLORE_NAME.log"
LAUNCHER="/tmp/$EXPLORE_NAME.sh"
```

## Pre-conditions to verify (the orchestrator checks before dispatch)

1. Chrome alive on CDP 9223:
   ```bash
   curl -s http://127.0.0.1:9223/json/version | head -1
   ```
2. Service tab present and authenticated:
   ```bash
   curl -s http://127.0.0.1:9223/json \
     | python3 -c "import json,sys; \
print([t['url'] for t in json.load(sys.stdin) if t.get('type')=='page' and '<service-host>' in t.get('url','')])"
   ```
   - ChatGPT: expect `chatgpt.com/...`. Logged in confirmed by user.
   - Claude: expect `claude.ai/...`. Login state unknown — if missing the
     post-login redirect, **stop and hand back to user**.
   - Gemini: expect `gemini.google.com/...`. Same handoff rule.
3. Build present: `ls dist/src/cli.js`. If absent, dispatch a build via
   `web-ai-dispatch-codex` first.

## Prompt-file shape

The Codex prompt **must** include every section below:

1. **You are a fresh Codex session.** Read fully before acting.
2. **Service + authorized scope.** `$SERVICE`; explicit list of features to
   probe (Section 3); explicit list of features OUT of scope (account
   settings, billing, anything destructive, anything writing back to other
   users).
3. **Features to probe — ordered.** Each feature gets:
   - **Observation steps** (what to do in the UI via `browser:*` primitives).
   - **Expected evidence** (DOM selectors found, frame count, download path,
     error code if any).
   - **Stop criterion** (PASS / NOT-REACHABLE / INCONCLUSIVE — never SKIP).

   Canonical Stream-#3 feature ladder for each service:
   1. Identify currently logged-in account + active model (read header).
   2. Switch model to the cheapest Thinking-class model. If unavailable,
      record and continue.
   3. Open a new conversation (or named test conversation).
   4. Send a short test prompt (`"<service> — automation smoke test
      <date>"`).
   5. Wait for the response; capture the first 500 chars.
   6. Upload a small text file (the project ships `data/test-fixtures/
      smoke-text.txt`). Confirm upload acknowledgement.
   7. If the service produces a downloadable artifact (DOCX / PPTX / image /
      code), trigger that and capture it via `browser:artifact-click`.
   8. Locate and read the conversation export / share menu (do **not**
      actually publish anywhere).
   9. Inventory any feature surfaces the official help center promised but
      the UI doesn't currently expose to this account.
4. **Required reading.** Absolute paths to:
   - `CLAUDE.md`
   - `docs/CONSUMER_CONTRACT.md`
   - `.omc/skills/web-ai-live-smoke/SKILL.md`
   - `.omc/skills/web-ai-dispatch-codex/SKILL.md`
   - Existing `docs/research/<service>-feature-catalog.md` from Stream #2 if
     present.
5. **Tooling allowed.** `node dist/src/cli.js browser:* | capability:*` only,
   plus `curl http://127.0.0.1:9223/json`. No sidecar scripts.
6. **Evidence to write.** All per-feature outputs land in
   `$RUN_DIR/<feature-id>/` with:
   - `stdout.json` and `stderr.txt` from each CLI call,
   - any downloaded artifact,
   - a per-feature note describing PASS / NOT-REACHABLE / INCONCLUSIVE plus
     the user-visible observation.
7. **Final deliverable.** `$RUN_DIR/explore-report.md` summarizing each
   feature row with status, evidence path, and any selector that drifted vs
   the help-center description.
8. **Anti-slop.** No invented features; no graceful fallbacks; no DOM
   screenshots committed (use evidence JSON); no public publishing; no
   credentials.
9. **Time budget.** Typically 60-90 min for one service.

## Dispatch + ralph loop

Dispatch each service as a persistent `omc:ralph` / `omx ralph` loop, not as a
single-shot background `omx exec`. Each canonical feature is one ralph sub-goal;
the loop exits only when every feature row is PASS / NOT-REACHABLE /
INCONCLUSIVE (never SKIP).

```bash
mkdir -p "$REPO_DIR/.omc/codex-out" "$RUN_DIR"
omx ralph --prd "Stream #3 $SERVICE exploration: execute the 9-feature ladder serially against the existing CDP Chrome profile, write $RUN_DIR/explore-report.md, and stop only when every feature row is PASS / NOT-REACHABLE / INCONCLUSIVE with evidence."
```

PTY requirement: `omx ralph` needs a real terminal. Do not wrap it in blind
`nohup`; use the attached tmux/runtime pane or an OMX team pane. If ralph
stalls, inspect `.omx/` progress, `omx hud --json`, the per-feature evidence
folders, and `omx state read --input '{"mode":"ralph"}' --json`; resume or
inject the next feature-specific instruction instead of starting a second run
against the same service.

Visual verification: for visual outputs (charts, canvas, generated images,
screenshots), run `omc:visual-verdict` against the generated screenshot and
reference/expected description after the DOM/artifact capture. DOM evidence is
still required; visual-verdict decides whether the visual observation is good
enough to mark PASS.

After ralph completes for a service, run `omc:learner` (or its current
`skillify` alias) to capture observed selector, model-tier, and artifact
patterns into project skills automatically, then update memory/wiki as needed.

Monitoring: use `omx hud --json`, `omx state`, and the run directory; see
`docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §B.8 and §F.2.

## Stop signal

- `$RUN_DIR/explore-report.md` exists, summarises every probed feature with
  PASS / NOT-REACHABLE / INCONCLUSIVE.
- Each NOT-REACHABLE row has a stable error code from the contract.
- Each PASS row has evidence (download path, response text, or DOM snapshot
  JSON) under `$RUN_DIR/<feature-id>/`.
- The exported model name matches the cheap-default rule (no Pro for
  ChatGPT).

## Failure modes

- **Not logged in.** The orchestrator should have caught this in
  pre-conditions; if Codex hits it mid-run, it must record
  `HUMAN_HANDOFF_REQUIRED` and stop — do not attempt automated login.
- **Model selector picks Pro.** Codex must record this and abort the run;
  retry only after the user explicitly authorizes Pro consumption.
- **Service serves a Cloudflare interstitial.** Mark INCONCLUSIVE, relaunch
  Chrome with explicit DISPLAY/XAUTHORITY (see CLAUDE.md anti-pattern), and
  re-dispatch — do not patch TS code based on a Cloudflare interruption.
- **Feature exists in the help center but is hidden in the UI for this
  account.** Record NOT-REACHABLE with a quoted help-center URL and the
  exact DOM evidence; this is a real catalog gap, not a bug.

## Recurring application across services

For Stream #3 as a whole, the orchestrator dispatches this skill **three
times serially** (not in parallel — live UI contention on a single managed
Chrome would corrupt evidence):

1. `chatgpt` → Thinking-class model.
2. `claude` → free / cheapest available; relogin first if needed.
3. `gemini` → free / cheapest available; relogin first if needed.

After all three reports exist, the orchestrator writes
`docs/research/stream3-exploration-summary.md` that diffs each service's
report against its Stream #2 doc-driven catalog and highlights the gaps.

## References

- `.omc/skills/web-ai-dispatch-codex/SKILL.md` — underlying dispatch.
- `.omc/skills/web-ai-live-smoke/SKILL.md` — single-positive case shape;
  this skill is the iterated/exploratory cousin.
- `.omc/skills/web-ai-cross-model-research/SKILL.md` — Stream #2 doc-driven
  side; feeds into Stream #3 as required reading.
- `.omc/skills/web-ai-bugfix-iterate/SKILL.md` — for selector drift surfaced
  by NOT-REACHABLE rows that turn out to be tooling bugs.
- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.2, §B.8, §F.2 — Stream #3 ralph, visual-verdict, learner, and monitoring mapping.
- `docs/CONSUMER_CONTRACT.md` — error code taxonomy used by NOT-REACHABLE
  rows.
