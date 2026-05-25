# G8 blocker — gemini-deep-research-mgr COMMAND_TIMEOUT

Gemini Deep Research was submitted through the required managed-CDP/reuse-conversation path, but the bucket completion gate did not close within the 15 minute cap.

- service: gemini
- profile: gemini-9225
- backend: managed-cdp
- required flag: --reuse-conversation used
- conversation: https://gemini.google.com/app/260e7fc538aef136
- mcp_tool: webai_gemini_deep_research
- task_id: task_1779653801617_5f5424d1e879
- final status: FAIL_CLOSED_COMMAND_TIMEOUT
- final errorCode: COMMAND_TIMEOUT
- completion gate: report path non-empty + exists + size > 4096; OR response_text contains 3 framework names
- artifact: none
- evidence: .runs/capability-explore-2026-05-25/gemini/gemini-deep-research-mgr.json
- recipe: examples/workflows/gemini-deep-research-mgr.yaml

## What happened

1. The first CLI attempt failed because the Deep research menu item is hidden when the Gemini composer is in Flash-Lite / prior Music mode.
2. The Gemini UI was switched to Pro via managed-CDP; Deep research became visible under Upload & tools.
3. A later CLI retry succeeded and returned queued task_id task_1779653801617_5f5424d1e879.
4. The visible UI entered Deep Research and showed "Researching websites..." then "Analyzing results...", with source/synthesis progress mentioning OpenAI Agents SDK, Google ADK, and Mastra.
5. No fresh downloadable report file appeared in /tmp/explore-2026-05-25/gemini, and the latest model response stayed in the researching/analyzing state with Stop response visible through the timeout.

## Guardrail note

A previous monitor saw /tmp/explore-2026-05-25/gemini/Kitchen_Table_Pace.mp3, but that file predates G8 and belongs to G5 music; it was rejected as a false artifact.

## Required next action

Treat this bucket as failed (exit 1). Re-run only with a longer Deep Research timeout or after adding a report-specific completion/download detector. Do not merge this as OK_MANAGED_CDP_ONLY.
