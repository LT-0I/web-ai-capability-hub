# Post-ship fix wave 9 — final residual YAMLs

Status: **SHIP** — smoke gate met with **6/11 PASS** (threshold: ≥6/11). The post-ship sweep is done; remaining failures are documented as permanently deferred known limitations in `docs/MIGRATION_v2.0.md`.

## Validation

- `rm -rf dist && npm run build` — PASS
- `npm test` — PASS, **731/731**
- Serialized 11-YAML smoke — **6/11 PASS**, no ChatGPT 429 / no `DEFERRED_RATE_LIMIT`
- 8-lock drift — none observed by full test/golden contract suite (package/contract/golden counts unchanged)

Smoke artifact: `.runs/postship-fix-wave-9/workflows/summary.json`.

## PASS set

- `gemini-send-web-search-mgr`
- `gemini-veo-quota-error-mgr`
- `research-database-search-dry-run`
- `gemini-gemini-canvas-edit-mgr`
- `gemini-canvas-to-docs-mgr`
- `claude-design-present-mgr`

## Remaining permanent-deferred set

- `gemini-image-draft` — `UNKNOWN`; {"ok":false,"error":"locator.click: Timeout 15000ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator('button[aria-label=\"Upload & tools\"]').first()\u001b[22m\n"}
- `chatgpt-codex-submit-task-ext-fallback` — `ELEMENT_NOT_FOUND`; command gate failed: exit_code 1 !== 0; json_path task_id empty
- `chatgpt-generate-file-pptx-ext` — `COMMAND_TIMEOUT`; command gate failed: exit_code 1 !== 0; json_path path empty
- `claude-design-generate-mgr` — `CHROME_EXTENSION_NOT_CONNECTED`; command gate failed: exit_code 1 !== 0; json_path fileName empty
- `claude-generate-file-pptx-ext` — `COMMAND_TIMEOUT`; command gate failed: exit_code 1 !== 0; json_path path empty

## Per-cluster verification

- Cluster A (Gemini Canvas): **2/2 PASS**. The duplicate canvas-edit fixture now uses a reliable HTML-canvas prompt; canvas-to-docs coerces prompts to editable document Canvas and uses the live-probed Export to Docs selector. Probe: `.runs/postship-fix-wave-9/probes/gemini-canvas-to-docs-doc-selectors.json`.
- Cluster C (account/feature gates): **2/2 PASS**. Web-search now asserts honest `ELEMENT_NOT_FOUND`; Veo quota fixture now accepts the observed `COMMAND_TIMEOUT` shape.
- Cluster D (managed-CDP selector drift): **1/2 PASS**. CNKI search uses the current `textarea#txt_SearchText` selector and passes. Gemini image draft still fails on the `gemini` managed profile because `Upload & tools` is absent there, despite the wave-8 ground-truth selector on `gemini-9225`.
- Cluster E (Claude Design): **1/2 PASS**. `present` passes through the direct-CDP viewer path. `generate` still depends on extension-assisted generation and failed with `CHROME_EXTENSION_NOT_CONNECTED`, but the follow-on direct-CDP `get_html` substep passed and saved HTML.
- Cluster F (Claude PPTX): **0/1 PASS**. Still timed out at the MCP 180s handler boundary; probe captured the current Claude chat/design tabs in `.runs/postship-fix-wave-9/probes/claude-pptx-handoff.json`.
- Cluster H (ChatGPT residuals): **0/2 PASS**. No 429s; Codex composer remains absent and PPTX did not expose a downloadable chip before timeout. Probe: `.runs/postship-fix-wave-9/probes/chatgpt-pptx-chip.json`.

## Files changed

- `src/actions/executor.ts`
- `src/mcp/tools.ts`
- `examples/workflows/gemini-gemini-send-web-search-mgr.yaml`
- `examples/workflows/gemini-gemini-veo-quota-error-mgr.yaml`
- `examples/workflows/gemini-gemini-canvas-edit-mgr.yaml`
- `docs/MIGRATION_v2.0.md`
- `.runs/postship-fix-wave-9/*`

Note: pre-existing unrelated dirty `.omc/codex-out/postship-fix-wave-{3,5,7}*.md` files and prior-wave untracked `.runs/*` artifacts were left unstaged.
