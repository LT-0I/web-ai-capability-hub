---
name: web-ai-cross-model-research
description: Run cross-model adversarial research on a question where Claude alone is suspect. Dispatches Codex (with web access) plus Gemini and/or a tmux team in parallel, then synthesizes. Use for plan critique, library shootouts, architecture choices, and — most importantly — the Stream #2 doc-driven feature catalog of ChatGPT/Claude/Gemini.
---

# Cross-model adversarial research

When a single model is likely wrong, fan out to Codex + Gemini (and
optionally Claude built-in team) in parallel and synthesize the answers.
The pattern was used to attack v1 of the web-AI automation plan and produce
`docs/plans/web-ai-automation-v2.md`, and is the engine for **Stream #2**:
producing per-service feature catalogs from each service's own official
help center.

## When to use

- The user explicitly asks for adversarial / cross-model review.
- The question turns on volatile facts (library APIs, model release notes,
  selectors in third-party UIs) — Codex with `WebSearch`/`WebFetch` is
  needed.
- The orchestrator's own answer would be a guess.
- **Stream #2:** building a doc-driven feature catalog for ChatGPT, Claude,
  or Gemini.

## When NOT to use

- The question is settled (e.g. "what file owns X" — use `explore` instead).
- The cost would be high and the answer is reversible later — start with
  one model and only escalate if needed.
- The question is about this repo's own private state — Codex via `omx exec`
  with repo read-only access is cheaper than a tri-model fanout.
- The user wants to interactively *use* the live web UI — that is Stream #3;
  use `web-ai-interactive-explore` instead.

## Required variables

```bash
REPO_DIR=/home/l1u/workspace/noeticmind/web-ai-capability-hub
QUESTION_NAME=playwright-vs-cdp-iframe-download
PROMPT_FILE="$REPO_DIR/.omc/codex-prompts/$QUESTION_NAME.md"
OUT_CODEX="$REPO_DIR/.omc/codex-out/$QUESTION_NAME-codex.md"
OUT_GEMINI=                                                # filled by `omc ask gemini`
```

## Path A — single adversarial Codex pass with internet access

This is the default for one-question critique. One Codex run with explicit
adversarial prompting and required web research. Codex is much better than
Claude at attacking a plan when given the right scaffold.

Prompt-file shape:
- Section A: Defect taxonomy (`architectural mismatch`, `over-engineering`,
  `under-engineering`, `fragile assumption`, `wrong primitive boundary`).
  Quote source text, then attack.
- Section B: Comparative research — list ≥5 reference projects with URLs;
  require `WebSearch` / `WebFetch` / `curl`. Each gets 2-4 sentences.
- Section C: Hard questions v1 / current plan doesn't ask.
- Section D: The v2 proposal (or revised answer).
- Section E: Honest unknowns with links tried.

Dispatch:
```bash
omx exec -C "$REPO_DIR" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o "$OUT_CODEX" \
  - < "$PROMPT_FILE"
```

Stop signal: `$OUT_CODEX` exists, Sections A-E are present, Section B cites
≥1 URL per reference project, and (if applicable) the new plan body is
shorter than the original by `wc -w` or justifies why not.

## Path B — `ccg` tri-model synthesis

Use when the question fits in a short prompt and three quick takes beat one
deep one. The `/oh-my-claudecode:ccg` skill fans out to Codex + Gemini via
`omc ask`, then Claude synthesizes.

Invoke from a Claude session:
```
/oh-my-claudecode:ccg
```
followed by the question. Artifacts under `.omc/artifacts/ask/` per
provider; the Claude synthesis is the final reply.

## Path C — explicit OMC team

Use when you need stay-in-lane parallel investigations with tmux supervision.
For example, two Codex workers (one on Playwright docs, one on CDP raw
events) plus a Gemini worker on Stagehand/Skyvern.

```bash
TEAM_LOG=/tmp/cross-model.log
omc team 2:codex,1:gemini "$(cat <<EOF
Lane 1 (codex-1): Read $PROMPT_FILE Section B-1 (Playwright). Produce
  a 1-page report on whether Playwright 1.50+ offers an iframe-download API
  that obviates browser-level CDP. Cite ≥3 URLs.
Lane 2 (codex-2): Read $PROMPT_FILE Section B-3 (Stagehand). Produce
  a 1-page report on Stagehand's act/observe/extract for selector drift
  recovery. Cite ≥3 URLs.
Lane 3 (gemini): Read $PROMPT_FILE Section B-6 (Cloudflare). Produce
  a 1-page report on Patchright/Camoufox tradeoffs and policy. Cite ≥3 URLs.
Do not touch any other lane's output file.
EOF
)" | tee "$TEAM_LOG"
TEAM_NAME="$(sed -n 's/^Team started: //p' "$TEAM_LOG" | tail -1)"
omc team status "$TEAM_NAME" --json
```

Synthesize in the Claude session after all three workers report.

## Path D — Stream #2 multi-service feature catalog

This is the canonical pattern for producing `docs/research/<service>-feature-catalog.md`
for ChatGPT, Claude, and Gemini. Three parallel Codex lanes, each pinned to
exactly one service's official help center.

**Lane assignments — strict stay-in-lane:**

| Lane | Service | Allowed sources only |
| --- | --- | --- |
| 1 | ChatGPT | `help.openai.com`, OpenAI release notes, ChatGPT in-app product tour pages. **No** Anthropic/Google content as input. |
| 2 | Claude (claude.ai) | `support.anthropic.com`, Anthropic newsroom/blog, claude.ai feature pages. **No** OpenAI/Google content as input. |
| 3 | Gemini (gemini.google.com) | `support.google.com/gemini`, Google AI blog (Gemini posts), gemini.google.com in-app help. **No** OpenAI/Anthropic content as input. |

