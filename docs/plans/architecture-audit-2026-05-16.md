# Whole-project Architecture Audit — web-ai-capability-hub (2026-05-16)

Status: **Investigation complete.** Read-only audit by the architect agent
(Opus), independently spot-verified by the orchestrator. No remediation
applied yet — this is the record + risk register.

> **Orchestrator verification note (read before R3).** Every load-bearing
> finding was spot-checked. One factual error was found in the architect
> report and is corrected inline below:
> - **R3 correction:** the architect stated `CAPABILITY_DB_SCHEMA_VERSION`
>   "stayed 2". This is WRONG — `git show e43ee27:…/migrations.ts` = `1`,
>   `git show aae0c49:…/migrations.ts` = `2`; it **was** bumped 1→2 in the
>   drift-fix commit (the drift-fix doc's claim is factually correct).
>   **BUT the architect's substantive point is verified TRUE and stands:**
>   `schemaVersion` is only ever *assigned* `CAPABILITY_DB_SCHEMA_VERSION`
>   (database.ts:72,117,474,528,536), never *compared* to the stored value
>   to gate a migration — so the bump is currently **cosmetic**. R3
>   remains a valid P1 (no migration guard), only its "not bumped" framing
>   was inaccurate.
> - **R1/R2 independently CONFIRMED:** `readMcpResource` (resources.ts)
>   returns `database.exportJson()` tables verbatim with zero
>   `safeOutput`/sanitization; `browser-profiles://list` →
>   `exported.browser_profiles`. The forbidden-field invariant genuinely
>   does not exist on the resources surface. Real P0.

---

## Executive Summary — Top 5 by severity

| # | Sev | Finding |
|---|-----|---------|
| 1 | **P0** | MCP **resources** surface leaks contract-forbidden fields. `readMcpResource("browser-profiles://list")` returns `exported.browser_profiles` verbatim (`profile_dir`/`cdp_endpoint`/`cdp_port`/`executable_path`). No `safeOutput` on the resources path; no contract test exercises it. Same drift class as the capability-store one: invariant enforced on tools by convention, silently absent on resources. |
| 2 | **P0** | `safeOutput()` is opt-in per-handler, not enforced at the boundary. `callMcpTool` returns `spec.handler(...)` unwrapped (tools.ts:2661-2668); resources.ts / cli.ts have none. Forbidden-field guarantee = convention, not architecture. |
| 3 | **P1** | Schema version is **cosmetic** (no migration guard). It *was* bumped 1→2 in `aae0c49` (architect's "stayed 2" corrected above), but `schemaVersion` is never compared to gate a migration — nothing migrates on mismatch. |
| 4 | **P1** | `src/mcp/tools.ts` is a 2,669-line god-file (tool specs + web-AI flows + hydration polling + the sensitive-field filter + in-memory lease map + dispatcher). Low cohesion, review-hostile, merge-conflict magnet. |
| 5 | **P1** | JSON-fallback store write is non-atomic (`fs.writeFileSync` full read-modify-write, no temp+rename, no lock; database.ts:534-537) — lossy/corrupting under the documented parallel sub-agent model. |

## Layer map (as built vs documented)

`docs/ARCHITECTURE.md` claims an 8-layer stack with "browser code does not
import DB; DB code does not require Playwright."

- **True:** `src/capabilities/**` imports no Playwright; workflow compile
  runs offline; `optionalRequire` isolates `better-sqlite3`/`playwright`.
- **Eroding (documented escape hatch stretched):** `src/browser/sessionManager.ts:3`
  and `src/browser/profileLease.ts:3` import `CapabilityDatabase`.
  `profileLease` is core lifecycle, not an "integration command" — the doc
  wording should be tightened to match reality (leases genuinely need
  persistence; acceptable, but doc-vs-code mismatch).
- **Real debt:** `src/mcp/tools.ts` collapses layers 2-8 into one file; the
  "Integration Layer" is not a thin adapter, it holds the bulk of web-AI
  behavior.

## Section findings (evidence-cited)

**1. Layering/boundaries.** God-file `tools.ts` owns `forbiddenOutputFields`/
`safeOutput` (:304-347), an in-process `profileLeases` Map (:303), hydration
pollers, recipe entrypoint (:2625), dispatcher (:2661). **Parallel-system
drift #1 (lease):** in-memory `profileLeases` Map (tools.ts:303-326) vs
durable `profile_leases` table + `acquireProfileLease`
(browser/profileLease.ts) — uncoordinated; per-process vs cross-process
leases can disagree. Analogous to the capability-store drift; not caught by
the drift fix.

**2. Two-store model.** `capabilities` (`ON CONFLICT(target_id,name)`,
database.ts:221) vs `integration_registry` (`ON CONFLICT(feature_id)`,
:326) are genuinely disjoint; extractor/updater never touch the new table;
enum defense-in-depth real (parse-time `validateIntegrationStatus` :66-68 +
SQLite `CHECK` migrations.ts:145). The drift fix is internally consistent.
**Parity gap:** `importJson()` SQLite branch only re-inserts
`service_targets`+`capabilities` (database.ts:500-504) and **silently drops
`integration_registry`, `site_registry_entries`, and ~11 other tables** on
a SQLite round-trip import, whereas the JSON-fallback branch restores all
(:507-513). Latent correctness trap (low exposure: CLI uses dedicated
importers, not `importJson`, for these). **Seed-divergence:** seed→table is
one-directional, only on explicit `capability:library:import`; the
"bidirectional consistency" check is a test-time assertion, not a runtime/CI
gate — the seed can still silently diverge between imports (the structural
weakness is narrowed, not eliminated).

**3. Consumer-contract discipline.** Structural sync is decent (32 error
codes, 8 resources, 21 `forbidden_output_fields` matching tools.ts:304;
~30 tools assert `assertNoForbiddenFields`). **Gap (P0):** all such asserts
target tool *results*; `consumerContract.test.ts:137` imports
`listMcpResources` only to collect URIs — never calls `readMcpResource`,
never asserts on resource payloads. `browser-profiles://list` →
`BrowserProfileDbRecord[]` with forbidden fields, untested, unfiltered.

**4. Honesty / no-silent-fallback.** Codex flow is exemplary
(`extractSubmittedTaskId` flow.ts:177-207, `waitForCodexTaskHydration`
:209-226 — disciplined bounded polls, honest failure). **Remaining
pre-hydration / innerText gates NOT using the canonical-reader pattern:**
`src/observe/ip-login-detect.ts:137` (`htmlElement.innerText` login gate,
no hydration poll); `src/reader/domExtract.ts:436`
(`document.body?.innerText || ""` — the canonical extractor's own raw
fallback; pre-hydration consumers silently get ""); `claude-design/flow.ts`
uses visibility waits but no content-proof gate like the codex sibling
(weaker honesty posture). No success-shaped `catch{}` returning fake data
found in tool handlers — the honesty core is intact in the *flows*; the gap
is in the detection/extraction *gates*.

**5. Sub-MCP.** Lazy flat-merge sound (submcp/index.ts:5-9, names fully
qualified, no collision). Allowlist enforcement **robust** (defense in
depth: `repoGuard` tools.ts:59-62, `confirmed` :72-74,
`selectAllowedEnvForSubmit` flow.ts:156-163, `assertTaskBelongsToAllowlist`
+ forbidden-repo regex flow.ts:228-246) — strongest part of the codebase.
**Naming drift (P2):** chatgpt-codex/tools.ts:137-138 aliases
`listTasks = getDiff` (different verbs) — semantic trap for TS consumers.

**6. Browser/CDP/profile lifecycle.** No `SingletonLock` serialization in
code — the "serialize the 3 launches" rule is human-runbook only.
`launch()` reuse-check (managedLauncher.ts:150-164) is TOCTOU (concurrent
same-profile launches both spawn). **Default-port footgun:** `status()`/
`profileRecordToBrowserStatus` (managedLauncher.ts:183,235) default to port
**9222** for unknown profiles — CLAUDE.md says 9222 is the deprecated
logged-out Claude remnant. Doc-vs-code contradiction. No `pkill`/`killall`
footgun in the launcher itself (`terminateProcessTree` uses `process.kill`
by pid/-pid).

**7. Test posture.** 225 tests strong on shapes + the codex allowlist. Thin
or zero on: resources-surface forbidden-field filtering (zero), SQLite
`importJson` table-completeness (zero), JSON-store concurrency (zero),
in-memory-vs-DB lease divergence (zero), pre-hydration empty-body gate
behavior (mocked away).

## Risk / debt register

| ID | Sev | Finding | Evidence | Remediation | Dispatch |
|----|-----|---------|----------|-------------|----------|
| R1 | P0 | Resources surface leaks forbidden fields | resources.ts:31-39; schemas.ts:9-13; test only sets URIs (consumerContract.test.ts:137) | Centralize a recursive forbidden-field sanitizer in `readMcpResource` (+ keep per-handler); contract test iterating EVERY resource URI through `assertNoForbiddenFields` | Codex |
| R2 | P0 | `safeOutput` not enforced at boundary | tools.ts:2661-2668; none in resources.ts/cli.ts | Apply the filter centrally in `callMcpTool` AND `readMcpResource` (defense in depth) | Codex |
| R3 | P1 | Schema version cosmetic (no migration guard) — *was* bumped 1→2, but never compared | database.ts:117,528,536; migrations.ts:1 (`=2`) | Add a `PRAGMA user_version` / stored-vs-constant gate in `init()`; correct drift-fix doc to not overstate the bump | Codex + doc |
| R4 | P1 | `tools.ts` 2,669-line god-file | line count; 6 concerns co-resident | Extract `safetyFilter.ts`, `webAiFlows/`, `dispatcher.ts`; keep specs declarative | Codex (large) |
| R5 | P1 | Non-atomic JSON store write | database.ts:534-537 | temp-file + `fs.renameSync`; advisory lockfile | Codex |
| R6 | P1 | Two parallel lease systems | tools.ts:303 Map vs profileLease.ts DB table | Unify on DB-backed `profile_leases`; delete or strictly-narrow-document the in-memory Map | Codex |
| R7 | P1 | `importJson` SQLite branch drops ~13 tables | database.ts:497-504 vs 507-513 | SQLite branch iterates all TABLES like the JSON branch | Codex |
| R8 | P2 | Pre-hydration innerText gates | ip-login-detect.ts:137; domExtract.ts:436 | Route through a bounded canonical-reader hydration poll | Codex |
| R9 | P2 | Default port 9222 footgun | managedLauncher.ts:183,235 | Remove 9222 default; require explicit port or error | doc + small Codex |
| R10 | P2 | Codex alias maps different verbs | chatgpt-codex/tools.ts:137-138 | Deprecate misleading aliases | doc / small Codex |

## Analogous-drift hunt — RESULT

The audit was commissioned partly to find drifts structurally identical to
the capability-store one (an invariant/store enforced in one place,
silently absent or duplicated elsewhere). **Three found:**

1. **R1/R2 — the forbidden-field invariant**: enforced on MCP *tools* by
   per-handler convention, **absent on the MCP *resources* surface and
   CLI**, untested there. Closest, highest-severity analog. *(Orchestrator
   independently confirmed.)*
2. **R6 — two lease systems**: in-memory `profileLeases` Map in `tools.ts`
   beside the durable `profile_leases` SQLite table — a parallel system
   beside the canonical store, the precise pattern the drift fix targeted,
   not caught by it.
3. **R3 — doc-vs-code inaccuracy**: the drift-fix doc's schema-version
   claim (correct that it bumped, misleading that it matters — the version
   is cosmetic). Persisting imprecise architecture records compounds drift.

The capability-store fix itself is internally sound but was scoped to that
one table and did not sweep for the pattern elsewhere.

## 3 highest-leverage next actions

1. **Close the resources/CLI forbidden-field leak (R1+R2) in one Codex
   dispatch** — centralize the sanitizer in `callMcpTool` AND
   `readMcpResource`; add contract tests iterating every resource URI
   through `assertNoForbiddenFields`. Safety patch within `1.4.0` (no
   version bump). Kills the highest-severity analog of the drift this audit
   was commissioned to hunt.
2. **Unify the lease model (R6) + fix `importJson` table-completeness (R7)
   in one dispatch** — eliminates the last two structural analogs of the
   capability-store drift.
3. **Add a real schema-version migration guard (R3)** and correct the
   drift-fix doc (done alongside this audit) so persisted architecture
   records are accurate.

## Caveats

- Read-only audit; the architect did not run the suite ("225 pass" is from
  the drift-fix doc, re-verified separately by the orchestrator earlier
  this session).
- R7 blast radius depends on whether any consumer uses SQLite-mode
  `importJson` (CLI uses dedicated importers — likely low, still latent).
- The architect's R3 "schema version stayed 2" sub-claim was a factual
  error (it bumped 1→2); corrected above. Its substantive conclusion
  (cosmetic, no guard) is verified and stands.
