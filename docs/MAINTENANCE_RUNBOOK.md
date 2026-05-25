# Maintenance Runbook — periodic tool refresh

When a web-AI front-end (ChatGPT / Claude / Gemini) ships a UI change, or a
research database changes its layout/flow, our tools drift. This runbook is the
**standardized process** to detect, fix, and re-certify them. Run it on a cadence
(or whenever a smoke goes RED). It encodes the lessons from the
`mcp-health-campaign-2026-05-16` campaign so we stop re-litigating them — every
cycle just walks this flow.

> Hard rules still apply: `CLAUDE.md` §2 (Codex via `omx exec` + prompt file;
> orchestrator never edits `src/`), §2.3 (honest failure, no fallback), §2.4
> (contract round-trip). This runbook is *how*; those are *non-negotiable*.

---

## 0. Cross-cutting lessons (the guardrails — internalize before running)

1. **Honest-failure boundary, never per-tool fallback.** RED recurred for ~5
   rounds because fixes were local band-aids. The fix is structural: drift must
   surface a stable contract error code (`ELEMENT_NOT_FOUND`, `LOGIN_REQUIRED`,
   `ARTIFACT_DOWNLOAD_TIMEOUT`, `IFRAME_NOT_FOUND`, …). No silent graceful
   fallback, no local-synthesized artifact.
2. **explore → 固化 → re-smoke, not whack-a-mole.** On RED: read the evidence
   JSON (`triedFrames`, `pageUrl`, `frameCount`, error code); if blind 固化
   stalls, escalate to an **Opus-4.7-max read-only live DOM probe** → write a
   precise `file:line` Codex prompt → gate → commit → **exactly one** re-smoke.
   Each layer is a distinct evidence-confirmed defect, not the same bug again.
3. **Clean build before every live smoke.** `rm -rf dist && npm run build`
   first. A stale `dist` once masked ~5 rounds of real fixes.
4. **Serialize Codex on a shared tree.** >2 concurrent `omx exec` dispatches
   clobber each other's sibling-file edits. Dispatch one at a time and commit
   between, OR verify each landed (grep marker + `git status` scope) before the
   gate. (memory `feedback_serial_codex_shared_tree`)
5. **Contract §2.4 round-trip is one dispatch.** Any surface/output/arg change
   updates `configs/consumer-contract.json` + `docs/CONSUMER_CONTRACT.md` +
   `tests/consumerContract.test.ts` together. Additive same-minor = **no
   version bump**. Never weaken a test to make it pass.
6. **Authoritative source must be re-synced last.** Code + contract is not
   "done" until `docs/capability-library.json` is updated AND re-imported into
   the SQLite `integration_registry` (memory
   `project_capability_library_source_of_truth`). This step was the gap that
   prompted this runbook — it is now Step 5 below, mandatory.
7. **Browser launch discipline.** `browser:launch --profile <name> --cdp-port
   <port>`, never `browser:start`. Claude lane = `claude-9224` (port 9224).
   Serialize the three chrome launches (SingletonLock race). Relaunch needs
   `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority` or Cloudflare blocks
   the live UI.
8. **Cheap models.** Sonnet for orchestration; ChatGPT Thinking-class, never
   Pro; Opus-4.7-max only for hard non-converging probe/subagent work.
9. **Doc-driven inventory.** Feature scope comes from each service's own help
   center, never from another service as a ceiling
   (memory `feedback_doc_driven`).

---

## 1. Flow A — Web-AI UI-drift refresh (ChatGPT / Claude / Gemini)

### A1. Launch & smoke (detect drift)
```bash
# serialize — never parallel (SingletonLock); DISPLAY required for live UI
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  <browser:launch chatgpt 9223> ; <claude claude-9224 9224> ; <gemini 9225>
```
Run one positive live smoke per drifted surface via
`.omc/skills/web-ai-live-smoke/SKILL.md`. GREEN → record & stop for that tool.
RED / honest-wall → A2.

Optional drift pre-detection (cheap, before full smoke):
```bash
node dist/src/cli.js snapshot:capture --site <svc> --json
node dist/src/cli.js snapshot:diff --site <svc> \
  --previous data/site-maps/old.json --current data/site-maps/new.json --json
```

### A2. Root-cause (evidence first, no blind retry)
- Read the smoke evidence JSON. Classify: **genuine wall** (Cloudflare /
  quota / login) → report honestly, do NOT "fix"; or **real drift** → A3.
- If blind 固化 stalled before, dispatch an **Opus-4.7-max read-only live DOM
  probe** (no edits) to pin the exact selector/iframe/nav defect and the
  precise `src/mcp/tools.ts:line`.

### A3. 固化 (dispatch the fix to Codex)
Write `.omc/codex-prompts/<task>.md` (task, repo path, constraints, acceptance,
forbidden, evidence, stop condition). Then:
```bash
omx exec -C /home/l1u/workspace/noeticmind/web-ai-capability-hub \
  --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
  -o .omc/codex-out/<task>.md - < .omc/codex-prompts/<task>.md
```
Scope tightly (only the drifted selector/nav). Prefer role/name/semantic
anchors; add selector candidates only with evidence; keep old selectors as
fallbacks only while confidence is uncertain. Include the §2.4 contract
round-trip in the SAME prompt if the surface changed. Serialize if multiple
fixes (lesson 4).

