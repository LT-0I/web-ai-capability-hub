# Web AI Capability Hub — Refactor v3.1 (revisions to v3)

> Status: **DRAFT v3.1, supersedes v3 on the listed sections**  •  Date: 2026-05-23  •  HEAD pin: `a1c51e3`
>
> Companion to `docs/plans/web-ai-refactor-v3.md`. This file lists each accepted critique finding from `.omc/codex-out/refactor-v3-critique.md` (codex/gpt-5.5 adversarial review, 3 Critical + 9 High + 4 Medium) and the corresponding v3 section update. The v3 file itself stays as the original snapshot for audit; section-level deltas live here. If v3.1 contradicts v3, **v3.1 wins**.
>
> Critique verdict was: **revise before any ship**. v3.1 incorporates every Critical and every High finding. Two Mediums are accepted (lightpanda framing, manifest direct/recipe split); two are deferred with rationale.

---

## 0. Critique acceptance ledger

| # | Severity | Finding (compressed) | v3.1 status | New section |
|---|---|---|---|---|
| §1.1 | **Critical** | "100% compat / 6 locks held" is false; tests hard-code 1.6.0 / err=32 | **Accepted** | §A. Phase gates rewrite |
| §1.2 | High | Command-count deltas inconsistent (7 wah_ tools, plan said +6) | **Accepted** | §B. Per-phase command ledger |
| §1.3 | High | "Legacy schemas frozen" ignores source-anchored test assertions | **Accepted** | §C. Source-invariant migration discipline |
| §1.4 | Medium | "Manual only" drift premise overstated (saveSiteMap/diffSiteMap/probeUrl exist) | **Accepted** | §D. Reuse existing maintenance primitives |
| §2.1 | High | Stagehand local-mode is under-risked | **Accepted** | §E. Stagehand parity checklist |
| §2.2 | High | `@playwright/mcp` serializer not importable | **Accepted** | §F. Snapshot strategy — vendor or subprocess |
| §2.3 | Medium | Lightpanda blanket-rejection conflates license + deployment shape | **Accepted (qualified)** | §G. Lightpanda sidecar gating |
| §2.4 | Medium | healwright deferral risks no baseline | **Accepted** | §H. P1 self-healing spike |
| §3.1 | High | Byte-identical ToolSpec generation isn't realistic without storing literals | **Accepted** | §I. Description + schema literals in manifest |
| §3.2 | High | Required `recipe.steps` forces non-recipe tools into fake workflows | **Accepted** | §J. Manifest `kind: recipe \| direct` split |
| §3.3 | Medium | `engineHint` too flat for staged probing | **Deferred to P3** | §K. Engine policy deferral rationale |
| §3.4 | Medium | Generator output location/build contract unspecified | **Accepted** | §L. Generator under `src/generated/` |
| §4.1 | **Critical** | P2 undercounts `ManagedBrowserLauncher` entrypoints (~80 sites across CLI, MCP server, sessionPool, artifactClick, 40 research DBs) | **Accepted** | §M. Repo-wide pool migration |
| §4.2 | High | In-process queue doesn't solve cross-process lock contention | **Accepted** | §N. Cross-process file lock |
| §4.3 | High | Long-running task / cancel semantics missing | **Accepted** | §O. `wah_task_cancel` + lease heartbeat |
| §5.1 | **Critical** | Auto-heal with `ok=true` risks §2.3 honest-error violation | **Accepted** | §P. `heal_mode` + opt-in + `degraded` field |
| §5.2 | High | τ=0.95 meaningless without scoring function | **Accepted** | §Q. Heal scoring spec |
| §5.3 | High | Error-code / forbidden-field changes break exact contract assertions | **Accepted** | §R. Contract migration discipline |

---

## §A. Phase gates rewrite (replaces v3 §7, §8.1)

The v3 phrasing "**existing 427/427 tests green / 6 locks held**" is provably false for P1+ because the current `tests/consumerContract.test.ts:201-204`, `:415-421`, `:589-596` hard-code the strings `consumer-contract-1.6.0`, error_codes length `32`, webai count `38`, etc. Any contract bump fails these assertions unless the tests are updated **in the same phase as the bump**.

