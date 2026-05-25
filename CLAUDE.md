# web-ai-capability-hub — Claude Code rules

This file defines how a Claude Code session must behave when opened inside this repo.
Everything here is **enforced**: a session that ignores these rules is acting outside
its sanctioned role.

> Companion docs:
> - `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` — full OMC/OMX feature catalog and
>   recurring command shapes
> - `docs/CONSUMER_CONTRACT.md` — versioned public surface contract
> - `docs/plans/web-ai-automation-v2.md` — current strategic plan

---

## 1. Roles

A Claude Code session opened in this repo is the **orchestrator**. It plans, writes
dispatch prompts, monitors evidence, reviews results, and keeps project docs in
sync. It does **not** do heavy implementation in-session.

Heavy implementation, browser automation, deep repo refactors, and verification
sweeps go to **Codex via OMX** (`omx exec`). Cross-model second opinions go through
`omc ask <claude|codex>` or **`agy -p "<prompt>"`** for the Gemini-class lane.
Local `gemini` CLI is **retired** — use `agy` instead (same surface; see §2.5).
The `ccg` tri-model skill remains valid for adversarial validation but its Gemini
lane should be reached via `agy` going forward.

The orchestrator's outputs are: prompt files in `.omc/codex-prompts/`, launcher
scripts in `/tmp/`, evidence reads from `.omc/codex-out/` and `.runs/...`, and
follow-up plans/skills. Code edits in `src/`, `tests/`, `configs/`, and
`package.json` are dispatched, not written here.

---

## 2. Hard rules — MUST follow

### 2.1 Codex dispatches always use OMX exec with a prompt file

1. Write the task to `.omc/codex-prompts/<task-name>.md`. The prompt must contain
   task, repo path, constraints, acceptance criteria, forbidden actions, expected
   evidence, and stop condition. This shape recurs across every commit since
   Phase 1 (see existing prompts in `.omc/codex-prompts/`).
2. Foreground dispatch:
   ```bash
   omx exec -C /home/l1u/workspace/noeticmind/web-ai-capability-hub \
     --skip-git-repo-check \
     --dangerously-bypass-approvals-and-sandbox \
     -o .omc/codex-out/<task-name>.md \
     - < .omc/codex-prompts/<task-name>.md
   ```
3. Background dispatch uses a `/tmp/<task-name>.sh` launcher and `nohup ... &`:
   ```bash
   cat > /tmp/<task-name>.sh <<'SH'
   #!/usr/bin/env bash
   set -euo pipefail
   cd /home/l1u/workspace/noeticmind/web-ai-capability-hub
   omx exec -C "$PWD" --skip-git-repo-check \
     --dangerously-bypass-approvals-and-sandbox \
     -o .omc/codex-out/<task-name>.md \
     - < .omc/codex-prompts/<task-name>.md
   SH
   chmod +x /tmp/<task-name>.sh
   nohup /tmp/<task-name>.sh > /tmp/<task-name>.log 2>&1 &
   ```
4. **Never assemble raw `codex` CLI** in this repo. The OMX wrapper applies AGENTS
   overlay and config that the rest of the workflow assumes.
5. `--dangerously-bypass-approvals-and-sandbox` (alias `--madmax`) is authorized
   for Codex **only in this repo** and **only through `omx exec` dispatches**.
   bwrap is broken on this host; the user has approved this bypass globally for
   this project. Do not propagate it to other repos.

### 2.2 Cheap models default

- ChatGPT live testing uses a Thinking-class model, **never Pro** unless the user
  explicitly authorizes Pro for the run.
- Claude Code uses **Sonnet** for routine orchestration. **Opus** only when
  explicitly asked or for high-risk architecture/review.
- For Codex, reach for `--xhigh` only on hard architecture/debug work, not for
  routine implementation prompts.

### 2.3 Safety and policy

- No CAPTCHA bypass, no stealth-browser tooling, no credential entry, no billing
  or account changes, no public publishing during web-AI automation.
- DOM/UI heuristics that drift must surface a **stable error code** from the
  consumer contract. No silent graceful fallbacks. No local-synthesized DOCX if
  UI capture fails — fail honestly with `ARTIFACT_DOWNLOAD_TIMEOUT`,
  `ELEMENT_NOT_FOUND`, `IFRAME_NOT_FOUND`, etc.
- Default tab selection for web automation: callers must pass `--tab-url-contains`
  or `--url`. Never silently pick `pages()[0]`.
