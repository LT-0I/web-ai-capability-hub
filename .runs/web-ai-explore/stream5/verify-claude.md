# Stream #5 — Claude Surface LIVE Verification (contract 1.4.0)

Date: 2026-05-15
Profile: claude-9224 (CDP 9224) — logged in, live, NOT relaunched. dist/ used as-is (no rebuild).
Cheap model only (live UI confirmed on "Sonnet 4.6 Adaptive"). Benign inputs only. No account/billing/publish actions.

## Counts

- VERIFIED_GREEN: 2 (conversation-manage read path; task-status envelope)
- FAILED: 3 (deep-research; workspace [partial: 2/5 surfaces green]; design sub-MCP; send-prompt)
- DEFERRED_QUOTA: 0
- GUARD_OK: covered within #2 (destructive ops correctly refused / not in schema)

Note: #3 workspace had 2 of 5 surfaces GREEN (projects, appearance) but 3 failed, so the tool as a whole is FAILED. #1b task-status is the wiring-OK sub-result of the #1 lane.

## Per-tool status table

| id | tool | status | one-line result |
|----|------|--------|-----------------|
| 1  | webai:claude:deep-research | FAILED | ELEMENT_NOT_FOUND on stale composer "+" menu selector; no task_id produced |
| 1b | webai:task-status | VERIFIED_GREEN | valid `{status,errorCode}` envelope; couldn't drive a real Claude task (deep-research failed pre-queue) |
| 2  | webai:claude:conversation-manage | VERIFIED_GREEN | search -> results_count:30; destructive ops absent from action enum (refused); sidebar_options -> HUMAN_HANDOFF_REQUIRED (honest) |
| 3  | webai:claude:workspace | FAILED | projects + appearance GREEN; integrations/skills/style_presets fail (same stale "+" selector) |
| 4  | webai:claude:design:* | FAILED | create-project + get-html leak raw Playwright timeouts; surface is live & provisioned (NOT quota) |
| 5  | webai:claude:send-prompt --model sonnet --thinking | FAILED | --tab-url-contains ignored; always lands on /code (no model selector) -> MODEL_SELECTION_DRIFT; no prompt sent |

## Artifact sha256s

None. No artifact was produced:
- Design create-project failed before any project/HTML existed (no savedPath, no sha256).
- get_html forbidden-field check (html/dom/screenshot) could not be performed because the tool never produced output.
- deep-research produced no task_id; send-prompt sent no prompt (wait_ms:0, verified by live read — no conversation created).

## Output files

- /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify-claude.json
- /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream5/verify-claude.md

## Root-cause notes for every FAILED tool

### #1 deep-research — FAILED
Root cause: stale composer "+" menu selector. Tool waits for `#composer-plus-btn, button[aria-label="Attach content"], button[aria-label="Add content"]`. Live `browser:read` of claude.ai/new shows the real composer control is "Add files, connectors, and more" / "Upload files" — none of the three selectors match the current Claude DOM. Deep-research enters research mode through that "+" menu, so it errors out before queueing. Honest contract error (ELEMENT_NOT_FOUND), no fabricated success. Fix: update the composer-plus selector set to current Claude DOM.

### #3 workspace — FAILED (2/5 green)
GREEN: `projects` (-> claude.ai/projects), `appearance` (-> claude.ai/customize). Clean reads, no forbidden fields.
FAILED: `integrations`, `skills`, `style_presets` — identical root cause as #1: these surfaces are reached via the composer "+" menu, whose selector set is stale. Fix is shared with #1.

### #4 design sub-MCP — FAILED (NOT a quota deferral)
The Design surface is live and provisioned: live read of claude.ai/design shows "Project name" input, Wireframe/High fidelity/Create buttons, and an existing design "Hello Test Card". The `input[placeholder="Project name"]` element EXISTS in the live DOM at probe time. Two defects:
1. Tab/navigation defect: create-project times out waiting for a selector that is valid on the live /design page — the sub-MCP is not landing on / operating that page (consistent with the Claude tab-resolution bug in #5).
2. Contract violation: it leaks raw Playwright `page.waitForSelector: Timeout ... exceeded` strings instead of a stable contract code (should be ELEMENT_NOT_FOUND or POSTCONDITION_TIMEOUT). Same for get-html (`iframe[data-testid="html-viewer-iframe"]`).
Because create-project failed, generate/get_html/present could not be chained; no artifact, no sha256, and the get_html forbidden-field assertion could not be evaluated.

### #5 send-prompt (--model sonnet --thinking) — FAILED
Root cause (a): `--tab-url-contains` is ignored by the Claude send-prompt tab resolver. Both with `claude.ai` and explicit `claude.ai/new`, it resolved to the claude.ai/code (Claude Code) tab (`chat_url:"https://claude.ai/code"`).
Root cause (b): the /code surface has no model dropdown, so model selection cannot be applied -> MODEL_SELECTION_DRIFT (expected_model sonnet, model_used null). `wait_ms:0` and a follow-up live read of claude.ai/new confirm NO prompt was submitted (no side effect). Fix: make the Claude send-prompt tab resolver honor `--tab-url-contains` (and prefer a /new or /chat tab over /code).

## Cross-cutting

A single stale-selector defect (composer "+" menu) blocks #1 and 3/5 of #3. A single tab-resolution defect (filter ignored, defaults to /code) blocks #5 and is the likely cause of #4's navigation failure. Two targeted fixes (composer-plus selector refresh; Claude tab-resolver honoring --tab-url-contains) plus wrapping the design sub-MCP raw Playwright errors in contract codes would address all FAILED items. conversation-manage and task-status are sound. No safety issues: no prompt was ever sent, no destructive op executed, guard/refusal behavior was correct and respected.