**Anti-pattern banned by `feedback_doc_driven.md`:** Do **not** use one
service's catalog as the ceiling for another. Gemini-shaped feature lists
are not allowed as the index for ChatGPT or Claude.

**Per-lane prompt-file shape** (`.omc/codex-prompts/stream2-<service>-catalog.md`):

1. Fresh Codex session preamble.
2. **Service + allowed sources** (the row above, verbatim).
3. **Forbidden sources** — the other two services' help centers; third-party
   listicles; this repo's own docs (catalog must be doc-driven from
   upstream).
4. **Required output** — `docs/research/<service>-feature-catalog.md` with:
   - YAML front-matter (`service`, `catalog_date`, `source_urls`).
   - One row per discovered feature: `id`, `name`, `category`
     (chat / tools / files / code / image / search / agent / settings /
     pricing), `availability` (free / paid / enterprise), `web_ui_path`
     (how a user reaches it), `automation_notes` (what `browser:*`
     primitive would drive it, if obvious), and `source_url` (allowed-list URL).
   - A `gaps_and_uncertainties` section with explicit "unknown — needs
     interactive verification" rows. These feed Stream #3.
5. **Tooling** — `WebSearch`, `WebFetch`, `curl -L --max-time 30` only. No
   `node dist/src/cli.js`; this is doc-driven, not live UI.
6. **Anti-slop** — no feature-by-analogy ("Claude probably has this because
   ChatGPT does"); every row must cite at least one URL on the allowed-list.
7. **Time budget** — typically 60-90 min per service.

**Dispatch — evaluator-gated engines:**

Prefer `omc:autoresearch` when Stream #2 needs the lane to keep iterating until
its catalog passes a machine-readable evaluator. Use `omc:ultrawork` when the
same three lane prompts are already well-shaped and the goal is supervised
parallel throughput.

Autoresearch lane contract (repeat for `chatgpt`, `claude`, `gemini`):

```text
/oh-my-claudecode:autoresearch
Mission: Stream #2 <service> feature catalog.
Input prompt: .omc/codex-prompts/stream2-<service>-catalog.md
Allowed sources: exactly the lane's allowed-source row above.
Evaluator JSON: {"pass": boolean, "missing_rows": [], "forbidden_sources": [], "notes": "..."}
Gate: pass=true only when docs/research/<service>-feature-catalog.md exists and
every feature row has id, name, category, availability, web_ui_path,
automation_notes, and source URL from the allowed list.
Retry: if pass=false, re-dispatch only the failed lane with evaluator failures
inline; never let another service's catalog become input.
```

Ultrawork alternative:

```text
/oh-my-claudecode:ultrawork Stream #2 catalog build
- fire three independent lane prompts together
- preserve the strict stay-in-lane source lists and output ownership
- require each lane to write its evaluator JSON next to its catalog
- orchestrator accepts no lane until the evaluator passes
```

Do not use the old raw `for SERVICE; nohup omx exec; done` loop for Path D;
it lacks evaluator state, retry semantics, and durable lane decisions.

**Monitoring:** see `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §B.8. Track the
three lane artifacts plus autoresearch decisions or `omx state` entries.

**Critique gate (after all three lane evaluators pass):** run the OMC `critic`
agent or Codex critic before acceptance:

```bash
omc ask codex --agent-prompt critic --prompt "Attack docs/research/<service>-feature-catalog.md for forbidden sources, missing required row fields, uncited claims, and feature-by-analogy. Verdict APPROVE or BLOCK."
```

A BLOCK verdict reopens only that service lane. After all critics approve, run
`omc:learner` to extract service-specific cataloging patterns into project
skills.

**Synthesis step (after all three reports exist and critic accepts):** run a single Codex
synthesis pass that produces `docs/research/stream2-comparative-catalog.md`
diffing the three per-service catalogs (which features overlap, which are
unique, which appear named differently for the same capability). This pass
**is** allowed to read all three per-service catalogs as input — but only
those catalogs, not the upstream help centers again.

## Failure modes

- **Codex produces consensus instead of attack.** The prompt must literally
  contain the word "adversarial" and the defect taxonomy. If consensus
  appears anyway, re-dispatch with a stricter "find at least 3 architectural
  mismatches" clause.
- **Gemini hallucinates a non-existent feature.** Require URL citations in
  Section B; reject claims without them.
- **`omx ask codex` (instead of `omc ask codex`) fails.** Local `omx ask`
  supports only Claude/Gemini.
- **Lane crosses streams.** Stream #2 lane references another service's
  catalog → re-dispatch with the stay-in-lane rule re-stated and the
  forbidden-sources list inline.

## References

- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.8, §C.4, §F.1, §F.1.2, §F.1.3, §G (Stream #2 engines, critique, learner, MCP)
- `.omc/codex-prompts/web-ai-plan-critique.md` — canonical adversarial
  prompt
- `docs/plans/web-ai-automation-v2.md` — output of one full
  cross-model-research pass
- `/home/l1u/.claude/skills/call-codex-via-omx/references/gemini.md`
- `/oh-my-claudecode:ccg` — tri-model skill
- `.omc/skills/web-ai-interactive-explore/SKILL.md` — Stream #3 companion;
  consumes the catalogs produced here.