### A4. Gate (authoritative)
```bash
rm -rf dist && npm run build      # BUILD_EXIT 0
npm test                          # full suite green (current count)
# locks: pkg 0.7.0, contract consumer-contract-1.5.0, 32 error codes,
#        37 webai_ / 121 research_ tools — unchanged unless deliberate bump
git status --porcelain | grep -vE '^\?\?'   # scope = only intended files
```

### A5. Re-smoke (exactly once) → commit → **Step 5 sync**.

---

## 2. Flow B — Research-database tool refresh

Same backbone, DB-specific detection:

- **B1. Smoke** the affected `research:*` tool(s) via the live-smoke skill.
  Research-DB uses a *separate* CDP MCP path (memory
  `feedback_research_db_separate_mcp_cdp`).
- **B2. Classify** per memory `project_capability_library_source_of_truth`:
  - `IMPLEMENTED_GREEN` that re-smokes GREEN → leave it, do **not** re-explore.
  - GREEN→RED (real drift) → A2-style Opus-4.7-max read-only probe.
  - Honest wall (managed challenge / quota / env-artifact) → report, don't fake.
- **B3. 固化 + B4. Gate + B5. Re-smoke** identical to A3–A5.
- Close the browser when mapping/Phase-A is done or parked — host load
  (memory `feedback_close_browser_after_done`).
- Parallel explore/固化 waves: dispatch the next mapping wave (≤10
  Opus-4.7-max agents) the moment the prior wave's 固化 goes out; never idle
  mapping (memory `feedback_parallel_explore_fixate_waves`).

---

## 3. Step 5 — Authoritative-source sync (BOTH flows, mandatory, last)

A change is not done until the capability ledger reflects it.

1. Edit the affected entry in `docs/capability-library.json`: bump
   `last_update`, append the change + commit hash to `evidence`, update `notes`.
   Do **not** inject stray `webai_` / `research_` tokens into `notes` — the
   importer scrapes those into `mcp_tool`.
2. Re-import the full seed into the SQLite `integration_registry` (upsert by
   `feature_id`). CLI: `node dist/src/cli.js capability:library:import
   docs/capability-library.json --json` once `dist` is built; or replicate
   `CapabilityLibraryImporter` logic faithfully (same
   `recordsFrom`/`featureIdFrom`/`statusFrom`/`mcpToolFrom` + the
   `ON CONFLICT(feature_id) DO UPDATE` upsert).
3. Verify: row count unchanged (upsert, no dup/loss), all `imported_at`
   refreshed to today, the target row's `status` / `mcp_tool` correct, status
   distribution unchanged. `.sqlite` is a git-untracked data artifact (not
   committed); `docs/capability-library.json` IS committed.

> Runtime capability snapshots (`capability:update` / `capability:query`) are a
> separate, lower-stakes refresh of the `capabilities` table and do **not**
> replace Step 5:
> ```bash
> node dist/src/cli.js capability:update --target <svc> --profile <svc> --json
> node dist/src/cli.js capability:query  --target <svc> --text "upload" --json
> ```

---

## 4. One-page checklist (run every cycle)

- [ ] Launch chromes serially (`browser:launch`, claude-9224, DISPLAY set)
- [ ] Smoke each candidate surface (live-smoke skill)
- [ ] GREEN → record. RED → read evidence JSON → classify wall vs drift
- [ ] Drift → Opus-4.7-max read-only probe → precise `file:line`
- [ ] `.omc/codex-prompts/<task>.md` → `omx exec` (serialize; §2.4 in-prompt)
- [ ] Gate: clean build + full test + locks + git scope
- [ ] Exactly one re-smoke → commit
- [ ] **Step 5**: capability-library.json edit + integration_registry re-import + verify
- [ ] Honest walls reported, never faked; no fallback/synthesis; no test weakened
- [ ] New durable lesson? → encode via `omc:learner` + memory pointer

---

## 5. Scheduler note

`scheduled_jobs` live in the database; `scheduler:run` is a local foreground
entry point and intentionally does **not** create OS-level scheduled tasks.
The "cadence" for this runbook is operator-driven: run Flow A + Flow B on a
schedule, or on the first RED. Closing Step 5 every cycle keeps
`integration_registry` — the authoritative source — in lockstep with shipped
behavior, which is the exact failure mode this runbook exists to prevent.


---

### Literature worker daemon (Phase 8)

Start (foreground): `node dist/src/literature-worker.js`
Start (background): `nohup node dist/src/literature-worker.js > /tmp/lit-worker.log 2>&1 &`
Inspect queue: `sqlite3 data/literature-queue.sqlite 'SELECT status, COUNT(*) FROM download_queue GROUP BY status'`
Inspect 24h ledger: `sqlite3 data/literature-rate-limit.sqlite 'SELECT db_slug, COUNT(*) FROM download_ledger WHERE downloaded_at > strftime("%s","now","-24 hours")*1000 GROUP BY db_slug'`
Stop: SIGTERM the process; in-flight downloads finish; new claims stop.

Schemas + cap (20/DB/24h) are immutable from caller's perspective.
DO NOT bypass the ledger "just for testing" — tests hit the ledger too.
