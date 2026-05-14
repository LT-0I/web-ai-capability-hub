# OMC / OMX integration — feature catalog and recurring patterns for this project

This is the working reference for any Claude or Codex session inside this repo. It
maps the OMC (`oh-my-claudecode`) and OMX (`oh-my-codex`) feature surface to the
recurring tasks this project produces, with verbatim command shapes.

`CLAUDE.md` at the repo root holds the hard rules. This doc is the longer
catalog you reach for when those rules say "use the right tool".

> Validation legend (inherited from `call-codex-via-omx`):
> - **verified** — locally smoke-tested end-to-end in this project or its
>   companion test repos.
> - **help-verified** — present in local CLI help but not freshly launched in
>   this revision; check before relying on exact flag names.
> - **handoff-verified** — produced durable handoff/state but does not itself
>   complete the AI work.

---

## A. OMC (`oh-my-claudecode`)

OMC is the Claude Code orchestration layer. In this repo it is the engine the
*orchestrator session* runs inside.

### A.1 Install

- Binary: `/home/l1u/.nvm/versions/node/v24.14.0/bin/omc`
- Plugin/skills: `/home/l1u/.claude/plugins/oh-my-claudecode/` plus
  `/home/l1u/.claude/skills/` (user-scope skills) and `.omc/skills/` (per-repo
  skills — see this project's `.omc/skills/web-ai-*`).
- Marketplace source: `/home/l1u/.claude/plugins/marketplaces/omc/`
- Versions: `omc version` (CLI), `omc info` (system + agents + skills),
  `/home/l1u/.claude/.omc-version.json`.

### A.2 CLI commands relevant here

| Command | Shape | Use it for |
| --- | --- | --- |
| `omc ask <claude\|codex\|gemini>` | `omc ask codex --prompt "..."` or `--agent-prompt critic --prompt "..."` | Advisor artifact written to `.omc/artifacts/ask/`. Cheaper than a full `omx exec`. **verified** for codex; Claude `--agent-prompt` has caveats (see §A.6). |
| `omc team N:<role>` | `omc team 2:codex "task"` | Spawn parallel Codex workers in tmux panes; parse `Team started: ...` from launch stdout, then drive via `omc team status` and `omc team api ...`. **verified**. |
| `omc team status / shutdown / api` | `omc team status <team-name> --json`, `omc team shutdown <name>` | Drive existing teams. Forced shutdown (`--force`) needs human OK. |
| `omc info` | `omc info` | List available agents and enabled features (parallel exec, LSP, AST, etc.). |
| `omc launch [--agent <role>] -p` | `omc launch --agent code-reviewer -p "review HEAD"` | Role-shaped Claude run when `omc ask claude --agent-prompt` would mis-pass frontmatter. |
| `omc setup` | `omc setup --force` | Resync OMC hooks/agents/skills after an update. |
| `omc update` | `omc update --check` | Bump OMC version. Use `--standalone` if running under a plugin context. |
| `omc doctor` | `omc doctor` | Diagnose missing hooks/components after an update or fresh checkout. |
| `omc teleport <ref>` | `omc teleport '#123'` | Create a git worktree for isolated work (this session is running inside one). |
| `omc session search "..."` | search prior local sessions | When recovering "what did I do three days ago"; supports `--since 7d --json`. |
| `omc hud --json` | `omc hud --json` | Statusline / mission-board snapshot — see §A.7 for usage during background dispatch. |

Forbidden in this repo:
- `omx ask codex` — does not exist locally. Use `omc ask codex` instead.

Less heavily used but documented for completeness: `omc interop` (split-pane
Claude+Codex), `omc info`, `omc test-prompt`, `omc config --paths`,
`omc autoresearch`, `omc ralphthon`, `omc mission-board`. Run `omc <cmd> --help`
before using.

### A.3 Agents (via the Agent tool, `subagent_type`)

These are the OMC subagents most useful when planning, reviewing, or asking
questions inside the Claude orchestrator session. They are read-only or
analysis-shaped — heavy implementation still routes to Codex via OMX.

| Agent | Best for | Cost |
| --- | --- | --- |
| `explore` | Fast codebase exploration, finding files/patterns/implementations. Internal codebase only. | sonnet (default), haiku for quick lookups |
| `document-specialist` | External docs, repo docs, official SDK/API docs, OSS examples, academic refs. Reach for this before guessing. | sonnet |
| `planner` | Strategic planning consultant — interviews and produces a work plan; never implements. | sonnet |
| `analyst` | Pre-planning risk and hidden-requirement consultant. | sonnet |
| `architect` | High-IQ deep architecture / debugging reasoning. Read-only. | opus |
| `critic` | Validate a work plan against rigor/clarity/completeness criteria. | sonnet |
| `executor` | Focused task executor (when used). For this repo we prefer **codex executor via `omx exec`**, not Claude executor, because Claude in this session is the orchestrator. | opus for complex, sonnet routine |
| `code-reviewer` | Comprehensive code-quality review pass. Separate lane from authoring. | opus |
| `security-reviewer` | OWASP / vuln review. | sonnet |
| `verifier` | Completion-evidence and claim validation. Use as a separate lane after authoring. | sonnet |
| `debugger` | Root-cause analysis, regression isolation. | sonnet |
| `tracer` | Evidence-driven causal tracing with competing hypotheses. | sonnet |
| `test-engineer` | Test strategy, coverage, flaky-test hardening. | sonnet |
| `designer` | Visual / UI / UX changes (rare here). | sonnet |
| `writer` | Technical writing — README, API docs, architecture docs, user guides. | sonnet |
| `qa-tester` | Interactive CLI testing via tmux. Useful when verifying `node dist/src/cli.js …` flows. | sonnet |
| `scientist` | EDA / stats with Python (pandas/numpy/scipy). | sonnet |
| `git-master` | Atomic commits, rebase, history hygiene with style detection. | sonnet |
| `code-simplifier` | Simplify / refine for clarity and maintainability. | opus |

Routing rule of thumb for this project: prefer `document-specialist` over guessing
API shapes; prefer `omx exec` over Claude `executor` for implementation; always
keep authoring and review in separate lanes (writer → verifier or code-reviewer,
never self-approve).

### A.4 Plugin skills (Claude-side `/oh-my-claudecode:<name>`)

Skills grouped by family — invoke from a Claude session.

| Family | Skills | One-liner |
| --- | --- | --- |
| Orchestration | `autoresearch` | Stream #2 catalog engine when each service lane has an evaluator gate for required row shape and URL citations. |
| Orchestration | `ultrawork` | Stream #2 high-throughput alternative when three stay-in-lane catalogs should run as supervised parallel work instead of raw launchers. |
| Orchestration | `ralph` | Stream #3 per-service feature ladder when each feature is a subgoal that must loop until PASS / NOT-REACHABLE / INCONCLUSIVE. |
| Orchestration | `team`, `omc-teams` | Tmux-supervised Codex/Claude worker lanes for catalog splits or critic follow-ups; parse the launched team name before status calls. |
| Orchestration | `autopilot`, `ultraqa`, `sciomc`, `self-improve` | Broader autonomous/QA surfaces; use only when the stream asks for their full lifecycle. |
| Planning / interview | `plan`, `ralplan`, `deep-interview`, `deep-dive`, `external-context` | Clarify scope, plan, or gather external docs before stream execution. |
| Quality / review | `visual-verdict` | Stream #3 visual-output QA when DOM evidence cannot prove an image/canvas/screenshot matches the expected UI result. |
| Quality / review | `verify`, `ai-slop-cleaner` | Verification and cleanup; keep author/reviewer lanes separate. |
| Debug / tracing | `trace` | Bugfix alternative when smoke evidence needs a hypothesis-gated tracer pass before a patch prompt. |
| Debug / tracing | `hud`, `omc-doctor`, `configure-notifications` | Diagnose runtime and observe state. |
| Memory / docs | `learner` | After each accepted Stream #3 service, extract hard-won automation patterns into project skills. |
| Memory / docs | `remember` | During streams, decide whether findings belong in memory, notepad, docs, or the wiki instead of chat history. |
| Memory / docs | `wiki` | Long-form home for durable catalogs, stream summaries, and cross-references under `.omc/wiki/`. |
| Memory / docs | `writer-memory`, `skillify`, `skill`, `omc-reference` | Capture knowledge or make skills when learner is not the right workflow. |
| Setup / release | `setup`, `omc-setup`, `mcp-setup`, `project-session-manager`, `release`, `cancel` | Setup, lifecycle, cancellation. |
| Specialist | `critic` agent | Attack each Stream #2 catalog before acceptance; use `omc ask codex --agent-prompt critic` for a cheap Codex-shaped critique. |
| Specialist | `ask`, `ccg` | Advisor routing and tri-model Claude/Codex/Gemini critique; use `ccg` for bounded cross-model synthesis after catalogs exist. |

User-scope non-plugin skills under `/home/l1u/.claude/skills/`:
`call-codex-via-omx` (ground truth Codex/OMX bridge), `skill-creator` (create/edit
skills). Project-local skills live under `.omc/skills/web-ai-*/`.

### A.5 Hooks

OMC injects `<system-reminder>` tags around Bash/Read/Write/etc. tool calls
(`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`,
`PreCompact`). Key patterns seen in this session:

- `hook success: Success` → proceed.
- `[MAGIC KEYWORD: ...]` → invoke the matching skill.
- `The boulder never stops` → ralph/ultrawork is active.
- `[SLOP WARNING] ...` → review the tool input for ad-hoc fallback/workaround
  language; respond with explicit justification when intended.

Persistence:
- `<remember>` → 7-day memory.
- `<remember priority>` → permanent memory.

Kill switches: `DISABLE_OMC=1`, `OMC_SKIP_HOOKS=<comma-separated>`.

Hook source: `/home/l1u/.claude/plugins/marketplaces/omc/src/hooks`. Debug with
`omc doctor` and `omc doctor conflicts`.

### A.6 Known caveats

- `omc ask claude --agent-prompt <role>` may fail because the role prompt
  frontmatter is passed as an option. Use `omc launch --agent <role> -p`
  instead.
- `omc team` / `omx team` do not expose a verified `team list` or `--name`
  surface; **parse `Team started: ...` from launch stdout** before status or
  shutdown commands.
- Fresh Codex worker panes may stop at the repo trust prompt. The team can stay
  `pending`. Operator must accept the prompt in the pane.
- `omc help` cannot run inside an active Claude session; use source/help
  inventory or `omc info`.

### A.7 Resources / state

- Per-session state: `.omc/state/`, `.omc/state/sessions/{sessionId}/`
- Notepad: `.omc/notepad.md`
- Project memory (this repo): `.omc/project-memory.json`
- Plans: `.omc/plans/`
- Research / dispatch artifacts: `.omc/research/`, `.omc/codex-out/`,
  `.omc/codex-prompts/`
- Advisor artifacts: `.omc/artifacts/ask/`
- Logs: `.omc/logs/`
- Skills (per-repo): `.omc/skills/`
- Auto-memory (user-scope): `/home/l1u/.claude/projects/<repo-slug>/memory/MEMORY.md`

---

## B. OMX (`oh-my-codex`)

OMX is the Codex orchestration layer. In this repo OMX is how the orchestrator
*executes anything substantial*.

### B.1 Install

- Binary: `/home/l1u/.local/bin/omx`
- Global package: `/home/l1u/.nvm/versions/node/v24.14.0/lib/node_modules/oh-my-codex`
- Routing reference: `/home/l1u/.claude/skills/call-codex-via-omx/`
- Versions: `omx version`. Update via `omx update`.

### B.2 Subcommands relevant here

| Subcommand | Shape | Use it for | Status |
| --- | --- | --- | --- |
| `omx exec` | `omx exec -C <repo> --skip-git-repo-check -o <out> - < <prompt>` | One-shot non-interactive Codex run with AGENTS overlay. **The primary surface for this project.** | verified |
| `omx exec review` | `omx exec review --base main - < <prompt>` | Code review against uncommitted/base/commit. | help-verified |
| `omx exec inject <session-id>` | inject prompt mid-run | Send audited follow-up instructions into a running `omx exec`. | help-verified |
| `omx team N:<role> "task"` | `omx team 2:executor "task"` | Spawn parallel Codex workers in dedicated worktrees with tmux panes + inbox state. | verified |
| `omx team status / await / api` | `omx team status <name> --json`, `omx team api read-events --input '{"team_name":"..."}' --json` | Read-only inspection of running teams. | verified |
| `omx ralph` | `omx ralph --prd "task"` | Self-referential loop until task completion with persistence under `.omx/ralph/`. PTY required. | runtime-start verified |
| `omx ultragoal` | `omx ultragoal create-goals --brief-file <prompt>` | Durable multi-goal handoff. Doesn't itself execute the goal; produces handoff for an active Codex session. | handoff-verified |
| `omx ask <claude\|gemini>` | `omx ask gemini --prompt "..."` | Local advisor for Claude/Gemini. **Do not use `omx ask codex`** — that path is wrong locally. | verified |
| `omx setup` | `omx setup` | Install skills/prompts/AGENTS overlay. | verified |
| `omx doctor` / `omx doctor --team` | health check | Diagnose install / team runtime. | verified |
| `omx status` / `omx hud` | live state snapshot | What is currently running — see §B.8. | verified |
| `omx session search "..."` | session transcript search | Recover what an earlier Codex session said. | verified |
| `omx cleanup` | kill orphan MCPs + stale `/tmp` dirs | Hygiene after crashed runs. | verified |
| `omx cancel` | end active modes (ralph/ultragoal/team) | Stop the boulder. | verified |
| `omx explore` | read-only repo exploration (sparkshell-backed where possible) | Cheap structural questions. | help-verified |
| `omx sparkshell <argv>` | direct argv execution; no pipes/redirects | Quick tool invocations. | help-verified |

Less-used surfaces (documented for completeness; consult `omx <cmd> --help`):
`omx adapt`, `omx resume`, `omx agents-init`/`agents`/`deepinit`,
`omx performance-goal`, `omx autoresearch-goal`, `omx tmux-hook`/`hooks`,
`omx state`, `omx notepad`/`project-memory`/`trace`/`code-intel`/`wiki`,
`omx mcp-serve`, `omx reasoning`, `omx question`, `omx imagegen`.

#### B.2.1 `omx ultragoal` for Streams #2 + #3

Use this when the orchestrator wants one durable goal tree instead of two
manual sequences. Put the Stream #2 catalog mission, the three service lanes,
the Stream #2 critique/learner gates, and the Stream #3 serial exploration
ladder into a brief file, then create the ledger:

```bash
omx ultragoal create-goals --brief-file .omc/codex-prompts/streams-2-3-brief.md --json
omx ultragoal status --json
```

`ultragoal` writes `.omx/ultragoal/brief.md`, `goals.json`, and
`ledger.jsonl`; it does not replace `omc:autoresearch`, `omc:ultrawork`, or
`omx ralph` as the execution engine for individual lanes.

#### B.2.2 `omx state` for durable dispatch tracking

Use `omx state` when a Stream #2 or #3 run may span sessions and file polling
alone is too weak. Record the active stream, service, lane, artifact path, and
latest gate result:

```bash
omx state write --input '{"mode":"stream2","active":true,"service":"chatgpt","lane":"catalog","artifact":"docs/research/chatgpt-feature-catalog.md"}' --json
omx state read --input '{"mode":"stream2"}' --json
omx state list-active --json
```

Cross-reference §B.8: use this state as a monitoring signal alongside logs,
team events, and output files.


### B.3 Critical flags on `omx exec`

| Flag | Effect | When to use |
| --- | --- | --- |
| `-C <dir>` / `--cd` | Set working root. Always pass the absolute repo path. | every dispatch |
| `--skip-git-repo-check` | Allow running outside or in unusual repo states. | every dispatch in this repo (worktrees, prompt-only state) |
| `--dangerously-bypass-approvals-and-sandbox` (alias `--madmax`) | No prompts, no sandbox. | **authorized in this repo only**; bwrap broken on host |
| `-o <file>` | Write the final assistant message to a file. | always — captures answer for diffing |
| `--json` | Stream events as JSON. | scripted parsing |
| `--output-schema <file>` | Constrain final output to a JSON schema. | structured deliverables |
| `--ephemeral` | Don't persist session files. | one-off probes |
| `-m <model>` | Pick a specific model id. | only when needed; default is fine |
| `-c model_reasoning_effort='"high"'` (or `"xhigh"`) | Bump reasoning. | hard architecture/debug only |
| `--image <file>` | Attach an image to the initial prompt. | screenshots-as-evidence |
| `--add-dir <dir>` | Additional writable directories. | rare; cross-repo refactors |
| `--ignore-rules` | Skip user/project `.rules`. | never in this repo |
| `--ignore-user-config` | Skip `$CODEX_HOME/config.toml`. | rare diagnostic |

### B.4 Sandbox vs bypass

Local order of preference for this repo:
1. `--sandbox read-only --skip-git-repo-check` — fine for analyses and prompts
   that don't need to touch the filesystem.
2. `--sandbox workspace-write --skip-git-repo-check` — implementation prompts
   that only need to write inside `$REPO_DIR`.
3. `--dangerously-bypass-approvals-and-sandbox` — **the project default**
   because bwrap is broken on the host (see user-memory
   `feedback_codex_sandbox.md`). Always include in this repo unless the user
   asks otherwise.

`--sandbox danger-full-access` is **not** used from automation.

### B.5 Output capture

- `-o <out-file>` writes the **final** assistant message. This is what other
  agents diff against later. Always set it.
- `2>&1 | tee /tmp/<name>.log` captures the live stream (status events, tool
  calls). Save this separately when running in foreground.
- For background runs, the `.sh` launcher's `nohup ... > /tmp/<name>.log 2>&1 &`
  serves the same purpose; `-o` is still the durable deliverable.

### B.6 Verified workflow patterns from `call-codex-via-omx`

1. **Advisor artifact** — `omc ask codex --prompt "..."` writes
   `.omc/artifacts/ask/...`. Cheap, no AGENTS overlay, second-opinion shape.
2. **Role-shaped advisor** — `omc ask codex --agent-prompt critic --prompt "..."`
   for a critic-shaped Codex review.
3. **Exact execution** — `omx exec ... - < prompt.md -o out.md` for production
   implementation work in this repo.
4. **Parallel workers** — `omx team N:executor "..."` or `omc team N:codex "..."`
   for stay-in-lane parallelism. **Parse the team name from launch stdout.**
5. **Monitoring** — see §B.8.

### B.7 OMC `Agent` tool in parallel with `omx exec`

Codex via `omx exec` runs in a host shell process; Claude `Agent`
(`subagent_type: ...`) runs an isolated Claude lane in the same Claude
session (optionally inside a `worktree`). The two can run side-by-side as
independent research lanes — the orchestrator then diffs the outputs.

Pattern (used this session for the OMC/OMX research itself):

```bash
# Lane 1 (Codex via OMX) — writes to live repo
nohup /tmp/<task>.sh > /tmp/<task>.log 2>&1 &
```

```text
Lane 2 (Claude Opus 4.7 via Agent tool) — writes to an isolated worktree:
Agent({
  description: "<task> (parallel lane)",
  subagent_type: "general-purpose",
  model: "opus",
  isolation: "worktree",
  run_in_background: true,
  prompt: <self-contained brief>,
})
```

The orchestrator gets:
- A task-notification when the Claude lane finishes (with worktree path).
- Manual polling for the Codex lane (see §B.8) — until either codex emits a
  done marker into the `-o` file or `ps` reports the launcher PID gone.

### B.8 Monitoring background dispatches and detecting completion

This is the gap the project has hit repeatedly: a `nohup omx exec ... &`
detaches from the orchestrator session and the orchestrator has no automatic
signal when Codex finishes. Use these patterns to close that loop.

#### Default — `Bash run_in_background=true`

If the dispatch fits in a single Bash call (small launcher), prefer the Claude
Code harness's own background tracking:

```bash
omx exec -C <repo> --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
  -o <out> - < <prompt>
```
invoked via `Bash(command=..., run_in_background=true)`. The harness emits
a `task-notification` when the process exits, automatically re-invoking the
orchestrator with the completion status.

Use this when:
- Dispatch lifetime ≤ orchestrator session lifetime.
- You want automatic completion notifications.
- The shell command is short enough to call directly.

#### Long-running — `nohup` + Monitor

For dispatches expected to outlive the current Claude invocation (≥30 min,
multi-deliverable codex runs), use `nohup` so the job survives a session
restart, then use the `Monitor` tool to watch a file or condition:

```text
Monitor({
  target: "/tmp/<task>.log",
  watch: "stdout",   # or "file-grows", "file-stable-for-Ns", "process-exits"
})
```

Each `Monitor` notification wakes the orchestrator with a fresh status
read. Use `Monitor` for:
- Polling the codex log for a known done-marker (`tokens used`, `Completed
  Phase`, etc.).
- Detecting when the `-o` output file becomes non-empty.
- Watching the launcher PID for exit.

#### Status snapshot at any time

```bash
ps -p <pid> -o pid,etime,stat 2>/dev/null            # is launcher alive
ls -la /tmp/<task>.log /tmp/<task>-out.md            # sizes
tail -n 30 /tmp/<task>.log                           # recent activity
test -s .omc/codex-out/<task>.md && wc -l .omc/codex-out/<task>.md
omx status                                            # mode state
omx hud --json                                        # statusline snapshot
omx session search "<task-name>"                      # find related sessions
```

For `omx team` dispatches:
```bash
omx team status <team-name> --json
omx team api read-events --input '{"team_name":"<name>"}' --json
omx team api list-tasks --input '{"team_name":"<name>"}' --json
```

#### Scheduled fallback wake-up

If neither `Bash run_in_background` nor `Monitor` fits (e.g. external CI run
that doesn't write a local file), schedule a wake-up with
`ScheduleWakeup`:

- Pick a delay matched to expected completion time.
- The orchestrator gets re-invoked at that time and re-checks status.
- Keep one wake-up active per dispatch; cancel/skip the next if the dispatch
  already completed.

#### MCP server signal channel

`omx mcp-serve <target>` exposes the installed OMX state, memory, code-intel,
trace, wiki, and hermes targets as stdio MCP servers. For long-running stream
research, prefer writing progress to `omx state` and subscribing through that
MCP channel when available; it gives richer, structured progress than polling
`/tmp/*.log` alone.

Supported local targets from `omx mcp-serve --help`: `state`, `memory`,
`code-intel`, `trace`, `wiki`, `hermes`.

#### Anti-pattern: blind polling loop

Do not write:
```bash
while ! test -s .omc/codex-out/<task>.md; do sleep 60; done
```
in the orchestrator session — that burns cache and tokens. Use one of the
above mechanisms instead; the harness exists specifically to avoid blocking
on poll loops.

#### Recommendation by dispatch type

| Dispatch type | Recommended monitoring |
| --- | --- |
| Codex `omx exec` ≤ 5 min | Foreground with `tee`, read output inline. |
| Codex `omx exec` 5-30 min | `Bash run_in_background=true` (harness notifies on exit). |
| Codex `omx exec` ≥ 30 min | `nohup`/launcher + `Monitor` on the log file or `-o` path. |
| Claude `Agent` lane | `run_in_background=true` on the Agent call — harness notifies with worktree path. |
| `omx team` / `omc team` | `omx team api read-events --json` periodically via `Monitor` on team state. |
| Long-running research tracked in `omx state` | `omx state read/list-active --json` or the `omx mcp-serve state` MCP channel, plus artifact checks. |
| External CI / web job | `ScheduleWakeup` matched to expected runtime. |

---

## C. Recurring project patterns mapped to commands

These are the patterns that already shipped through v2 delivery (Phase 1 →
Phase 3c). Each lists the recipe, when to prefer it, the skill that wraps it,
and the failure modes you should expect.

### C.1 Single-codex dispatch with prompt file + background launcher

**When:** any implementation, refactor, or doc update larger than a one-liner.
This is the default pattern.

**Skill:** `.omc/skills/web-ai-dispatch-codex/SKILL.md`

**Preferred engine hook:** if the dispatch is iterative-until-done rather than
one-shot, use `omc:ralph` / `omx ralph --prd` so the loop owns subgoals,
state, and verification.

**Recipe:**
```bash
# 1. Write the prompt
PROMPT=.omc/codex-prompts/<task-name>.md
cat > "$PROMPT" <<'MD'
# <task name>
...task / repo path / constraints / acceptance / forbidden actions / evidence / stop condition...
MD

# 2. Foreground dispatch
omx exec -C /home/l1u/workspace/noeticmind/web-ai-capability-hub \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o .omc/codex-out/<task-name>.md \
  - < "$PROMPT" 2>&1 | tee /tmp/<task-name>.log

# 3. Or, background dispatch (long jobs >5 min)
cat > /tmp/<task-name>.sh <<SH
#!/usr/bin/env bash
set -euo pipefail
cd /home/l1u/workspace/noeticmind/web-ai-capability-hub
omx exec -C "\$PWD" --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o .omc/codex-out/<task-name>.md \
  - < $PROMPT
SH
chmod +x /tmp/<task-name>.sh
nohup /tmp/<task-name>.sh > /tmp/<task-name>.log 2>&1 &
```

**Monitoring:** set up exactly one of the §B.8 mechanisms before walking
away from the dispatch. The orchestrator must not have to remember to come
back manually.

**Stop signal:** `.omc/codex-out/<task-name>.md` is non-empty and reads as a
final answer (not a status echo).

**Failure modes:**
- Codex stuck at repo-trust prompt → check `/tmp/<task-name>.log`, accept in
  pane if interactive, otherwise re-dispatch with `--skip-git-repo-check`.
- `bwrap` errors → bypass flag is required on this host.
- AGENTS overlay clash → verify `omx setup` was run after the last `omx update`.

### C.2 Two codex runs in parallel with stay-in-lane prompts

**When:** Phase work that splits cleanly (e.g. ChatGPT-side and Claude-side
catalog passes ran in parallel in `.omc/codex-prompts/chatgpt-deep-v2.md` +
`claude-deep-v2.md`). Each prompt explicitly says which files it owns and
which it must not touch.

**Skill:** `.omc/skills/web-ai-dispatch-codex/SKILL.md` (multi-dispatch
section). For true tmux-supervised parallelism use `omx team N:executor`.
`omc:ultrawork` is the Claude-side discipline for firing independent lanes
together; `omx team` is the Codex-side supervised alternative to raw `nohup`
pairs.

**Recipe:**
```bash
# Option 1 — two independent omx exec runs, separate output files
nohup /tmp/chatgpt-deep.sh > /tmp/chatgpt-deep.log 2>&1 &
nohup /tmp/claude-deep.sh > /tmp/claude-deep.log 2>&1 &

# Option 2 — omx team for tmux-coordinated parallel workers
omx team 2:executor "$(cat <<EOF
Read .omc/codex-prompts/chatgpt-deep-v2.md and .omc/codex-prompts/claude-deep-v2.md.
Each worker picks exactly one prompt; do not touch the other worker's files.
EOF
)" | tee /tmp/team-launch.log
TEAM=$(sed -n 's/^Team started: //p' /tmp/team-launch.log | tail -1)
omx team status "$TEAM" --json
```

**Monitoring:** Option 1 — Monitor each `/tmp/*.log` separately. Option 2 —
`omx team api read-events` (see §B.8).

**Prefer this over manual** when both lanes need real Codex compute. Prefer
the single-dispatch pattern (C.1) when the tasks are sequential.

**Failure modes:** workers collide on the same file → prompts must encode
lane boundaries up front. Use `--worktree` (default in `omx team`) so workers
don't share a working tree.

### C.3 Live UI smoke against a managed Chrome profile

**When:** verifying that a freshly built TS CLI actually drives the live UI
(Phase 1 smoke, resmokes 1-3, Phase 3 reference workflow). Pattern recurs in
every `.omc/codex-prompts/phase1-*-smoke*.md`.

**Skill:** `.omc/skills/web-ai-live-smoke/SKILL.md`

**Recipe (high-level):**
1. Pre-check Chrome: `curl -s http://127.0.0.1:9223/json/version | head -1`.
   If empty, relaunch with `DISPLAY=:0
   XAUTHORITY=/run/user/1000/gdm/Xauthority` (otherwise Cloudflare blocks).
2. Confirm the target tab is open via `/json` API; if not, navigate the
   existing profile page (do **not** open a fresh tab via the CLI under test).
3. Dispatch a one-shot smoke prompt to Codex. The prompt:
   - states preconditions (Chrome on 9223, build present, target conversation
     URL),
   - runs exactly one `node dist/src/cli.js browser:<action> ...` invocation
     with `--output-json`,
   - captures stdout/stderr to the run directory,
   - parses the DOCX (or other artifact) and compares sha256 / paragraphs /
     chars against known baselines (e.g. Round-3 sha256),
   - writes `phase<N>-<smoke|resmoke<k>>-report.md`.
4. **Do not patch TS code in this smoke run** — that goes to a separate bugfix
   dispatch (see C.5).

**Stop signal:** smoke report exists with PASS / FAIL / INCONCLUSIVE
classification per criterion.

**Failure modes:**
- `ELEMENT_NOT_FOUND` with `pages()[0]` wrong tab → page-selection bug; see
  C.5 bugfix iteration.
- `IFRAME_NOT_FOUND` → iframe attached late; rerun with
  `--locate-timeout-ms 12000` and `--prerender-wait-ms 15000`.
- DOCX sha256 matches a known prior file → cached artifact, not fresh export;
  retry once.
- INCONCLUSIVE (env reason, e.g. Chrome down) → relaunch with proper DISPLAY,
  do not invent a TS bug.

### C.4 Cross-model adversarial research (codex + claude built-in team + ccg)

**When:** strategic questions where any single model is likely to be wrong —
plan critique, library shootouts, "is X the right abstraction" debates.
Pattern: v1-vs-v2 critique in `web-ai-plan-critique.md` used Codex with
internet access to produce an adversarial v2.

**Skill:** `.omc/skills/web-ai-cross-model-research/SKILL.md`

**Recipe:**
- **Evaluator-gated catalog building:** `omc:autoresearch` is preferred when
  the lane has a machine-checkable catalog shape and should re-dispatch until
  the evaluator passes.
- **Path A — single adversarial Codex pass with web access:** `omx exec ... -
  < critique-prompt.md` where the prompt insists on `WebSearch` /
  `WebFetch` / `curl` use and lists ≥5 reference projects to attack.
- **Path B — `ccg` tri-model:** invoke `/oh-my-claudecode:ccg` to fan out to
  codex + gemini and let Claude synthesize. Useful when the question is
  bounded enough that three short responses beat one deep response.
- **Path C — explicit team:** `omc team 2:codex,1:gemini "critique X"` with
  per-worker lane assignments.

**Prefer this over manual** when the orchestrator's own opinion is suspect or
when the user explicitly asked for adversarial critique.

**Failure modes:**
- Codex produces consensus instead of attack → prompt must include the word
  "adversarial" and a taxonomy of defects (`architectural mismatch`,
  `under-engineering`, etc.) to score against.
- Gemini hallucinates a non-existent feature → require URL citations in
  Section B of the deliverable.

### C.5 Bugfix iteration after a failed live smoke

**When:** a live smoke produced a stable error code (`ELEMENT_NOT_FOUND`,
`ARTIFACT_DOWNLOAD_TIMEOUT`, etc.) with actionable evidence. Pattern recurs
through `phase1-bugfix-page-selection.md` → `phase1-bugfix2-scroll.md` →
`phase1-bugfix3-menu-discovery.md`.

**Skill:** `.omc/skills/web-ai-bugfix-iterate/SKILL.md`

**Preferred engine hook:** when root cause is uncertain, run `omc:trace` with
the `tracer` agent first so competing hypotheses and next probes are explicit
before Codex patches.

**Recipe:**
1. Read the smoke report and the evidence JSON. Identify the **specific** root
   cause (selector drift, viewport, late iframe, abort signal missing, etc.).
2. Write a targeted bugfix prompt naming the failing file + line, the
   evidence, the fix (Change A / B / C…), tests to add, and explicit
   out-of-scope ("don't bump the contract", "don't refactor postconditions").
3. Dispatch via `omx exec`. Build + test must be green before stopping.
4. Re-smoke **once** using the new flags (see C.3). If it still fails, write
   the next bugfix prompt — never chain smokes.

**Failure modes:**
- "Run another smoke" before reading evidence → banned; see CLAUDE.md §5.
- Bugfix prompt drifts into scope creep (touches contract, refactors
  postconditions) → split into a new prompt.

### C.6 Plan critique (v1 → v2)

**When:** a strategic plan needs adversarial review with internet access. The
canonical example is `web-ai-plan-critique.md` (v1 plan attacked → v2
proposal written by Codex).

**Skill:** `.omc/skills/web-ai-plan-critique/SKILL.md`

**Recipe:** dispatch a single `omx exec` with a prompt that:
- forbids modifying the v1 file,
- requires Section A (defect taxonomy with quotes), Section B (web research
  with ≥6 reference projects + URLs), Section C (hard questions v1 doesn't
  ask), Section D (the v2 plan body), Section E (honest unknowns),
- requires `wc -w` shorter than v1 (or explicit justification),
- requires a §9 measurable success metric.

---

## D. Decision tree — "when should the orchestrator…"

| Question | Use | Why |
| --- | --- | --- |
| Need a code change in `src/` / `tests/` / `configs/`? | `omx exec` (foreground or background launcher) via dispatch skill | Orchestrator never edits these directly |
| Need a quick second opinion on architecture? | `omc ask codex --prompt "..."` or `--agent-prompt critic --prompt "..."` | Cheaper than full `omx exec`; artifact under `.omc/artifacts/ask/` |
| Need a third opinion alongside codex? | `omc ask gemini --prompt "..."` or `ccg` tri-model | Gemini adds breadth; ccg synthesizes |
| Need two implementation lanes in parallel? | `omx team 2:executor "..."` or two `nohup` launchers | Worker worktrees enforce lane isolation |
| Need parallel research from another Claude lane? | `Agent` tool with `model: "opus"`, `isolation: "worktree"`, `run_in_background: true` | Independent diffable take in isolated tree |
| Need an autonomous loop until done? | `omx ralph --prd "..."` | Persistence under `.omx/ralph/`; requires PTY |
| Need durable multi-goal handoff? | `omx ultragoal create-goals --brief-file ...` | Writes goals/ledger; doesn't itself execute |
| Need to find an existing file or pattern? | Agent tool with `explore` subagent | Internal codebase only; cheaper than `omx exec` |
| Need external docs / SDK reference? | Agent tool with `document-specialist` | Context Hub / `chub` / official docs first |
| Need to investigate a tricky bug? | Agent tool with `architect` or `tracer` | Read-only deep reasoning |
| Need to verify a claim before stopping? | Agent tool with `verifier`, or `code-reviewer` | Separate lane from authoring; never self-approve |
| Need to watch a background dispatch? | §B.8 — `Bash run_in_background`, `Monitor`, `omx team api`, or `ScheduleWakeup` | Pick the right tool for the dispatch lifetime |
| Need a recurring task on cron? | `/schedule` skill | Routine handles scheduling |
| Need a fresh worktree for risky work? | `omc teleport '#<ref>'` | This session is itself a teleport worktree |

---

## E. Known gaps and open questions

These were researched but left unresolved at the time of writing. Future
sessions should pick them up.

1. **`omx team` task DSL details.** The `omx team api` surface exposes events,
   workers, summaries, and read-config, but the canonical handoff format
   ("repo-aware DAG handoff") is gated on a "latest approved PRD/test-spec
   launch hint". The exact JSON shape and gating logic isn't fully documented
   in local help; verify with a fresh `omx team api --help` before relying on
   DAG mode.
2. **`omx imagegen continuation`.** Listed in `omx --help` but never used in
   this project's workflows. Whether it would help with chart/image-export
   probes in Stream 1 is unknown.
3. **`omx adapt`.** Scaffolds OMX-owned adapter foundations. Whether it
   interoperates with this repo's `src/adapters/` is untested.
4. **Concurrent dispatch limit.** Empirically two `omx exec` background runs
   work fine. The ceiling before they contend for resources or hit Codex
   rate limits is not measured.
5. **`omx ralph` PTY requirements in this repo.** Ralph requires a real PTY;
   background `nohup` invocations fail with `stdin/stdout is not a terminal`.
   Whether `script` + `timeout` would work for an unattended ralph loop here
   is untested.
6. **Sandbox interaction with managed Chrome on 9223.** When Codex runs under
   `--sandbox workspace-write`, can it still issue `node dist/src/cli.js
   browser:*` calls that connect over CDP to a host-owned Chrome? Not yet
   verified — the project defaults to `--dangerously-bypass-approvals-and-sandbox`
   so this hasn't been a problem.
7. **`omc team` vs `omx team` parity.** Both can spawn codex workers, but
   their API verbs (`read-events`, `read-worker-status`,
   `read-worker-heartbeat`, etc.) drift slightly. The right call has been to
   stick to one tool per session; cross-tool inspection is fragile.
8. **`Monitor` tool granularity on codex `--json` events.** §B.8 recommends
   `Monitor` for log watching, but the optimal watch condition for codex
   JSONL streams (per-line, per-token-usage marker, per-final-message) is
   not measured.

---

## F. Upcoming streams — what this workflow is built to power

Task #1 (the OMC/OMX integration itself) exists to make Stream #2 and
Stream #3 efficient. Each stream is a specific application of the skills
above; read this section before dispatching either stream.

### F.1 Stream #2 — Doc-driven feature catalog for ChatGPT / Claude / Gemini

**Goal.** Produce `docs/research/<service>-feature-catalog.md` for each of
the three services, sourced exclusively from each service's own official
help center. The catalogs feed Stream #3 (interactive verification) and any
later workflow design.

**Skill.** `.omc/skills/web-ai-cross-model-research/SKILL.md` → **Path D**.
See §A.4 for `autoresearch`/`ultrawork`/`critic`/`learner`, §B.2 for
`omx state`/`ultragoal`, and §B.8 for monitoring.

**Mechanics.** Three parallel stay-in-lane catalog lanes, preferably driven by
`omc:autoresearch` evaluator gates or `omc:ultrawork`/`omx team` supervision,
each pinned to one service:

| Lane | Service | Allowed sources only |
| --- | --- | --- |
| 1 | ChatGPT | help.openai.com, OpenAI release notes, ChatGPT in-app help |
| 2 | Claude (claude.ai) | support.anthropic.com, Anthropic blog/newsroom |
| 3 | Gemini (gemini.google.com) | support.google.com/gemini, Google AI blog |

**Hard rules** (mirrored in the skill):
- Stay-in-lane: Lane N never reads Lane M's sources or output as input.
- `feedback_doc_driven.md`: a Gemini-shaped feature index is **not** the
  ceiling for ChatGPT or Claude.
- Each row cites ≥1 URL on the allowed-list.
- Tooling: `WebSearch` / `WebFetch` / `curl -L --max-time 30` only. No
  `node dist/src/cli.js` (Stream #2 is doc-driven, not live UI).

**Dispatch shape.** Prefer `omc:autoresearch` for evaluator-gated lane
completion; use `omc:ultrawork` or `omx team` when the three lanes mainly need
throughput and human-supervised acceptance. Track all long runs in `omx state`
(§B.2.2, §B.8).

Autoresearch mission shape (one mission per service, launched as three
stay-in-lane missions):

```text
/oh-my-claudecode:autoresearch
Mission: Stream #2 <service> feature catalog.
Lane: <chatgpt|claude|gemini>; allowed sources only from the lane table.
Evaluator: catalog file exists and every feature row has id, name, category,
availability, web_ui_path, automation_notes, and source URL from the allowed
source list. pass=false if any row lacks a citation or uses another service as
input. Re-dispatch the failed lane with the evaluator failure inline.
Artifacts: docs/research/<service>-feature-catalog.md and
.omc/autoresearch/stream2-<service>/ decision logs.
```

Ultrawork/team alternative for the same three lanes:

```text
/oh-my-claudecode:ultrawork Stream #2 catalog build:
- lane chatgpt owns only docs/research/chatgpt-feature-catalog.md
- lane claude owns only docs/research/claude-feature-catalog.md
- lane gemini owns only docs/research/gemini-feature-catalog.md
- each lane uses only its allowed sources and writes its evaluator result
- orchestrator records lane status with omx state write/read/list-active
```

**F.1.2 Critique gate.** After all three catalogs pass their evaluator, attack
each catalog before acceptance with the OMC `critic` agent or Codex critic:

```bash
omc ask codex --agent-prompt critic --prompt "Review docs/research/<service>-feature-catalog.md against Stream #2 rules: allowed sources only, required row shape, no feature-by-analogy, URL citations. Verdict APPROVE or BLOCK with fixes."
```

A blocked catalog is re-dispatched to its original lane; do not synthesize the
comparative catalog until all three critic verdicts approve.

**F.1.3 Learner gate.** After critic acceptance, run `omc:learner` (or the
current `skillify` alias if learner redirects there) to capture hard-won
service-specific cataloging patterns as project skills, then use
`omc:remember`/`omc:wiki` for durable memory and long-form cross-references.

**Monitoring.** §B.8. Three concurrent lanes; watch autoresearch decisions,
team events, `omx state`, or the three catalog output files. For MCP-aware
orchestrators, `omx mcp-serve state` is the structured progress channel.

**Optional cross-validation.** After all three per-service catalogs exist and
critic approves, invoke `/oh-my-claudecode:ccg` against a synthesis question,
or dispatch a single Codex synthesis pass that reads only the three catalogs
and produces `docs/research/stream2-comparative-catalog.md` with feature
overlap + naming-disagreement diff.

**Deliverable.** Three `docs/research/<service>-feature-catalog.md` plus
the optional comparative diff. **No code changes.**

### F.2 Stream #3 — Interactive web AI exploration

**Goal.** Drive the live web UI of each service and turn the Stream #2
catalog claims into observed behaviour. Catalogue selector drift, gated
features, model-tier surprises. Output feeds the real automation roadmap.

**Skill.** `.omc/skills/web-ai-interactive-explore/SKILL.md` — purpose-built
for this loop. (Distinct from `web-ai-live-smoke`, which is a single
positive case.) See §A.4 for `ralph`/`visual-verdict`/`learner`, §B.2 for
`omx ralph`/`omx state`, and §B.8 for monitoring.

**Pre-conditions.** Before dispatching Stream #3:
- ChatGPT is currently logged in (confirmed by user).
- Claude and Gemini login state is **unknown**. The skill's pre-condition
  step (`curl http://127.0.0.1:9223/json` + URL match) tells you which need
  re-login; hand back to the user for credential entry — **automation does
  not enter credentials**.
- Chrome on 9223 alive (relaunch with `DISPLAY=:0
  XAUTHORITY=/run/user/1000/gdm/Xauthority` if not — Cloudflare blocks
  headless).

**Hard rules** (mirrored in the skill):
- One service per dispatch. Serial, not parallel — the managed Chrome is
  shared state.
- **ChatGPT testing uses a Thinking-class model, never Pro** unless the
  user explicitly authorizes Pro for this run. Claude and Gemini use the
  cheapest available chat tier.
- No CAPTCHA bypass, no stealth, no credentials in automation, no account
  changes, no billing-page interaction, no public publishing.
- A feature that doesn't work → stable error code (`ELEMENT_NOT_FOUND`,
  `IFRAME_NOT_FOUND`, `MODE_UNCERTAIN`, `HUMAN_HANDOFF_REQUIRED`) plus
  evidence; never synthesized success.

**Per-service feature ladder** (canonical Stream-#3 probe order):
1. Identify logged-in account + active model (read header).
2. Switch to cheap-default model.
3. Open a new (or named test) conversation.
4. Send a short test prompt.
5. Capture first 500 chars of the response.
6. Upload a small text fixture; confirm acknowledgement.
7. If the service produces a downloadable artifact (DOCX/PPTX/image/code),
   trigger that and capture via `browser:artifact-click`.
8. Locate export / share menu (do **not** publish).
9. Inventory help-center features not reachable for this account.

**Dispatch order.** Three serial dispatches:
1. `chatgpt` (logged in; Thinking model).
2. `claude` (relogin if needed; cheap tier).
3. `gemini` (relogin if needed; cheap tier).

**Ralph dispatch shape.** Use `omc:ralph` / `omx ralph --prd` for each
service so the nine feature rows are explicit subgoals and the loop continues
until every row is PASS / NOT-REACHABLE / INCONCLUSIVE (no SKIP). Ralph needs a
real PTY; do not launch it with blind `nohup`. If it stalls, inspect `.omx/`
ralph/progress state, `omx hud --json`, and `omx state read`, then resume or
inject the next feature-specific instruction rather than starting a second live
UI run on the same Chrome profile.

```bash
omx ralph --prd "Stream #3 <service> live exploration: execute the 9-feature ladder serially, write .runs/web-ai-explore/<run>/explore-report.md, and stop only when every feature row is PASS / NOT-REACHABLE / INCONCLUSIVE."
```

For visual outputs (charts, canvas, generated images, screenshots), add
`omc:visual-verdict` after the DOM/artifact evidence step. After each service
report is accepted, run `omc:learner` to capture observed selectors, model-tier
quirks, and artifact patterns as project skills; use `omc:remember`/`omc:wiki`
for durable notes and long-form catalog links.

**Deliverable.** Per service: `.runs/web-ai-explore/<run-name>/explore-report.md`
with PASS / NOT-REACHABLE / INCONCLUSIVE per ladder row plus evidence
sub-directories. Then a final
`docs/research/stream3-exploration-summary.md` that diffs each service's
report against its Stream #2 catalog and flags the gaps that need automation
work.

### F.3 Stream sequencing

```text
Stream #2 (parallel, doc-driven)  →  produces 3× feature catalogs
       │
       ▼
Stream #3 (serial, live UI)       →  produces 3× exploration reports + summary
       │
       ▼
Roadmap update                    →  next plan revision (web-ai-plan-critique)
```

Stream #3 must not start until at least Stream #2's catalog for the same
service exists (interactive exploration without a doc baseline produces
noise, not signal).

**Goal-tree option.** When the two streams should survive multiple sessions,
write a brief that names Stream #2 catalogs, critique/learner gates, Stream #3
serial exploration, and final roadmap update, then run:

```bash
omx ultragoal create-goals --brief-file .omc/codex-prompts/streams-2-3-brief.md --json
omx ultragoal status --json
```

Use the resulting `.omx/ultragoal/ledger.jsonl` as the durable sequence while
individual lanes still use `omc:autoresearch`, `omc:ultrawork`, or `omx ralph`.

### F.4 Out-of-scope reminders for both streams

- No CAPTCHA bypass, stealth-browser tooling, credential entry, billing
  page interaction, account-settings changes, or public publishing.
- ChatGPT Pro is **off-limits** for testing unless the user explicitly
  authorizes it for a specific run.
- No screenshots committed to the repo; evidence is JSON / DOM snapshots
  under the run directory.
- No new TypeScript code in either stream — both are research. Any tooling
  gaps surface as bugs handed to `web-ai-bugfix-iterate` after the stream.

---

## G. MCP server integration

Use MCP servers for live reference material when they are available locally; do
not fall back to blind URL guessing for library or reference-project research.

| Server | Live local evidence | Stream use |
| --- | --- | --- |
| Context7 (`mcp__context7__*`) | Live in this Codex session: `mcp__context7__.resolve_library_id` resolved Playwright docs; installed at `/home/l1u/.claude/plugins/cache/claude-plugins-official/context7/unknown/.mcp.json`; `omc info` lists `context7`. | Stream #2 Section B research for Playwright, Stagehand, and other library/API docs. Resolve the library ID first, then query official docs/examples. |
| GitHub (`mcp__github__*`) | Live in this Codex session: `mcp__github__.get_me` returned the authenticated user; installed at `/home/l1u/.claude/plugins/cache/claude-plugins-official/github/unknown/.mcp.json`; not listed by `omc info` in this run, so verify in the active Claude surface before relying on it there. | Stream #2 reference-project state: list branches/tags, read READMEs, inspect releases, avoid guessed GitHub URLs. |
| OMC bridge (`t`) | `omc info` lists MCP server `t`; plugin config at `/home/l1u/.claude/plugins/cache/omc/oh-my-claudecode/4.13.6/.mcp.json`. | OMC/plugin metadata and project-local orchestration support. |
| OMX stdio targets | `omx mcp-serve --help` lists `state`, `memory`, `code-intel`, `trace`, `wiki`, `hermes`. | Subscribe to stream state/wiki/trace signals from §B.8 instead of log-only polling. |
| Exa | `omc info` lists `exa`. | General web search if official docs/MCP sources are insufficient. |

Pinned dispatch rule: Context7 is the preferred source for library docs
(Playwright, Stagehand, SDK/CLI usage). GitHub MCP is preferred for live
reference-repo state. If a future session cannot discover one of these tools,
that dispatch must say the server is unavailable and use a verified fallback
instead of recommending an inactive tool.

---

*Last updated alongside CLAUDE.md and the `.omc/skills/web-ai-*/SKILL.md`
set. Keep this doc current when adding new dispatch shapes, new monitoring
mechanisms, or new streams.*