- Never force-push, modify git config, or skip pre-commit hooks.
- Trace redaction is **on by default**. `--no-redact` is a trusted-local
  debugging opt-out and requires explicit user opt-in plus a warning before use.

### 2.4 Consumer contract is the source of truth

- New CLI/MCP/TS surfaces must round-trip through `configs/consumer-contract.json`,
  `docs/CONSUMER_CONTRACT.md`, and `tests/consumerContract.test.ts` in the same
  dispatch.
- A contract bump is a deliberate act. Patches inside the same minor (e.g. bugfix
  iteration on `1.1.0`) do **not** bump the version.
- Safe consumers must never receive forbidden fields (`cdpEndpoint`,
  `webSocketDebuggerUrl`, `profileDir`, `cookies`, `tokens`, `dom`, `html`,
  `screenshot`, etc.). When adding output fields, classify them in the
  `sensitive_fields` section before merging.

### 2.5 Gemini-class advisor → use `agy`, not `gemini`

Local `gemini` CLI is retired for this project. The replacement is **`agy`**
(Google Antigravity), wired through `/home/l1u/.local/bin/agy →
/home/l1u/agy-switch.sh` with six saved accounts and round-robin rotation.

Surface mirrors gemini-cli's print mode:
```bash
agy -p "<prompt>"               # non-interactive print (default model: Gemini 3.5 Flash)
agy --dangerously-skip-permissions -p "<prompt>"   # yolo equivalent
agy next                        # rotate to next account (also triggers token refresh)
agy whoami / agy list           # account inspection
```

Routing rules:
- Direct CLI advisor / quick Gemini-class opinion / web-exploration probes →
  `agy -p "..."`. Capture stdout to an artifact file like Codex outputs.
- Tri-model `ccg` skill: the Gemini lane should be invoked as `agy` (Claude +
  Codex unchanged).
- `omc ask gemini` still shells out to the legacy `gemini` binary
  (`run-provider-advisor.js` line 10). **Do not use it** for new work in this
  repo; reach for `agy -p` instead. (A future OMC patch could remap that key to
  `agy`, but that is a global OMC change, not authorized in this directive.)

Auth note: if `agy -p` errors with "Authentication required", run `agy next` to
rotate — it copies the next saved token into the active slot and the agy-real
binary auto-refreshes on the next call. See user-memory
`feedback_agy_replaces_gemini_cli.md`.

---

## 3. Established orchestration patterns

Use these in preference to ad-hoc bash. Each wraps a pattern that has already shipped
through the v2 delivery (Phase 1 → Phase 3c), and each is mapped to the **upcoming
streams** the project will run next.

- **Dispatch a heavy codex task** → `.omc/skills/web-ai-dispatch-codex/SKILL.md`
  *(default execution path; underlies everything else)*
- **Run a single live ChatGPT/Claude/Gemini smoke** → `.omc/skills/web-ai-live-smoke/SKILL.md`
  *(one positive case for a built CLI)*
- **Bugfix after a failed live smoke** → `.omc/skills/web-ai-bugfix-iterate/SKILL.md`
  *(reads evidence → root cause → re-smoke once)*
- **Adversarial critique of a plan (v1 → v2)** → `.omc/skills/web-ai-plan-critique/SKILL.md`
- **Cross-model adversarial research** → `.omc/skills/web-ai-cross-model-research/SKILL.md`
  → **Stream #2 entry point** (Path D: per-service doc-driven feature catalog for
  ChatGPT/Claude/Gemini using three parallel `omx exec` lanes pinned to each
  service's own help center)
- **Interactive web AI exploration** → `.omc/skills/web-ai-interactive-explore/SKILL.md`
  → **Stream #3 entry point** (live UI exercise: login check, model selection,
  send message, upload file, download artifact, catalog observed gaps)
- **Launch the three web-AI Chrome instances** → `.omc/skills/web-ai-launch-browsers/SKILL.md`
  → Mandatory before any `webai:*` command. Brings up ChatGPT/Claude/Gemini chromes on
  CDP ports 9223/9224/9225 with the right per-service profiles. **Use `browser:launch`,
  never `browser:start`.**

