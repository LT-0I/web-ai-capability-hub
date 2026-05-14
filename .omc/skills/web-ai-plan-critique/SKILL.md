---
name: web-ai-plan-critique
description: Adversarial critique of a strategic plan (v1 → v2 pattern). Dispatches Codex with internet access to attack the plan with a defect taxonomy, then write a revised v2 plan in the same file. Use for new strategic plans before any implementation dispatch.
---

# Adversarial plan critique (v1 → v2)

This skill encodes the exact dispatch shape that produced
`docs/plans/web-ai-automation-v2.md` from `web-ai-automation-v1.md` (via
`.omc/codex-prompts/web-ai-plan-critique.md`). Use it whenever a plan is
about to drive multi-day implementation and we have not yet stress-tested
it.

## When to use

- A plan exists at `docs/plans/<plan-name>-v1.md` (or any other "v1" /
  "draft" location) and is about to be the basis for `omx exec`
  implementation dispatches.
- The user said "进攻性讨论" / "adversarial" / "attack this plan".
- The plan covers ≥2 weeks of work or touches the consumer contract.

## When NOT to use

- The plan is a 1-paragraph tactical decision — overkill.
- The user explicitly asked for a "supportive review" — use `omc ask codex
  --agent-prompt critic` instead, which is gentler.
- The plan is fundamentally exploratory (no decisions yet) — use
  `web-ai-cross-model-research` Path B (`ccg`) instead.

## Required variables

```bash
REPO_DIR=/home/l1u/workspace/noeticmind/web-ai-capability-hub
PLAN_V1=$REPO_DIR/docs/plans/<plan-name>-v1.md
PLAN_V2=$REPO_DIR/docs/plans/<plan-name>-v2.md           # codex writes this
PROMPT_FILE=$REPO_DIR/.omc/codex-prompts/<plan-name>-critique.md
OUT_FILE=$REPO_DIR/.omc/codex-out/<plan-name>-critique.md
```

## Prompt-file shape

The critique prompt **must** include all of:

1. **You have internet access. Use it.** — Codex needs `WebSearch` /
   `WebFetch` / `curl` to attack volatile claims.
2. **Background** — one paragraph: what shipped, why a plan was drafted,
   what the user wants.
3. **Inputs to read first** — absolute paths to v1 plan, related run
   reports (round-1/2/3 in this project), winning script, consumer
   contract, current adapters.
4. **Section A — required defect taxonomy.** For each numbered section of
   v1, list defects using exactly these labels:
   - architectural mismatch
   - over-engineering
   - under-engineering
   - fragile assumption
   - wrong primitive boundary

   Quote the v1 text first, then attack.
5. **Section B — comparative research, required.** ≥6 reference projects
   with URLs. Each gets 2-4 sentences on what they do and whether it
   applies. For web-AI work the canonical list is:
   - Playwright cross-origin iframe download
   - `browser-use`
   - Stagehand (Browserbase)
   - Skyvern / AgentQL / Multion / Replit Agent
   - OpenAI Operator / ChatGPT agent mode / Deep Research API
   - Cloudflare-challenge handling (Patchright / Camoufox)
   - Profile lifecycle (Crawlee / Puppeteer ecosystem)
6. **Section C — hard questions v1 doesn't ask.** Things like: reboot
   resume, non-deterministic output verification, cost/quota, registry-vs-LLM
   abstraction, record-and-replay, locale/account variance, sensitive
   traces.
7. **Section D — v2 proposal.** Re-ranks primitives by value vs cost,
   commits to or rejects the workflow-registry model, adds a §9 measurable
   success metric, addresses each Section C hard question with a decision
   or explicit deferral.
8. **Section E — honest unknowns.** 3-7 things researched but not
   conclusively answered, plus the URLs tried.

Stop condition inside the prompt:
- `$PLAN_V2` exists with Sections A-E inline.
- Each Section B item cites ≥1 URL.
- v2 plan body is shorter than v1 by `wc -w` OR explicitly justifies why
  not.
- §9 has a specific measurable success metric.

Forbidden inside the prompt:
- Modifying v1.
- Downloading a ChatGPT-related GitHub repo and copying its code wholesale.
  Use the web for information, not for plagiarized implementation.
- Adding code.

## Dispatch

Single foreground `omx exec` (this prompt usually runs ≥30 min with web
fetches):

```bash
omx exec -C "$REPO_DIR" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  -o "$OUT_FILE" \
  - < "$PROMPT_FILE" 2>&1 | tee /tmp/<plan-name>-critique.log
```

Stop signal:
```bash
test -s "$PLAN_V2"
grep -q '^### Section A' "$PLAN_V2" && grep -q '^### Section B' "$PLAN_V2" && \
  grep -q '^### Section D' "$PLAN_V2" && grep -q '^### Section E' "$PLAN_V2"
wc -w "$PLAN_V1" "$PLAN_V2"
```

## Review the result

After v2 is written:
1. Scan Section A for at least 3 defects per v1 section. Fewer means Codex
   produced consensus — re-dispatch with a stricter prompt.
2. Scan Section B for URL citations. Reject any reference without one.
3. Scan §9 for measurability (numbers, thresholds, sha256 inequality, etc.)
   — "ship a clean run" is **not** measurable.
4. Hand v2 to the user. Do not auto-promote to "the plan" until they
   approve.

## Failure modes

- **Section B reads like a marketing summary.** Codex didn't actually
  fetch — re-dispatch with explicit `curl -L --max-time 30` examples in
  the prompt.
- **v2 is longer than v1 with no justification.** Re-dispatch with a
  `wc -w` gate in the stop condition.
- **§9 is vague.** Re-dispatch demanding numeric thresholds.
- **Codex bundles implementation code in v2.** Re-dispatch with explicit
  "DO NOT add code yet. This is plan-only."

## Engine hooks

- Use the OMC `critic` agent or `omc ask codex --agent-prompt critic` for a cheaper acceptance gate after a plan/catalog exists.
- For reference-project research, prefer live GitHub MCP when available; for library docs, prefer Context7 MCP over blind URL guessing.

## References

- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §C.6
- `.omc/codex-prompts/web-ai-plan-critique.md` — canonical prompt
- `docs/plans/web-ai-automation-v2.md` — canonical output
- `.omc/skills/web-ai-cross-model-research/SKILL.md` — broader tri-model
  alternative when adversarial-single-Codex is overkill
- `.omc/skills/web-ai-dispatch-codex/SKILL.md` — underlying dispatch
  mechanics
- `docs/WORKFLOW_OMC_OMX_INTEGRATION.md` §A.4, §B.8, §F, §G — OMC/OMX engines, monitoring, and MCP hooks.
