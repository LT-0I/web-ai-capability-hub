# Project post-ship sweep state — 2026-05-26

## Scope

Post-ship fix waves 1-5 covered the Phase 7 B9 live workflow baseline after the
v2.0 default-backend flip. The original baseline was 18/63 PASS. Wave 5
re-ran the full serialized 63-yaml suite against current HEAD and established a
new post-sweep baseline of 42/63 PASS.

## Wave deltas

| Wave | Focus | Shipped delta | Evidence |
|---|---|---:|---|
| 1 | Bridge-race / CDP launch readiness investigation | Blocker discovery; bridge race remained reproducible in the first wave and was not shipped as a standalone fix | `.omc/codex-out/postship-fix-wave-1-bridge-race.md`, `.runs/postship-fix-wave-1/` |
| 2 | Gemini selector hardening | Gemini selector cluster improved in targeted smoke; later full baseline shows 8/12 now pass | commit `0c13c8e`, `.omc/codex-out/postship-fix-wave-2-v2-gemini-concrete.md` |
| 3 | ChatGPT selector / GPTs hardening | ChatGPT selector cluster improved; later full baseline shows 6/8 now pass and no 429s during serialized wave-5 batch | commit `f66f96c`, `.omc/codex-out/postship-fix-wave-3-chatgpt-selectors-and-gpts.md` |
| 4 | Completion detector + CDP-readiness hardening | Completion cluster partially improved; later full baseline shows 5/13 now pass | commit `378fb16` |
| 5 | One-offs + full 63-yaml re-baseline | Fixed the Gemini Music task-status YAML fixture dependency, documented Claude managed-CDP stale ws-url cache handling, and captured final 42/63 baseline | `.runs/postship-fix-wave-5/regression-summary.md` |

## Final full-regression baseline

- Source: `.runs/postship-fix-wave-5/regression-summary.md`
- Batch discipline: strict serial; Gemini → Claude → other → ChatGPT; tab
  cleanup around every YAML; ≥10s sleeps between non-ChatGPT YAMLs; ≥30s
  sleeps between ChatGPT YAMLs; 429 retry/defer policy enabled.
- ChatGPT 429 detections: 0
- PASS: 42/63
- FAIL: 21/63
- Deferred due rate limit: 0

### Remaining failure buckets

| Error code | Count |
|---|---:|
| CHROME_EXTENSION_NOT_CONNECTED | 6 |
| COMMAND_TIMEOUT | 6 |
| ELEMENT_NOT_FOUND | 5 |
| UNKNOWN | 3 |
| ARTIFACT_DOWNLOAD_TIMEOUT | 1 |

### Cluster deltas from Phase 7 B9 baseline

| Cluster | Baseline remaining | Post-sweep remaining | Now passing |
|---|---:|---:|---:|
| Bridge race | 6 | 3 | 3/6 |
| Gemini selectors | 12 | 4 | 8/12 |
| ChatGPT selectors | 8 | 2 | 6/8 |
| Completion detectors | 13 | 8 | 5/13 |
| One-offs | 5 | 3 | 2/5 |

## Wave-5 decisions

- `gemini-gemini-music-task-status-ext.yaml` now creates a fresh Gemini Music
  task before polling status. The old gate assumed a prior workflow left an
  in-flight task; that was a YAML fixture dependency, not production code.
- Claude Design managed-CDP stale WebSocket failures are operator-runbook
  material. After restarting Chrome on 9224, purge `.runs/.../ws-url-cache` if
  present before rerunning managed-CDP one-offs.
- `gemini-image-draft` and `research-database-search-dry-run` remain managed-CDP
  launch-readiness failures before command execution, outside the default
  extension-assisted path.
- `claude-design-present` no longer reproduced the stale 9224 ws-url timeout in
  the full re-baseline; it now fails workflow schema validation on unsupported
  `result.type: text/html`.

## Validation snapshot

- `npm test`: 731/731 passing.
- 8-lock spot check unchanged: package `2.1.0`, package-lock `2.1.0`, contract
  `consumer-contract-2.1.0`, commands `232`, error codes `40`, `webai_` `81`,
  `research_` `121`, `wah_` `8`, golden `listMcpTools.236.json`.
- No `src/` changes were made in wave 5.
