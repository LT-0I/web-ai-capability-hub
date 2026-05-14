---
name: web-ai-dispatch-codex
description: Dispatch a heavy implementation, refactor, or doc-edit task in web-ai-capability-hub to Codex via OMX. Always uses a prompt file in .omc/codex-prompts/ and writes output to .omc/codex-out/. Use whenever the orchestrator needs to touch src/, tests/, configs/, package.json, or write multi-file docs.
---

# Dispatch heavy work to Codex via OMX

This is the default execution path in `web-ai-capability-hub`. The Claude
session in this repo is the orchestrator and does not edit `src/` / `tests/` /
`configs/` directly — those live edits go to Codex through `omx exec`.

## When to use

- Any TS code change in `src/` or `tests/`.
- Schema / contract changes in `configs/consumer-contract.json` (and the doc
  + test round-trip).
- Documentation work in `docs/` that requires reading >2 source files.
- Bugfix iteration after a failed live smoke (use this skill plus
  `web-ai-bugfix-iterate` for the prompt shape).
- Any task in a recent commit message of the form `web-ai-automation: phase N
  — …`.

## When NOT to use

- One-line shell ops or status reads → run them in this Claude session.
- A quick second opinion → `omc ask codex --prompt "..."` is cheaper.
- An adversarial plan critique → use `web-ai-plan-critique` (still calls
  `omx exec`, but the prompt shape is specialized).
- A repeat live UI smoke after a successful run → there is nothing to dispatch.

## Required variables

```bash
REPO_DIR=/home/l1u/workspace/noeticmind/web-ai-capability-hub
TASK_NAME=phase4-resume-runbook                          # kebab-case
PROMPT_FILE="$REPO_DIR/.omc/codex-prompts/$TASK_NAME.md"
OUT_FILE="$REPO_DIR/.omc/codex-out/$TASK_NAME.md"
LOG_FILE="/tmp/$TASK_NAME.log"
LAUNCHER="/tmp/$TASK_NAME.sh"
```

## Prompt-file shape

Every prompt file in `.omc/codex-prompts/` follows the same shape, mirrored
from `phase1-artifactclick-postconditions.md` and the bugfix prompts:

1. Title (`# <task name>`).
2. "You are a fresh codex session. Read fully before acting." preamble.
3. **Scope** — what is in scope; explicit "OUT OF SCOPE" list.
4. **Required reading** — absolute paths to the v2 plan, the consumer
   contract, related Round-N evidence, and existing tests.
5. **Concrete deliverables** — numbered, each with CLI signature / file path
   / acceptance.
6. **Tests to add / update**.
7. **Constraints and style** — TS-first, match existing style, no commits.
8. **Verification before stopping** — `npm run build` then `npm test`.
9. **Stop condition** — explicit pass list.
10. **Anti-slop clauses** — no fallback layers, no scope creep, no new docs
    not asked for.
11. **Time budget** + `GO.`

## Exact command shapes

### Foreground dispatch (small tasks, ≤5 min)

```bash
mkdir -p "$REPO_DIR/.omc/codex-out"

omx exec -C "$REPO_DIR" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o "$OUT_FILE" \
  - < "$PROMPT_FILE" 2>&1 | tee "$LOG_FILE"

test -s "$OUT_FILE" && wc -l "$OUT_FILE"
tail -n 80 "$LOG_FILE"
```

### Background dispatch (long tasks, real Codex work)

```bash
mkdir -p "$REPO_DIR/.omc/codex-out"

cat > "$LAUNCHER" <<SH
#!/usr/bin/env bash
set -euo pipefail
cd "$REPO_DIR"
omx exec -C "\$PWD" \\
  --skip-git-repo-check \\
  --dangerously-bypass-approvals-and-sandbox \\
  -o "$OUT_FILE" \\
  - < "$PROMPT_FILE"
SH
chmod +x "$LAUNCHER"
nohup "$LAUNCHER" > "$LOG_FILE" 2>&1 &
echo "dispatched: pid=$! log=$LOG_FILE out=$OUT_FILE"
```

Poll:
```bash
tail -f "$LOG_FILE"            # live
test -s "$OUT_FILE" && echo "done" && wc -l "$OUT_FILE"
```

### Two lanes in parallel

Reuse the launcher template above with two distinct `TASK_NAME` values and
distinct prompt files. Each prompt **must** name the files it owns and
forbid touching the other lane's files. Example used in production:
`.omc/codex-prompts/chatgpt-deep-v2.md` + `claude-deep-v2.md`.

For tmux-supervised parallel workers prefer:
```bash
TEAM_LOG=/tmp/team-launch.log
omx team 2:executor "$(cat <<EOF
Lane 1 prompt path: $REPO_DIR/.omc/codex-prompts/chatgpt-deep-v2.md
Lane 2 prompt path: $REPO_DIR/.omc/codex-prompts/claude-deep-v2.md
Each worker reads exactly one prompt by index. Do not touch the other lane.
EOF
)" | tee "$TEAM_LOG"
TEAM_NAME="$(sed -n 's/^Team started: //p' "$TEAM_LOG" | tail -1)"
omx team status "$TEAM_NAME" --json
```

## Engine hooks

- For iterative-until-done dispatches, prefer `omc:ralph` / `omx ralph` over a one-shot launcher.
- For supervised parallel stay-in-lane dispatches, prefer `omc:ultrawork` or `omx team` over raw `nohup` pairs.
- Track long-running dispatches with `omx state` and §B.8 monitoring when they span sessions.

## Stop signal

- `$OUT_FILE` is non-empty and reads as a real final-message answer (not just
  a status echo).
- For implementation tasks: the prompt's `npm run build` + `npm test`
  gates passed inside the run (verify by reading the final-message section
  that summarizes them).
- For doc tasks: the named output files exist with expected line counts.

## Failure modes

- **`bwrap` errors or sandbox refusals.** Confirm
  `--dangerously-bypass-approvals-and-sandbox` is on the command (this is
  the project default — bwrap is broken on the host).
- **Codex stuck at repo-trust prompt.** Foreground dispatch surfaces this in
  `tee`; accept once. Background dispatches need
  `--skip-git-repo-check`; if still stuck, re-dispatch.
- **AGENTS overlay missing or stale.** Run `omx setup` then re-dispatch.
- **Prompt-too-large.** Split into a chain of smaller prompts (phase
  pattern), or move long context into `Required reading` paths instead of
  inlining.

## Anti-patterns

- Inlining a multi-paragraph prompt into the `omx exec` shell command. **No.**
  Always commit the prompt to `.omc/codex-prompts/`.
- Calling raw `codex` instead of `omx exec`. **No.** The OMX wrapper applies
  AGENTS overlay this project depends on.
- Dispatching without `-o`. **No.** The orchestrator needs the durable answer
  file for review and downstream diffs.
- Dispatching the same task name twice — that overwrites `$OUT_FILE`. Use a
  `-roundN` suffix when iterating.

## References

- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §B, §C.1, §C.2
- `/home/l1u/.claude/skills/call-codex-via-omx/SKILL.md`
- `/home/l1u/.claude/skills/call-codex-via-omx/references/exec-variants.md`
- `.omc/codex-prompts/phase1-artifactclick-postconditions.md` — canonical
  prompt shape
- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.8, §F, §G — OMC/OMX engines, monitoring, and MCP hooks.
