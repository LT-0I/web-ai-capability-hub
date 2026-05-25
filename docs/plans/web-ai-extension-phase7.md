# Phase 7 — Extension-Assisted-CDP Becomes the Base (40 webai_ tools)

**Status**: ACTIVE 2026-05-25.
**Decision**: Slice B (full 40-tool migration), managed-cdp paths RETAINED as
opt-in fallback (callers can still pass `backend: "managed-cdp"`).
**Driver**: orchestrator (Claude Code) dispatches each bucket to Codex via
`omx exec --xhigh`; cross-model review per `feedback_cross_model_review` after
every bucket; serial on the shared tree per `feedback_serial_codex_shared_tree`.

## Why this phase

After Phase 1-6 (vendor intake → ChatGPT MVP → hardening → Gemini+Claude
lanes), only **7 of 40** webai_ tools have an `extension-assisted-cdp` backend
opt-in. The remaining **33** are managed-cdp-only. To make the extension the
true base we need: drivers for all 33 + default flip on the 7 + contract major
bump.

## Scope

**IN**: 40 `webai_*` tools (the 33 missing extension drivers + the 7 default
flip).

**OUT**:
- `research_*` (121) — academic-DB CDP, no extension equivalent intended.
- `wah_*` (8), `browser_*` (6), `workflow_*` (2), `consumer_*` (1) — not
  per-service web-AI plumbing.
- `managed-cdp` code removal — DEFERRED (kept as fallback). See `B9` notes.

## Buckets (serial, ≤8 tools each)

| # | Tools | Count | Order rationale |
|---|---|---|---|
| **B1** | chatgpt_send_prompt, gemini_send_prompt | 2 | Lowest risk; sibling of shipped claude_send_prompt. **Also serves as Phase 7 VALIDATION SLICE — 80-prompt A/B gate (extension vs managed-cdp) decides whether B2-B8 launch at all.** |
| **B2** | chatgpt/claude/gemini select_model | 3 | Pattern shipped in `a183a18` (post-refactor W1); short DOM-ops. |
| **B3** | chatgpt_upload_and_query, chatgpt_generate_file, gemini_upload_and_query | 3 | Mirror `uploadAndQueryClaudeWithExtensionBackend` + `generateClaudeFileWithExtensionBackend`. |
| **B4** | {chatgpt,claude,gemini}_{workspace,conversation_manage} | 6 | Lighter DOM ops; read+mutate mix. |
| **B5** | {chatgpt,claude,gemini}_deep_research | 3 | Multi-step submit + long poll; risk in completion detection. |
| **B6** | chatgpt_codex_{submit_task,list_envs,task_status,get_diff} | 4 | Isolated single-service surface; codex/cloud control. |
| **B7** | chatgpt_canvas_export, chatgpt_pulse_{get,onboard}, gemini_canvas_to_docs, gemini_canvas_edit, claude_design_{create_project,generate,get_html,present} | 8 | Highest complexity (canvas embeds + design panels) — DO LAST. |
| **B8** | webai_task_status, gemini_music_download_track, gemini_music_task_status | 3 | Polling shape. |
| **B9** | Default flip (7 tools) + contract 1.10.0→2.0.0 + pkg 1.0.0→2.0.0 + golden re-bake + 63 workflow regression | — | Major release cut. |

Total tool migrations: B1-B8 = 32 new drivers + B9 flips 7 existing + 1 driver
(webai_task_status is in B8 not in the 7 done set) → **33 new drivers + 7
default flips = 40 tools end state**.

## Per-bucket protocol (every bucket)

1. **Author prompt**: `.omc/codex-prompts/phase7-bucket-N-<slug>.md`
   - Constraints: 8-lock contract held; managed-cdp paths untouched
     (parallel `if (backend === "extension-assisted-cdp") return …;` arm only);
     no `Closes #N`-style auto-close keywords; commit via `-F msgfile`.
   - Required pattern (mirror `sendClaudePromptWithExtensionBackend`):
     ```ts
     const lease = acquireProfileLease(args.profile);
     let backend: any;
     try {
       backend = getBackend("extension-assisted-cdp", {
         transport: "http",
         httpBridgeUrl: <serviceExtensionHttpBridgeUrl>(args)
       });
       await backend.ping();
       const page = await <service>ExtensionPage(backend, args);
       return await <tool>InExtensionPage(args, page, started);
     } catch (error: any) { return <tool>ExtensionErrorOutput(args, started, error); }
     finally {
       await backend?.finalize?.().catch?.(() => undefined);
       releaseProfileLease(args.profile, lease);
     }
     ```
   - Exit gates: `rm -rf dist && npm run build && npm test`; live smoke each
     tool via `node dist/src/cli.js webai:<svc>:<tool> --profile <svc>-<port>
     --backend extension-assisted-cdp …`; smoke evidence mtime newer than
     `dist/src/mcp/tools.js` per `feedback_fresh_smoke_only`.
