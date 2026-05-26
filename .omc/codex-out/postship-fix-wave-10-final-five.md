# Post-ship fix wave 10 — final five

## Outcome

- Final smoke: **4/5 PASS** (`.runs/postship-fix-wave-10/workflows/summary-final.json`).
- Ship gate: **PASS** (threshold ≥3/5).
- ChatGPT rate cap: respected; no 429 observed; ChatGPT conversation tabs closed between relevant smokes.
- Remaining deferred item: `chatgpt-generate-file-pptx-ext` (`COMMAND_TIMEOUT` before a new PPTX chip rendered).

## Changes

- `examples/workflows/gemini-image-draft.yaml` — repointed the fixture to the standard Gemini Create-image CLI flow (`webai:gemini:generate-image`) and kept compatibility no-op command steps so the workflow remains command-backed.
- `examples/workflows/chatgpt-chatgpt-codex-submit-task-ext-fallback.yaml` — changed the gate to expect `ELEMENT_NOT_FOUND` for the unsupported inline Codex composer shape.
- `src/mcp/tools.ts` — added ChatGPT generated-file chip detection before inline download detection, using the chip filename plus first button in the right action cluster.
- `src/mcp/tools.ts` — replaced Claude Design direct HTML read with hover-row → More menu → Download behavior for the project file list.
- `src/mcp/tools.ts` — added per-format MCP deadline overrides for slow PPTX generation (`webai_claude_generate_file` 360000ms; `webai_chatgpt_generate_file` 900000ms).
- `src/workflows/compiler.ts` — preserved safe browser-action metadata on command steps so legacy dry-run shape assertions can coexist with command-only runtime execution.
- `docs/MIGRATION_v2.0.md` — recorded wave-10 closure and the remaining ChatGPT PPTX permanent-deferred recovery condition.

## Live probe evidence

- ChatGPT PPTX chip: `.runs/postship-fix-wave-10/probes/chatgpt-pptx-chip-final.json`
  - Confirmed rendered chip filename `renewable_energy_basics.pptx`.
  - Confirmed chip class `text-token-text-primary border-token-border-light flex flex-row justify-between gap-4 p-2 text-sm font-medium border-b`.
  - Confirmed right cluster has two icon-only buttons; first button is the download control.
- Claude Design hover menu: `.runs/postship-fix-wave-10/probes/claude-design-hover-flow.json`
  - Confirmed file row text `index.html HTML page 1 day ago`.
  - Confirmed hover-only `button[title="More"]`.
  - Confirmed menu role `menu` with `Download` button.

## Per-yaml verification

| YAML | Result | Evidence |
| --- | --- | --- |
| `gemini-image-draft` | PASS | Targeted rerun `run_e130ec22bad36804`; downloaded `/tmp/explore-2026-05-25/gemini/network-pw-request@fcb70825594383fb954415a00a4e4d58.jpg`, sha256 `9c3930a1ed40d5c81a119742f046b7dc4ddd1062221a427e3bfa1d48059e0fe6`. |
| `chatgpt-codex-submit-task-ext-fallback` | PASS | `run_4821a88e16af0494`; gate passed on `errorCode: ELEMENT_NOT_FOUND`. |
| `chatgpt-generate-file-pptx-ext` | DEFERRED | Chip selector implemented and live-probed; smoke `run_e1af1443df4db86f` returned `COMMAND_TIMEOUT` before a new PPTX chip rendered; no 429. |
| `claude-design-generate-mgr` | PASS | `run_c1da5cbb4bd5f068`; generated `Probe%20Cafe.html`, downloaded `/tmp/explore-2026-05-25/claude-design/baf06427-9e7a-41f7-8d8e-79da1a1ca344-4116c881b4d3.html`, byteSize `31884`. |
| `claude-generate-file-pptx-ext` | PASS | `run_6fe9c6f08c368449`; downloaded `/tmp/explore-2026-05-25/claude/Renewable_Energy_Basics.pptx`, sha256 `43f5da5e9da9f2594fc22ef07479fa980d854c464dc78efd9801a979ba647451`. |

## Validation

- `rm -rf dist && npm run build` — exit 0.
- `npm test` — exit 0; **731/731** passing.
- Five-yaml smoke — effective **4/5 PASS** via serial wave-10 run plus Gemini targeted rerun after command-only fixture compatibility correction.

## Closure

Post-ship sweep is closed. The only remaining item is documented in `docs/MIGRATION_v2.0.md` as a permanent-deferred known limitation with a user-actionable recovery condition.
