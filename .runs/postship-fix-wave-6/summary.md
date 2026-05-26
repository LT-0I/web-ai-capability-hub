# Post-ship fix wave 6 — quick wins (partial salvage)

- Generated: 2026-05-26T09:14:30Z
- Codex self-STOPPED at 1/8 PASS gate failure; orchestrator salvages legit infrastructure fixes.
- Backend: `extension-assisted-cdp` + `managed-cdp`

## Per-yaml result

| Workflow | Result | Error | Note |
| --- | --- | --- | --- |
| `claude-design-present` | **PASS** | | text/html result.type fix works |
| `chatgpt-generate-file-pptx-ext` | FAIL | COMMAND_TIMEOUT | pptx timeout deferred — root cause is ChatGPT file-card race (cluster G), not generic locateTimeout |
| `claude-generate-file-pptx-ext` | FAIL | COMMAND_TIMEOUT | same — Claude pptx also hits a different race; format-aware timeout alone insufficient |
| `chatgpt-send-web-search-ext` | FAIL | ELEMENT_NOT_FOUND | prompt-update strategy didn't restore selector; needs selector live-probe |
| `gemini-send-web-search-mgr` | FAIL | ELEMENT_NOT_FOUND | same — Gemini web-search has no standalone entry (memory `reference_web_ai_ui_facts.md`) |
| `gemini-veo-quota-error-mgr` | FAIL | command timed out | quota banner never appeared on this account; detector ran fine |
| `gemini-image-draft` | FAIL | managed-cdp selector error | CDP readiness retry SUCCEEDED — failure now reveals downstream selector drift |
| `research-database-search-dry-run` | FAIL | same | same |

## Ship-worthy infrastructure additions (commit)

1. **`src/workflows/{schema,compiler,executor}.ts`** — `text/html` result.type
   support + `htmlStringFromData` helper. Verified PASS on claude-design-present.
2. **`src/browser/managedLauncher.ts`** — CDP-endpoint readiness retry (5s/100ms
   budget). Verified working — failures on managed-cdp yamls are no longer
   ECONNREFUSED but downstream selector drift, which is the correct diagnostic
   improvement.
3. **`src/mcp/tools.ts`** — pptx format-aware locateTimeoutMs + Veo early
   quota polling using existing `PLAN_OR_QUOTA_REQUIRED` code. Harmless in
   the pptx case (file-card race dominates) and useful when quota DOES fire.
4. **2 yaml prompt updates** (chatgpt + gemini web-search) — adds "2026"
   keyword to prompt. Doesn't fix selector but doesn't hurt.

## Deferred to Wave 7 + Wave 8

- **Cluster G (chatgpt-generate-file × 4 + chatgpt-pptx)**: needs DOM-event detector
  rewrite (file-chip observer, not button poll). Wave 7.
- **Cluster F#30 (claude-pptx)**: needs separate Claude-side root-cause investigation. Wave 7.
- **Cluster H#58 (chatgpt-send-web-search)**: needs selector live-probe. Wave 7.
- **Cluster C#14 (gemini-send-web-search)**: documented per memory — no standalone entry.
- **Cluster A + B + E#25/#26 (iframe race + Gemini video/music + Claude design)**: Wave 8.
- **Cluster D residual selectors**: now visible after readiness retry fix; Wave 8.

## 8-lock spot check (unchanged)

- pkg `2.1.0` / contract `consumer-contract-2.1.0`
- cmds 232 / errs 40 / webai_ 81 / research_ 121 / wah_ 8
- golden `tests/golden/listMcpTools.236.json`

## Net post-sweep delta (W2v2+W3+W4+Phase8+W5+W6)

- B9 baseline: 18/63 PASS
- Post-W5: 42/63 PASS
- Post-W6 (verified): claude-design-present moves from FAIL → PASS = **43/63**