**New phase-gate contract** (replaces v3 §7 table "Gates" column):

For each phase that touches `consumer-contract.json` or `error_codes`:
1. **Old-surface backward-compat assertions retained** — every existing webai_/research_/browser_ tool name must still resolve via `callMcpTool()` to a handler that produces an output passing the prior phase's fixture.
2. **Contract fixture regenerated explicitly** — the phase dispatch prompt lists the exact `tests/consumerContract.test.ts` line numbers to update (e.g. `1.6.0`→`1.7.0` at lines 201, 415, 595; error_codes count 32→34 at line 417), and the update is a single auditable diff per phase.
3. **Golden `listMcpTools()` JSON snapshot** — added in P1, becomes the contract authority. Phase ships iff `npm run generate:golden && git diff --exit-code` is clean.
4. **6-locks check becomes 7-locks**, dropping the meaningless "count unchanged" assertion and adding "**golden snapshot byte-stable across phase boundary except for the explicitly-listed deltas**".

**Per-phase test-update budget**:

| Phase | tests/consumerContract.test.ts edits expected | New golden fixtures |
|---|---|---|
| P0 (0.7.1) | 0 | 0 — adds verify-contract-version script |
| P1 (0.8.0) | ~12 lines (3 version string sites + 9 lock-count sites) | `tests/golden/listMcpTools.187.json` |
| P2 (0.9.0) | ~8 lines (5 lock-count sites + 3 schema-byte-identity asserts) | `tests/golden/listMcpTools.192.json` |
| P3 (1.0.0) | ~6 lines | `tests/golden/listMcpTools.192-collapsed.json` |
| P4 (1.1.0) | 0 (optional Stagehand is fully opt-in) | 0 |

---

## §B. Per-phase command ledger (replaces v3 §8.1)

v3 §8.1 had abstract counts (`commands 181 → 187 → 192 → 192 → 192`) that don't tally with the §5.5 list of 7 wah_ tools. Replace with explicit per-tool ledger:

### P1 ships (3 new commands, contract 1.6.0 → 1.7.0, error_codes 32 → 34)

