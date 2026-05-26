# Post-ship fix wave 8 — iframe race + remaining clusters (partial salvage)

- Generated: 2026-05-26T11:00Z
- Codex self-STOPPED at 3/10 PASS gate failure; orchestrator salvages legit fixes (Cluster B fully fixed + Cluster A partial).
- 10 deep live-probes captured (iframe-race, claude-pptx-chip, managed-cdp selectors)

## Per-yaml result

| Yaml | Cluster | Result | Note |
| --- | --- | --- | --- |
| `gemini-canvas-edit` | A | **PASS** | iframe-race investigation + clickClaudeDesignPresentWithCdp pattern works for outer gemini canvas |
| `gemini-canvas-to-docs-mgr` | A | FAIL | COMMAND_TIMEOUT — docs export path still needs different selector |
| `gemini-gemini-canvas-edit-mgr` (dup) | A | FAIL | canvas_html_before/after empty (different yaml fixture, edge case) |
| `gemini-generate-video-ext` | B | **PASS** | toggleGeminiTool wiring complete |
| `gemini-music-generate-chain` | B | **PASS** | toggleGeminiTool wiring complete |
| `claude-design-generate-mgr` | E#25 | FAIL | Claude design `get-html` timeout |
| `claude-design-present-mgr` | E#26 | FAIL | Claude design `present` timeout |
| `claude-generate-file-pptx-ext` | F#30 | FAIL | CDP timeout on artifact-click |
| `gemini-image-draft` | D residual | FAIL | managed-cdp selector drift on Gemini image menu |
| `research-database-search-dry-run` | D residual | FAIL | managed-cdp selector drift on CNKI |

## Ship-worthy

1. **`src/mcp/geminiExtensionHelpers.ts`** — `toggleGeminiTool` for video + music-chain wired (Cluster B). Verified 2/2 PASS.
2. **`src/mcp/tools.ts`** — Gemini canvas edit outer-frame fix verified PASS; Claude Design `clickClaudeDesignPresentWithCdp` direct-CDP bypass added (didn't fix the timeout but provides escape hatch for future).

## Deferred (left for future wave / issue-fix-loop)

- gemini-canvas-to-docs: docs export uses different selector / OAuth flow
- gemini-canvas-edit-mgr (dup fixture): empty html — yaml fixture sets up the test differently
- Claude design generate/present: get-html and present endpoints have a deeper hang; CDP probe captured for follow-up
- Claude pptx: CDP connect timeout suggests claude tab handoff race; needs separate investigation
- Managed-CDP residual: live-probed Gemini image menu + CNKI selectors captured; selector-drift fix needs separate focused wave

## 8-lock spot check (unchanged)

- pkg `2.1.0` / contract `consumer-contract-2.1.0`
- cmds 232 / errs 40 / webai_ 81 / research_ 121 / wah_ 8
- golden `tests/golden/listMcpTools.236.json`

## Net post-sweep delta (W2v2 → W8)

- B9 baseline: 18/63 PASS (~29%)
- Post-W5: 42/63 PASS
- Post-W6: 43/63 (+ claude-design-present text/html fix)
- Post-W7: ~49/63 (+ chatgpt 6 generate-file/canvas/web-search/codex PASS, minus W5 overlap)
- Post-W8 (this wave): ~52/63 PASS (+gemini canvas-edit + video + music-chain)

**Net cumulative improvement: 18/63 → ~52/63 (~83% PASS rate, +189% relative)**