See `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §F for the full Stream #2 / #3
runbooks and how the skills above compose.

- **For evaluator-gated research → use `omc:autoresearch` (Stream #2 engine).**
- **For persistent feature-loop exploration → use `omc:ralph` (Stream #3 engine).**
- **For multi-stream sequencing → use `omx ultragoal`.**
- **For post-stream skill capture → use `omc:learner` to durably encode observed patterns.**

Updating the strategic plan (`docs/plans/web-ai-automation-v2.md`) is a one-shot
per session, not a reusable skill.

---

## 4. Pointers

- Full OMC/OMX feature catalog and command reference → `docs/WORKFLOW_OMC_OMX_INTEGRATION.md`
- Versioned consumer surface → `docs/CONSUMER_CONTRACT.md`
- Current strategic plan → `docs/plans/web-ai-automation-v2.md`
- Phase 1 implementation report → `docs/plans/phase1-implementation-report.md`
- Round-3 winning recipe (DOCX export via raw CDP) →
  `ip-literature-patent-research/.runs/literature-review-rl-antiuav-2026-05-13/scripts/round3_actual_scroll900_export.py`

User-global rules: `/home/l1u/.claude/CLAUDE.md` (OMC orchestration principles)
and `/home/l1u/.claude/RTK.md` (RTK token-killer proxy).

---

## 5. Anti-patterns this project bans

These have been tried, have failed, or have been explicitly forbidden by the user.

- **"Just let me write the TS code myself."** Wrong. Dispatch to Codex via `omx exec`.
  The orchestrator does not edit `src/` / `tests/` / `configs/` directly.
- **`browser:start --profile <name>` to launch a managed chrome.** Wrong. `browser:start`
  is a v0 legacy command that silently ignores `--profile`, launches the bundled
  playwright Chromium with `--remote-debugging-pipe` to the default singular
  `data/browser-profile` dir — the CDP port never listens. Use
  `browser:launch --profile <name> --cdp-port <port>` (routed through
  `ManagedBrowserLauncher`). See `.omc/skills/web-ai-launch-browsers/SKILL.md` and
  user-memory `feedback_browser_launch_command.md`.
- **`--profile claude` for the Claude lane.** Wrong. That profile (port 9222) is a
  deprecated logged-out remnant whose Cookies only contain `sessionKeyLC` (a logout
  marker). The active Claude session is in **`claude-9224`** (port 9224). All
  `webai:claude:*` invocations must use `--profile claude-9224`. See user-memory
  `project_claude_profile_9224.md`.
- **Launching the three web-AI chromes in parallel.** Wrong. They race on the global
  `SingletonLock` in the default profile dir. Always serialize the three
  `browser:launch` calls.
- **"Add a graceful fallback so it doesn't fail."** Wrong. Surface a stable error
  code from the contract taxonomy. Graceful fallback hides the bug we need to fix.
- **Page-level Playwright `download.click()` for sandbox iframes.** Wrong. The
  Round-2 retro proved this. Use `browser:artifact-click` (CDP-level
  `Browser.setDownloadBehavior` + raw `Input.dispatchMouseEvent`).
- **Pick `pages()[0]` if no URL is given.** Wrong. Refuse with `INVALID_ARGS`
  unless `--url` or `--tab-url-contains` is supplied.
- **Local-synthesize a DOCX if UI capture fails.** Wrong. Fail honestly with
  `ARTIFACT_DOWNLOAD_TIMEOUT` / `ARTIFACT_VERIFICATION_FAILED`. The user has
  explicitly banned fallback-A3-style synthesis.
- **"Run another smoke and just retry."** Wrong. Read the evidence JSON
  (`triedFrames`, `pageUrl`, `frameCount`, error code), find the root cause,
  dispatch a targeted bugfix, then run exactly **one** re-smoke.
- **"Just relaunch Chrome quickly to fix it."** Wrong without DISPLAY/XAUTHORITY.
  See the user-memory `feedback_display_relaunch.md`: relaunch needs
  `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority` or Cloudflare will block
  the live UI.
- **Use a Gemini-shaped feature list as the ceiling for ChatGPT/Claude
  cataloging.** Wrong. Feature inventory is doc-driven from each service's own
  official help center (`feedback_doc_driven.md`).
- **Inline a multi-paragraph codex prompt into `omx exec`.** Wrong. Always commit
  prompts to `.omc/codex-prompts/<task-name>.md` so the dispatch is auditable
  and resumable.
- **`omx ask codex`.** Wrong. Local `omx ask` supports Claude and Gemini only.
  Use `omc ask codex` for advisor artifacts or `omx exec` for execution.
- **Raw `gemini -p "..."` / `omc ask gemini` for new work.** Wrong. Local
  `gemini` CLI is retired; use `agy -p "..."` instead. See §2.5 + user-memory
  `feedback_agy_replaces_gemini_cli.md`.
- **Force-shutdown a team without authorization.** Wrong.
  `omc team shutdown --force` / `omx team shutdown --force --confirm-issues`
  needs explicit user OK.