| CLI | MCP | TS export | Contract row | error_codes added |
|---|---|---|---|---|
| `wah:capability:query` | `wah_capability_query` | `wahCapabilityQuery` | new (#182) | — |
| `wah:adapter:health` | `wah_adapter_health` | `wahAdapterHealth` | new (#183) | — |
| `wah:policy:explain` | `wah_policy_explain` | `wahPolicyExplain` | new (#184) | — |
| — | — | — | — | `UI_DRIFT_DETECTED` (33), `HEAL_CONFIDENCE_LOW` (34) |

**P1 lock target**: pkg 0.8.0 / contract 1.7.0 / commands 184 / errors 34 / webai_ 38 / research_ 121 / golden 187-tool-snapshot

(Note the 184 vs earlier 187 estimate — three not seven new commands, because `wah_task_*` ships in P2, not P1.)

### P2 ships (4 new commands, contract 1.7.0 → 1.7.1 patch, error_codes 34 → 36)

| CLI | MCP | TS export | Contract row | error_codes added |
|---|---|---|---|---|
| `wah:task:start` | `wah_task_start` | `wahTaskStart` | #185 | `PROFILE_LEASE_TIMEOUT` (35) |
| `wah:task:status` | `wah_task_status` | `wahTaskStatus` | #186 | `TAB_LEASE_EXPIRED` (36) |
| `wah:task:cancel` | `wah_task_cancel` | `wahTaskCancel` | #187 | — |
| `wah:task:resume` | `wah_task_resume` | `wahTaskResume` | #188 | — |

**P2 lock target**: pkg 0.9.0 / contract 1.7.1 / commands 188 / errors 36 / webai_ 38 / research_ 121

### P3 ships (1 new command + 121 research_ migrations under the hood, NO contract bump)

| CLI | MCP | TS export | Contract row |
|---|---|---|---|
| `wah:artifact:get` | `wah_artifact_get` | `wahArtifactGet` | #189 |

Internal collapse of 40-DB boilerplate is **invisible to the contract** — same 121 research_*_{search,filter,export} names + same schemas. Generator just emits the bodies from manifests.

**P3 lock target**: pkg 1.0.0 / contract 1.7.1 / commands 189 / errors 36 / webai_ 38 / research_ 121

### P4 ships (0 new commands; Stagehand opt-in)

**P4 lock target**: pkg 1.1.0 / all P3 locks unchanged.

**Note**: `wah_task_cancel` is NEW vs v3 (which had no cancellation primitive) — addresses critique §4.3.

---

## §C. Source-invariant migration discipline (replaces v3 §5.2 "byte-identical claim")

v3 said the generator emits ToolSpec stubs with "exact same name, description, inputSchema outer shape." Critique §1.3 / §3.1 noted this is not enough: `tests/consumerContract.test.ts:2188`, `:2380`, `:3142` read `src/mcp/tools.ts` as a STRING and grep for selector substrings. Moving selectors out to manifests breaks those source-grep assertions.

**Two-track approach**:

1. **Generated tool body** lives in `src/generated/tools/<adapter-id>.ts`. ToolSpec literal still appears in `src/mcp/tools.ts` but its body is a 1-line `return ExecutionEngine.run('<adapter-id>', args, runtime);` — keeping `src/mcp/tools.ts` greppable for "this tool exists, here's its description" assertions.

2. **Source-anchored selector tests** get rewritten in the SAME phase that moves selectors to manifests. The dispatch prompt for P2 explicitly lists `tests/consumerContract.test.ts:2188,2380,3142` for migration to `tests/manifestSelectorInvariants.test.ts` that reads manifests instead of source.

The "byte-identical" promise downgrades to "**MCP tool list output is byte-identical against the golden snapshot, but source-level test assertions migrate in lockstep with the source code they assert on**."

---

## §D. Reuse existing maintenance primitives (corrects v3 §1 pain map P3)

Critique §1.4 correctly notes that `src/maintenance/captureSiteMap.ts:11-18`, `diffSiteMap.ts:11-21`, `probe.ts:78-129` already exist. They are **not** background drift detectors but they ARE callable primitives.

**v3.1 update**: P1 `scout/` module's `frontier.ts` and `drift detector` should **call** `saveSiteMap()` / `latestSiteMapPath()` / `probeUrl()` directly, not duplicate them. M1 dispatch prompt updated to import these. Saves ~200 LOC and avoids the "two-versions-of-the-same-primitive" failure mode.

---

## §E. Stagehand parity checklist (gates v3 §4.1 adoption)

Critique §2.1 cites Browserbase's own docs positioning local mode for "development" and cloud for "production." v3.1 keeps Stagehand on the borrow list but adds a hard P4 entry gate:

**Pre-adopt parity checklist** (all must pass; one failure = drop Stagehand and reimplement pattern in-house):

- [ ] Action cache persists across process restarts (Stagehand local-mode SQLite or filesystem).
- [ ] `attach` to existing managed Chrome over CDP works (not just spawn-new).
- [ ] Cache invalidation does NOT silently call LLM; we control the LLM call surface.
- [ ] No stealth / CAPTCHA / anti-detect features activated even with default config.
- [ ] Token-cost ceiling configurable per cache entry.
- [ ] Cancellation: long-running `act()` is interruptable from outside.
- [ ] License audit: MIT terms compatible with vendoring patterns from Stagehand into our codebase if upstream removes local mode.

**Until checklist passes, the action cache is implemented in-house** atop M3 ElementBank fingerprints. Stagehand becomes a P4 optional add-on, not a P1-P3 hard dep.

---

## §F. Snapshot strategy — vendor or subprocess (replaces v3 §4.1 first row)

Critique §2.2 verified `@playwright/mcp` only exports `createConnection(...)` — there is no importable snapshot serializer. v3.1 replaces "vendor as helper or thin wrapper" with **one** of:

- **Option A** (default): vendor the snapshot serializer source into `src/scout/snapshot/playwrightMcpFormatter.ts` with full Apache-2.0 license header + a golden snapshot test against the upstream MCP output. Pinned to a specific upstream commit; quarterly upstream-sync script.
- **Option B**: spawn `@playwright/mcp` as a subprocess and read snapshots over stdio MCP protocol. No vendoring, no license worry, but +200ms per snapshot and a process management chore.

P1 dispatch prompt picks **Option A** by default; user can flip to B in §11.7 below.

---

## §G. Lightpanda sidecar gating (softens v3 §4.3 rejection)

Critique §2.3 correctly notes AGPL applies to **linked** combinations, not separate processes communicating over IPC. v3.1 replaces "reject AGPL viral" with:

**Lightpanda may be considered as a P4+ sidecar IFF all hold**:
1. Used ONLY for public read-only pages (no logged-in profile).
2. Spawned as a subprocess; no library imports.
3. Documented source-offer per AGPL §13 (we don't modify it, but distribution of the sidecar binary requires the offer).
4. Quarterly JS-compat benchmark vs Playwright on our actual public-page targets passes ≥90%.
5. Legal review confirms separate-process boundary is sufficient for this repo's Apache-2.0 license.

**P1-P3 do NOT depend on lightpanda.** The conservative default in §9 metrics is "playwright-readonly engine handles all public-page reads." Lightpanda is a perf-only optimization deferred indefinitely.

---

## §H. P1 self-healing spike (addresses §2.4)

Critique §2.4 surfaced `playwright-selfheal-ai`, `@fuzionstudio/playwright-healer`, Treegress, plus the earlier `healwright` candidate. v3.1 adds a **P1 spike** before M3 ElementBank schema is finalized:

**P1 spike: self-healing baseline benchmark**
- Pick 4 real failure cases from the last 4 issue-fix-loop rounds (e.g. #16 Gap D image chip DOM-shape divergence, #14 Gemini menuitem text split, #13 Cohort B+C hover-reveal, #10 R4 fullscreen image viewer).
- For each, attempt resolution via:
  1. healwright (npm)
  2. playwright-selfheal-ai (npm)
  3. Treegress DOM compression (browser MCP)
  4. Our planned ElementBank fingerprint design
- Record: success/failure, LLM call count, latency, false-positive rate.
- Decision matrix decides whether ElementBank is built in-house or replaced by one of the npm packages.

Spike output: `docs/research/selfheal-baseline-2026-XX.md`. If a npm package wins on all 4 cases AND license is compatible AND maintenance is healthy, M3 wraps that package instead of building from scratch.

---

## §I. Description + schema literals in manifest (replaces v3 §5.2 ManifestSchema)

Critique §3.1: current ToolSpec literals contain hand-authored descriptions that aren't derivable from manifest data. v3.1 manifest schema **adds two required fields**:

```yaml
id: webai.chatgpt.send_prompt
descriptionLiteral: |
  Send a prompt to ChatGPT and wait for the response. Required: profile, prompt.
  Optional: model_id (defaults to current account default), timeout_ms (default 180000).
  Returns: { ok, answer, errorCode, evidence }. Honest errors: LOGIN_REQUIRED,
  COMMAND_TIMEOUT, ELEMENT_NOT_FOUND, INVALID_ARGS, PROFILE_LEASE_TIMEOUT.
inputSchemaLiteral: |
  z.object({
    profile: z.string(),
    prompt: z.string().min(1),
    model_id: z.string().optional(),
    timeout_ms: z.number().int().min(1000).max(600000).optional(),
  })
# ... rest as v3 §5.2
```

`descriptionLiteral` and `inputSchemaLiteral` are **multi-line strings preserved verbatim**. Generator emits them byte-identically into ToolSpec literals. Migration audit becomes: `grep -A5 "id: webai.chatgpt.send_prompt" configs/adapters/**/*.yaml` matches the source-of-truth string.

---

## §J. Manifest `kind: recipe | direct` split (resolves §3.2)

Critique §3.2: tools like `consumer_health`, `browser_status`, `browser_pages`, `webai_task_status` have direct handlers with no meaningful `recipe.steps`. Forcing a fake recipe is a smell.

**v3.1 manifest schema update**:
```yaml
id: ...
kind: recipe | direct
# IF kind=recipe:
recipe: { steps: [...] }
# IF kind=direct:
direct:
  tsExport: "string"          # name of the existing handler function
  module: "src/path/to/file"  # where to import it
```

Status / read tools migrate as `kind: direct` — generator wraps the existing function, no behavior change. Mutating tools migrate as `kind: recipe` over P2-P3. Capability schema becomes additive: existing `recipe`-only tools are still valid (default kind = `recipe`).

---

## §K. Engine policy deferral rationale (defers §3.3)

Critique §3.3 wants per-step `engineHint: probe | observe | mutate | download` instead of flat `engineHint: playwright-cdp`. v3.1 **defers to P3** because:
- v3.1 §G defers lightpanda indefinitely anyway → only ONE engine in P1-P2.
- Per-step engine policy is meaningful only when ≥2 engines exist.
- Adding the field now and ignoring it == dead schema surface.

P3 dispatch prompt adds `engineHint` if a second engine is approved before P3 ships. Otherwise stays single-engine.

---

## §L. Generator output under `src/generated/` (addresses §3.4)

Critique §3.4: v3 didn't say where generator output lives. v3.1 specifies:

- **Location**: `src/generated/tools/<adapter-id>.ts` (committed, NOT gitignored).
- **Build hook**: `npm run generate` runs the generator; `npm run build` runs `generate` first then `tsc`.
- **CI gate**: `npm run generate && git diff --exit-code src/generated/` — fails if a manifest change wasn't regenerated.
- **Format**: each generated file has a `// @generated from configs/adapters/<path>/<file>.yaml — DO NOT EDIT` header.

---

## §M. Repo-wide ProfilePool migration (replaces v3 §5.4 scope)

Critique §4.1 is **the biggest finding**. The full call-site inventory (from the codex grep run):

| Module | Direct `new ManagedBrowserLauncher` sites |
|---|---|
| `src/cli.ts` | lines 328, 905, 910, 915, 954 (5 sites) |
| `src/mcp/server.ts` | line 49 (1 site) |
| `src/mcp/tools.ts` | line 122 (1 site, runtime default) |
| `src/browser/sessionPool.ts` | lines 23, 52 (2 sites) |
| `src/browser/artifactClick.ts` | line 1084 (1 site) |
| `src/browser/managedCdpSessionManager.ts` | line 4 (1 site) |
| `src/consumer/health.ts` | line 76 (1 site) |
| `src/mcp/researchdb/<40 dirs>/flow.ts` | 80 sites (each DB has 2: search+filter, search+export, etc.) |
| **Total** | **~92 direct constructor sites** |

**v3.1 dispatches a P2 inventory + adapter shim** BEFORE rewiring any webai_ handler:
- **P2.0** (new sub-phase): introduce `src/pool/profilePool.ts` as the single authoritative `acquireProfile()` entry point. Replace every `new ManagedBrowserLauncher()` call with `await profilePool.acquireProfile(...)`. NO behavior change — pool initially delegates to a singleton `ManagedBrowserLauncher` instance. Dispatch in waves of 10 sites at a time. Gate per wave.
- **P2.1**: add the lease/queue/TTL/cancel logic on top of the now-centralized pool.
- **P2.2**: wire webai_ handlers through ExecutionEngine (which calls `profilePool` internally).

This is **3 P2 sub-phases**, not 1. Estimated +2 weeks calendar time vs v3's optimistic P2 estimate.

---

## §N. Cross-process file lock (replaces v3 §5.4 launch queue)

Critique §4.2: per-process queue does nothing if two MCP servers race for the same profile. v3.1 adds:

**Mandatory cross-process file lock around `ManagedBrowserLauncher.launch`**:
- `profilePool.acquireProfile(profileId, ...)` first acquires an `flock(LOCK_EX)` on `data/pool/locks/<profileId>.lock`.
- Lock holds across the launch + the entire lease lifetime.
- On lock acquisition: check `data/pool/locks/<profileId>.pid` — if PID file exists and process is dead, GC stale Chrome `SingletonLock` files in the profile dir BEFORE spawning.
- Release the file lock on `releaseLease()`; PID file cleared.

This addresses the `CLAUDE.md:~120` warning "Launching the three web-AI chromes in parallel. Wrong. They race on the global SingletonLock" at the **API layer**, not as user-operational discipline.

---

## §O. `wah_task_cancel` + lease heartbeat (addresses §4.3)

Critique §4.3 noted v3 had no cancellation semantics for long-running tasks (Gemini Veo ~5min, async video stuck up to 15min). v3.1 adds:

**`wah_task_cancel`** — new MCP tool in P2 (now in command ledger §B).

**Lease heartbeat protocol**:
- Tab lease TTL = 5 min default (down from v3's 30 min).
- A run holding a tab lease must call `wah_task_heartbeat(task_id)` every ≤ 4 min, OR the lease auto-expires and the tab is released.
- `wah_task_cancel(task_id)` sets task status = `CANCEL_REQUESTED`. The runner checks this flag at every `await` boundary; on detect, returns `CANCELLED` error code + writes evidence + releases lease.
- Detached workers (video) get the cancel signal via SQLite poll; their `videoWorker.ts` bootstrap catches and persists `CANCELLED` terminal state.

**New error codes** in P2 ledger: none — `CANCELLED` already exists in `tests/consumerContract.test.ts:415-421` per critique grep (or will be added in the contract migration — verify in P2 dispatch).

---

## §P. `heal_mode` opt-in + `degraded` field (resolves Critical §5.1)

This is the most important fix. Critique §5.1: `ok=true` on an auto-healed selector hides the bug. §2.3 of CLAUDE.md bans this.

**v3.1 contract**:

Each adapter manifest has a per-selector `heal_policy`:
```yaml
selectors:
  promptBox:
    candidates: [...]
    fingerprintRef: cb_001
    heal_policy: auto | report | off    # default: report
  submitButton:
    candidates: [...]
    heal_policy: off                    # mutating buttons NEVER auto-heal by default
```

Tool input schema gets an optional `heal_mode` override:
```
{ "heal_mode": "off" | "report" | "auto" }
```
- `off`: any selector miss → `ELEMENT_NOT_FOUND` (current behavior, preserved).
- `report` (default): on miss → try heal layer. If found with confidence ≥ τ → emit `UI_DRIFT_DETECTED` errorCode + `evidence.heal_candidate{...}` showing what WOULD have worked. **NO action taken.** Consumer sees the drift, decides.
- `auto`: on miss → try heal. If found with confidence ≥ τ AND manifest selector has `heal_policy: auto` → execute, return `ok: true`, **but** set `degraded: true` + `evidence.heal_notes[]` in always-present output keys.

`degraded` field added to safe-output allowlist in P1 dispatch. Consumers can treat `ok:true && !degraded` as the strict happy path; `ok:true && degraded` is "succeeded with caveat."

Default of `report` (not `auto`) means **no behavioral change without explicit opt-in**. §2.3 compliance preserved.

---

## §Q. Heal scoring spec (resolves §5.2)

Critique §5.2: τ=0.95 without a scoring function is meaningless. v3.1 specifies:

**Confidence formula** (deterministic, no LLM):
```
confidence = 0.35 * ariaMatch
           + 0.25 * nearTextJaccard
           + 0.20 * bboxOverlap
           + 0.15 * domStructureSimilarity
           + 0.05 * roleExactMatch
```
Each input is in `[0, 1]`:
- `ariaMatch`: 1.0 if aria-label+role exact; 0.7 if role exact + label fuzzy; 0 otherwise.
- `nearTextJaccard`: Jaccard of bag-of-words between stored `near_text_json` and live candidate's near text.
- `bboxOverlap`: IoU of stored bbox vs live element bbox.
- `domStructureSimilarity`: Levenshtein on simplified DOM path from nearest stable ancestor (data-testid'd ancestor).
- `roleExactMatch`: 1.0 if ARIA role equals stored role; 0 otherwise.

**Calibration fixture**: P1 spike outputs `tests/fixtures/heal-calibration/{stable-30, drift-30}.json` — 30 known-stable selectors should score ≥ 0.95, 30 known-drift selectors should score < 0.85. Tests fail if τ tuning breaks this band.

**No auto-click on uncalibrated selector roles** — every manifest selector with `heal_policy: auto` must have a corresponding calibration fixture row. P2 dispatch enforces this gate.

---

## §R. Contract migration discipline (resolves §5.3)

Critique §5.3: `error_codes` 32→34 in P1 breaks `tests/consumerContract.test.ts:415-421`. v3.1 makes this explicit:

**Every phase that changes contract counts ships in the same atomic dispatch as**:
- `tests/consumerContract.test.ts` line-by-line edits (listed in dispatch prompt).
- `configs/consumer-contract.json` version + counts.
- `docs/CONSUMER_CONTRACT.md` version header + new-row documentation.
- `tests/integrationRegistry.test.ts` `webaiCommands.length` etc. updates.

Per `feedback_serialized_codex_batch_chain.md`, contract migrations are **serialized** — never 2 codex dispatches editing `consumer-contract.json` in parallel.

**`endpointRef` classification** (new safe-output field added in P2 alongside ProfilePool): explicitly classified in `forbidden_output_fields` audit. Either added to `sensitive_fields` (then must be redacted) or proven safe by construction (UUID with no embedded port/host). P2 dispatch decides; document it.

**Forbidden-fields list never shrinks** — `cdpEndpoint`, `cookies`, `profileDir`, `webSocketDebuggerUrl`, `screenshot`, `snapshot`, etc. stay on the list. New fields like `degraded`, `heal_notes`, `lease_id` go on the **safe** allowlist after explicit P1 vetting.

---

## §S. Updated risk register (additions to v3 §10)

| New risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| P2.0 wave-by-wave ProfilePool migration touches 92 sites; one wave breaks a research-DB live smoke | High | Medium | Wave gate = per-DB integration fixture replay before next wave dispatches. |
| Cross-process file lock starves a hot profile (3 MCP servers all want chatgpt-9223) | Medium | Medium | Lock TTL = 10 min hard cap; `wah_pool_status` surface for debugging contention. |
| Heal-confidence scoring miscalibrated on first deploy → false-positive drift events | High | Low | Default `heal_policy: report` everywhere in P1 means false positives are observable, not actionable. Tune τ in P2 with real data. |
| `descriptionLiteral` in manifest YAML breaks YAML parsing on edge cases (backticks, `|` indicator collisions) | Medium | Low | Schema validation in generator; fallback to `descriptionRef: ./descriptions/<id>.md` for long descriptions. |
| Stagehand parity checklist fails all 7 items → P4 in-house build adds 2-3 weeks calendar | Medium | Low | In-house action cache atop ElementBank fingerprints is already a v3.1 fallback. Stagehand is opportunistic. |

---

## §T. Updated open decision points (revises v3 §11)

| # | Decision | v3.1 recommendation | Status |
|---|---|---|---|
| 11.1 | Contract version strategy | **Option A** (minor bumps per phase 1.7.0→1.7.1) — needed for honest counts | Same as v3 |
| 11.2 | Stagehand vs in-house action cache | **In-house first (atop ElementBank)**, Stagehand as P4 opportunistic add-on | **Changed** from v3 (was: adopt Stagehand directly) |
| 11.3 | Scout binary distribution | **Option A** (separate `wah-scout` binary in same npm pkg) | Same as v3 |
| 11.4 | Heal threshold | τ = 0.95 + default `heal_policy: report` (not auto) | **Reframed** from v3 (was: just τ choice) |
| 11.5 | P3 collapse waves | **Option B** (waves of 5 DBs each, 8 dispatches) | Same as v3 |
| 11.6 | healwright vs in-house | **Decide after P1 self-healing spike** §H | **Concretized** from v3 |
| 11.7 (NEW) | Snapshot serializer source | **Option A** (vendor with license header) | New decision |
| 11.8 (NEW) | Lightpanda P4+ sidecar | **Defer indefinitely** unless perf data forces it | New decision |
| 11.9 (NEW) | Cross-process pool lock backend | **`flock(2)` on filesystem** (simple, no extra dep) vs **`better-sqlite3` advisory lock** (already a dep) | NEEDS USER INPUT |

---

## §U. Updated approval matrix (revises v3 §14)

| Decision | Owner | Signal |
|---|---|---|
| Adopt v3.1 (this file) as the refactor north star | User | "approve v3.1" or amendments |
| Authorize P0 dispatch (contract verifier + golden snapshot baseline) | User | "go P0" |
| Authorize P1 dispatch wave (4 serial codex runs: spike, schema, ElementBank+heal, scout) | User | "go P1" after §11.1+§11.2+§11.4+§11.7 decided |
| Authorize P2.0 (ProfilePool wave migration, 9-10 waves) | User | "go P2.0" after P1 ship + 1 week parallel run |
| Authorize P2.1 + P2.2 (queue/lease + ExecutionEngine rewire) | User | "go P2.1" after §11.9 decided + P2.0 ship |
| Authorize P3 | User | "go P3" after P2 ship + drift report shows ≥60% report (not necessarily auto-heal) of selector misses |
| Authorize P4 (Stagehand eval if parity checklist passes; dashboard) | User | "go P4" after P3 ship |

---

## §V. What v3.1 deliberately accepts as risk

1. **+4 weeks calendar time** vs v3 due to: P2 splits into 3 sub-phases, P1 adds a self-healing spike, contract migrations get explicit test-update budgets. Honest pacing > optimistic timeline.
2. **Manifest YAML files become longer** due to `descriptionLiteral` / `inputSchemaLiteral`. Trade-off: machine-greppable single source of truth vs hand-written conciseness. Plan accepts the verbosity.
3. **Heal layer is initially observability-only** (default `report` mode). The headline "auto-heal" benefit lands in P2.1+, not P1. Reduces blast radius.
4. **Lightpanda perf benefits indefinitely deferred.** Trade-off: legal/safety conservatism vs throughput. Plan accepts the trade.

---

## §W. Documents superseded by v3.1

| Section in v3 (`web-ai-refactor-v3.md`) | Status |
|---|---|
| §0 Executive summary | Largely intact; recheck "1.7.0 minor bump" claim against §B (still correct). |
| §1 Pain map | Intact, with §D correction about maintenance primitives. |
| §2 Design principles | Intact. |
| §3 Target architecture | Intact (diagram still valid). |
| §4 OSS picks table | §E + §F + §G + §H update individual rows. |
| §5.1 Scout | §D update. |
| §5.2 Registry | §I + §J + §L update manifest schema. |
| §5.3 Heal | §P + §Q replace entirely. |
| §5.4 BrowserPool | §M + §N + §O replace entirely. |
| §5.5 Facade | Add `wah_task_cancel` + `wah_task_heartbeat` per §O. |
| §7 Phase table | §A + §B replace entirely. |
| §8.1 Locks table | §B replaces. |
| §8.2 Error code additions | §R replaces. |
| §10 Risk register | §S extends. |
| §11 Open decisions | §T extends. |
| §14 Approval matrix | §U extends. |

---

## References

- Source critique: `.omc/codex-out/refactor-v3-critique.md` (codex/gpt-5.5, 1572 words)
- v3 plan: `docs/plans/web-ai-refactor-v3.md`
- Critique dispatch prompt: `.omc/codex-prompts/refactor-v3-critique.md`
- Critique session ID: `019e5409-48a6-75d2-84cd-6442eb5c556e`
