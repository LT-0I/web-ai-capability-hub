Done and pushed.

- Commit: `a3b0874` — `webai: phase 7 bucket 7 — chatgpt canvas/pulse + gemini canvas + claude design extension drivers (9 tools)`
- Pushed: `origin/main`
- Acceptance report: `.omc/codex-out/phase7-bucket-7-canvas-pulse-design.md`

Validation:
- `npm run build` → pass
- `npm test` → `677/677` pass
- B7 routing test → `3/3` pass, covering all 9 tools × extension/managed/invalid cases
- Golden/codemod targeted tests → `5/5` pass
- 8-lock held: `1.0.0`, `consumer-contract-1.10.0`, `191/40/121/8/39`

Live smoke:
- `chatgpt_pulse_get` → ok
- `claude_design_get_html` → ok
- `chatgpt_canvas_export` → non-blocking live failures recorded verbatim in the report:
  - `CHROME_EXTENSION_NOT_CONNECTED`
  - retry: `ELEMENT_NOT_FOUND`
- Mutating/state-changing 6 tools skipped and recorded as deferred to B9 sweep.

Left unstaged/unrelated:
- `.omc/codex-out/phase7-bucket-5-deep-research.md`
- `.omc/codex-out/phase7-bucket-6-chatgpt-codex.md`
- `docs/plans/web-research-literature-download-phase8.md`
- `.runs/phase7-bucket-7/` live-smoke evidence files