2. **Dispatch**: `omx exec -C $PWD --skip-git-repo-check
   --dangerously-bypass-approvals-and-sandbox -c model_reasoning_effort="xhigh"
   -o .omc/codex-out/phase7-bucket-N-<slug>.md - < .omc/codex-prompts/phase7-bucket-N-<slug>.md`.
3. **Cross-model review**: codex writes → claude opus reviewer subagent reads
   the diff, writes adversarial tests, executes, reports back. No
   self-approval.
4. **Ship**: `git commit -F /tmp/phase7-bucket-N.msg` (no auto-close keywords;
   author = n0the2nt1ge2-png); `git push origin main`.
5. **Memory**: append per-bucket state line to `project_chrome_extension_phase1.md`.

## Locks during B1-B8 (must hold)

- pkg `1.0.0` (no bump until B9)
- contract `consumer-contract-1.10.0` (no bump until B9)
- 191 commands (no new commands; only new opt-in `backend` arm per tool)
- 39 error_codes (extend only if a NEW failure mode surfaces — must be
  contract-rooted, not invented)
- webai_ 40 / research_ 121 / wah_ 8
- `tests/golden/listMcpTools.195.json` (body augmented per bucket with
  `backend?` field on newly-wired tools; tool COUNT unchanged)
- closure regression ≥32/<2 reds after each bucket via
  `.runs/capability-explore-2026-05-25/closure/run-closure-r8.mjs` clone.

## B9 final bump (after B1-B8 all merged + reviewed)

- pkg `1.0.0` → **`2.0.0`** (breaking: default backend semantics)
- contract `consumer-contract-1.10.0` → **`2.0.0`** (NB: major; semver
  signals breaking default for all 7 currently-opt-in tools — callers
  relying on managed-cdp default behavior MUST add `backend: "managed-cdp"`)
- 7 default-flip diff localized to the `args?.backend || …` lines:
  `webai_chatgpt_generate_image`, `webai_gemini_generate_image`,
  `webai_gemini_generate_video`, `webai_gemini_music_generate`,
  `webai_claude_send_prompt`, `webai_claude_upload_and_query`,
  `webai_claude_generate_file`.
- Golden re-bake → `tests/golden/listMcpTools.<N>.json` (count may rise if
  any bucket revealed an undocumented exit field; otherwise body-only).
- 63 workflow yaml regression via the closure runner.
- `docs/MIGRATION_v3.2.md` ← Phase 7 migration appendix (callers that depend
  on managed-cdp must opt back in).

## Anti-slop guardrails (memory-rooted)

- NO graceful fallback layers inside the extension drivers — surface
  contract error codes from the `CHROME_EXTENSION_*` taxonomy already
  shipped in Phase 3.
- NO new error codes invented per bucket — if a failure mode doesn't fit
  the existing 39, STOP and surface to orchestrator for contract decision.
- NO `Closes #N` / `Fixes #N` in commit messages (memory:
  `feedback_no_auto_close_keywords`).
- NO `git commit -m` with multi-line/special chars — `-F msgfile` ONLY
  (memory: `feedback_commit_via_msgfile`).
- Per-bucket smoke evidence must have mtime newer than the rebuilt
  `dist/src/mcp/tools.js` (memory: `feedback_fresh_smoke_only`).
- Live smoke before ship — offline tests don't validate live-CDP fixes
  (memory: `feedback_live_smoke_before_ship`).
- Codex always `-c model_reasoning_effort="xhigh"` per
  `feedback_codex_always_xhigh`.

## Status log (updated after each bucket)

- 2026-05-25 — Plan authored. B1 dispatched. B2-B9 queued.
