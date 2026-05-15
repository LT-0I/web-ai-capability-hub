---
title: Stream #4 Phase 3 — Joint 3-AI Work Design
date: 2026-05-14
contract: consumer-contract-1.3.0
---

# Joint work — "LLM tool-use comparison pipeline"

## Goal

Exercise the 13 new v1.3.0 MCP tools end-to-end across all 3 web AIs in
ONE concrete piece of work that produces traceable artifacts and proves
the cross-service contract is stable.

## The task

Build a 3-stage **research → extract → visualize** pipeline:

| Stage | Service | Model tier | Tools exercised | Inputs | Outputs |
|---|---|---|---|---|---|
| 1 — Research | ChatGPT | Thinking (cheap) | `webai:chatgpt:send-prompt`, `webai:chatgpt:generate-file` | prompt text | DOCX or MD comparison brief |
| 2 — Extract | Claude | Sonnet (cheap) | `webai:claude:upload-and-query`, `webai:claude:generate-file` | Stage-1 DOCX/MD | CSV scoring table |
| 3 — Visualize | Gemini | Flash (cheap) / default | `webai:gemini:upload-and-query`, `webai:gemini:generate-image` | Stage-2 CSV | PNG comparison chart |

Topic: **"Compare three approaches to LLM tool-use: (A) JSON-schema function calling, (B) ReAct prompting, (C) constrained decoding. Score each on (1) reliability, (2) latency, (3) developer ergonomics, (4) debuggability — 1-5 scale."**

## Acceptance criteria

- Each stage produces a real artifact (sha256-verified) on disk under `.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts/`.
- Stage-2 input proves it actually read Stage-1's content (the CSV must include at least one specific term from the brief, e.g. "ReAct").
- Stage-3 input proves it actually read Stage-2's CSV (image generation prompt must echo the table's column names back).
- All commands emit `errorCode` (or `error_code`) when failing — never raw exceptions, never silent partial success.
- `completion_detected: true` for every send-prompt-class command (proves bugfix #1 lands at runtime).
- ChatGPT lane starts on `/?model=...` or `/` (NOT `/c/<id>`) unless caller passed `--reuse-conversation` (proves bugfix #2).
- If a lane is logged out, command must return `LOGIN_REQUIRED` error code (proves bugfix #3).
- Per-step elapsed time + waitMs recorded.

## Tools NOT exercised in this work

- `webai:gemini:generate-video` (15-min wall time + plan-gated; deferred to Phase 4)
- `webai:gemini:canvas-to-docs` (separate output path; consider as bonus if time permits)
- `webai:chatgpt:generate-image` (image is the Gemini path here)
- `webai:claude:upload-and-query` for video (no video upload in this work)

Final tool exercise count: **6 of 13** (3 send-prompts implicit + 3 upload-and-query + 3 generate-file/image — exact path depends on Stage runtime decisions).

## Stability metrics to capture

- **Per-step verdict**: PASS / FAIL / INCONCLUSIVE with one-line reason.
- **Per-step wall time** + `wait_ms` from response.
- **Cross-stage data flow proof**: sha256 of Stage-1 output → matched filename in Stage-2 input → sha256 of Stage-2 output → matched filename in Stage-3 input.
- **Forbidden-field leak check**: no `cdpEndpoint`, `webSocketDebuggerUrl`, `profileDir`, `cookies`, `tokens`, `dom`, `html`, `screenshot` in any tool output.
- **Tab leak count**: tabs allocated minus tabs freed at end.
- **Error-code propagation**: any non-zero exit must surface a code from the contract taxonomy.

## Per-lane preconditions

- ChatGPT: `profile=chatgpt`, port 9223, model tier = Thinking (NOT Pro).
- Claude: `profile=claude`, port 9222, model tier = Sonnet (NOT Opus). **If logged out → LOGIN_REQUIRED**; the run continues without Stage 2 and reports the gap.
- Gemini: `profile=gemini-9225` (or whatever the registry calls it), port 9225, model tier = Flash or default (NOT Pro/Ultra).

## Stop condition

Report at `.runs/web-ai-explore/stream4-joint-work-2026-05-14/joint-work-report.md` covering:
- Topic, models confirmed used per lane.
- Per-stage CLI command invocations.
- Per-stage JSON output (verbatim, with sensitive-field check).
- Per-stage artifact path + sha256 + size.
- Per-stage verdict + elapsed + wait_ms + completion_detected.
- Cross-stage data flow proof.
- Tool-exercise tally (which of 13 actually called).
- Stability conclusion: GREEN / YELLOW / RED with reasons.
