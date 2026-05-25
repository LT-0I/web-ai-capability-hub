# Web AI Capability Hub — Refactor v3.2 (FINAL)

> Status: **READY for user strategic-approval only**  •  Date: 2026-05-23  •  HEAD pin: `a1c51e3`
>
> Supersedes both `web-ai-refactor-v3.md` and `web-ai-refactor-v3.1-revisions.md`.
>
> All 9 technical decisions are MADE (per user directive "我只懂得我要什么... 让它更加结构化、规整、可扩展性增强"). User is asked to approve scope + 3 strategic-level choices only. Technical detail (lock backend, scoring formula, manifest format, etc.) is final.
>
> Inputs synthesized:
> - User pain points (4)
> - `refector-ref/low-token-web-ai-discovery-plan.md`
> - `refector-ref/web-ai-capability-hub-optimization-plan/00-08*.md` (the GPT-prepared reference plan)
> - Codebase audit (oh-my-claudecode:explore subagent, file:line evidence)
> - 17 OSS due-diligence + 5 2026 new finds (oh-my-claudecode:document-specialist subagent)
> - Codex critique medium-effort (3 Critical + 9 High) — fixed in v3.1 deltas
> - Codex critique **xhigh-effort** (`.omc/codex-out/refactor-v3-critique-xhigh.md`, 1390 words, 32k tokens) — DECISIVE decisions on D1-D9 + module collapse + codemod vs phased

---

## 0. One-page executive summary

**North star**: *more structured, more regular, more extensible* — by borrowing OSS patterns.

**Architecture**: 4 modules (down from v3.1's 5), all built on existing in-repo primitives (no greenfield).

| # | Module | Purpose | Built atop existing |
|---|---|---|---|
| M1 | `observe/` | Low-token snapshot, scout discovery, element evidence capture | `src/observe/selectorCandidates.ts` + `src/reader/` + `src/maintenance/` + `src/trace/` |
| M2 | `registry/` | Manifest loader, schema validator, **TS-code generator**, contract-version verifier | `src/capabilities/integrationRegistry.ts` + `configs/consumer-contract.json` |
| M3 | `runtime/` | Unified ProfilePool (SQLite leases) + tab/session lifecycle + ExecutionEngine + injected heal service | `src/browser/{sessionPool,sessionManager,managedCdpSessionManager,managedLauncher,profileLease}.ts` |
| M4 | `facade/` | Stable `wah_*` MCP tools + legacy aliases + policy explain + artifact get | `src/mcp/tools.ts` (rewires internally) |

**Migration**: **1 atomic codemod PR + 3 follow-on phases over 6 weeks** (down from v3.1's 5 phases / 8-10 weeks). The 92-site `ManagedBrowserLauncher` replacement and 40-DB collapse are STRUCTURALLY identical patterns — `jscodeshift`-class codemod handles them in days, not weeks.

**Lock targets** at v1.0 ship: pkg 1.0.0 / contract 1.7.1 / commands 189 / errors 36 / webai_ 38 / research_ 121. (Minor bumps only; no 2.0-draft.)

**OSS adoption decisions** (final, no further evaluation):
- **Adopt as dep**: ZERO. (No Stagehand, no @playwright/mcp import, no lightpanda — all borrowed as patterns only.)
- **Borrow patterns**: vercel agent-browser ref protocol; actionbook session+tab; Scrapling fingerprint shape; AutoCLI YAML pattern; playwright-mcp AX-tree-first; healwright/Treegress observation (no adoption).
- **Reject permanently**: CloakBrowser, obscura, Skyvern, BrowserOS, AgentGPT, browser-use(as dep). License or stealth or stack mismatch.

**Honest trade-offs**:
- Atomic codemod = one big PR review burden, but kills dual-architecture limbo within 2 weeks.
- SQLite-backed pool leases (not `flock`) = durable + inspectable + cross-platform, at the cost of one schema migration.
- In-house serializer / action cache / heal scoring = repo owns all critical paths, at the cost of ~1 week extra build vs vendoring.

---

## 1. The 4 pain points → module mapping

| Pain | v3.2 solution | Confidence |
|---|---|---|
| **P1 — Token burn on web/DB probing** | M1 `observe/` lite-mode snapshot + scout mode + AX-tree-first formatter. Default: ≤4 KB lite snapshot, ≤12 LLM calls per scout run. | High |
| **P2 — Inflexible tool layers** | M2 `registry/` generates `src/generated/tools/*.ts` from YAML manifests. New target = 1 manifest + 1 fixture, NOT 1 hand-written `flow.ts` + 1 hand-written `tools.ts`. | High |
| **P3 — No update mechanism for site drift** | M3 `runtime/` injected heal service. Default `report`-only: emits `UI_DRIFT_DETECTED` + the selector that WOULD have worked; consumer or maintenance-codex acts on it. Selector candidates are PERSISTED to ElementBank for next round. | High |
| **P4 — No unified browser-profile management** | M3 `runtime/` ProfilePool + SQLite advisory lease table + tab/session lease + TTL + cancel + heartbeat. Replaces 92 `new ManagedBrowserLauncher` call sites via one codemod. | High |

---

## 2. The 9 technical decisions (made)

These came from xhigh codex critique. The orchestrator accepts all 9 verbatim; user does NOT need to vet these.

| # | Decision | Rationale (1-liner) |
|---|---|---|
| **D1** | Contract bumps: **minor only, no 2.0 draft**. 1.6.0 → 1.7.0 (P1) → 1.7.1 (P2) → 1.7.1 (P3 collapse, no bump) → 1.0.0 pkg. | Project is pre-1.0; user-visible facade landings as 0.8/0.9 minors. 2.0 draft adds governance ceremony before architecture is stable. |
| **D2** | Action cache: **in-house atop ElementBank**, not Stagehand. | Stagehand local-mode is not dependency-ready for production (Browserbase docs position it as dev-only). Hub already needs site-specific fingerprint evidence; one cache schema. |
| **D3** | Pool cross-process lock: **SQLite advisory lease table**, NOT `flock`. | The system already needs durable tab/profile lease metadata, TTL, cancellation state, and health visibility. SQLite makes those inspectable. `flock` becomes an invisible side channel. |
| **D4** | Heal scoring: **weighted fingerprint** (stable attrs + accessible name + role + DOM neighborhood + text similarity + historical success). Components stored for `report` mode to explain candidates. | Levenshtein-only is fragile; fingerprint-only misses semantic drift. Weighted multi-signal is the only honest formula. |
| **D5** | Manifest authoring: **hybrid** — YAML for metadata/policies/descriptions/selectors/recipe wiring + TS for handler functions and Zod schemas. | Pure YAML creates unsafe DSL for browser behavior; pure TS preserves the 159-tool ToolSpec sprawl. Hybrid separates reviewable data from typed code. |
| **D6** | Scout distribution: **internal `wah scout` subcommand**, NOT separate `wah-scout` npm package. | Scout depends on repo internals (reducers, evidence schema, registry promotion). Separate package freezes boundaries too early. Revisit packaging after 1.0. |
| **D7** | Heal default behavior: **`report` only**, not auto. | Silent selector substitution on academic/web-AI UIs can export wrong data or click unsafe controls. Report-only still builds evidence corpus + surfaces `degraded:true` without changing behavior invisibly. |
| **D8** | Snapshot serializer source: **in-house borrowing playwright-mcp concepts**, not vendor/import `@playwright/mcp`. | `@playwright/mcp` exports only `createConnection(...)` — no public serializer. Vendoring creates upgrade risk. In-house = stable + redacted + token-bounded for our contract. |
| **D9** | Lightpanda P4+ sidecar: **defer indefinitely behind benchmark gate**. | Profile management, CDP/session correctness, action reliability are the current bottlenecks. A second browser runtime multiplies failure modes. Reconsider only if benchmark proves material token/latency wins. |

---

## 3. Module specifications

### M1 — `observe/` (extends existing `src/observe/`)

**Purpose**: low-token observation primitives + scout discovery sub-mode.

**Files** (collapsed from v3.1's 9 → 5):
- `src/observe/snapshot/lite.ts` — AX-tree-first lite snapshot (≤4 KB). In-house formatter borrowing playwright-mcp AX representation concepts.
- `src/observe/scout/frontier.ts` — Coverage map by feature taxonomy. Reuses `src/maintenance/captureSiteMap.ts` + `diffSiteMap.ts` + `probe.ts` (v3.1 §D accepted reuse).
- `src/observe/scout/prober.ts` — Probe DSL runner. YAML probes in `probes/<target>/<feature>.yaml`.
- `src/observe/element-bank/index.ts` — SQLite element evidence + fingerprint cache. Selector candidates seeded from existing `src/observe/selectorCandidates.ts`.
- `src/observe/scout/cli.ts` — `wah scout` subcommand (NOT separate binary per D6).

**Token-budget contract**:
- Lite snapshot ≤ 4 KB (≤ 1k tokens)
- Agent summary ≤ 1 KB (≤ 250 tokens)
- LLM calls ≤ 12 per target per scout run; 0 if `state_hash` unchanged

**Reuse**: `src/observe/selectorCandidates.ts`, `src/maintenance/*`, `src/trace/` (mandatory redaction before persistence).

### M2 — `registry/` (NEW + extends existing `src/capabilities/integrationRegistry.ts`)

**Purpose**: declarative capability metadata → generated tool surface.

**Files**:
- `src/registry/manifest/schema.ts` — Zod schema for manifests. Required fields: `id`, `version`, `target`, `operation`, `kind` (recipe|direct), `safety`, `descriptionLiteral`, `inputSchemaRef`, `outputSchemaRef`. Optional: `selectors`, `recipe`, `evidence`, `errors`, `preconditions`.
- `src/registry/manifest/loader.ts` — YAML loader + schema validation.
- `src/registry/generator/toolSpec.ts` — Emits `src/generated/tools/<adapter-id>.ts` containing `ToolSpec` literals. Build hook: `npm run generate && tsc`. CI gate: `git diff --exit-code src/generated/`.
- `src/registry/verifier/contractVersion.ts` — Verifies `package.json` / `configs/consumer-contract.json` / README / CONSUMER_CONTRACT.md / golden-snapshot consistency.

**Manifest format (final, per D5 hybrid)**:
```yaml
# configs/adapters/webai/chatgpt/send_prompt.yaml
id: webai.chatgpt.send_prompt
version: 1.0.0
target: { kind: webai, provider: chatgpt, baseUrl: https://chatgpt.com/ }
operation: send_prompt
kind: recipe                       # or 'direct' for status/read tools
maturity: stable
safety: { class: write, requiresApproval: true }
descriptionLiteral: |              # verbatim into generated ToolSpec
  Send a prompt to ChatGPT and wait for the response.
  Required: profile, prompt. Returns: { ok, answer, errorCode, evidence }.
inputSchemaRef: ./schemas/webaiSendPrompt.ts#WebAiSendPromptInput   # TS-imported Zod
outputSchemaRef: ./schemas/webaiSendPrompt.ts#WebAiSendPromptOutput
preconditions: [ loginState: logged_in ]
selectors:
  promptBox: { ref: cb_001, heal_policy: report }    # ElementBank ref
  submitButton: { ref: cb_002, heal_policy: off }    # mutating button = no auto-heal
recipe:
  handler: ./handlers/webaiChatgptSendPrompt.ts#run  # TS function
  evidence: { required: [url, snapshot_before, snapshot_after, run_events] }
  errors:
    login: LOGIN_REQUIRED
    captcha: HUMAN_HANDOFF_REQUIRED
    quota: PLAN_OR_QUOTA_REQUIRED
    drift: UI_DRIFT_DETECTED
```

For `kind: direct` (status/read tools like `consumer_health`, `browser_status`):
```yaml
id: meta.consumer_health
kind: direct
direct:
  handler: ./handlers/consumerHealth.ts#run    # existing function, just wrapped
```

**Reuse**: `src/capabilities/integrationRegistry.ts` (extended then subsumed — seed capability index migrates into manifest-backed registry), `src/adapters/`, `src/recipes/`, `src/workflows/` (typed execution targets for manifest `recipe.handler` refs).

### M3 — `runtime/` (consolidates `src/browser/` + injected heal)

**Purpose**: unified browser/profile/tab lifecycle + action execution + heal as injected service.

**Files**:
- `src/runtime/pool/profilePool.ts` — Single `acquireProfile(profileId, runId, opts) → Promise<{ cdpEndpoint, releaseFn }>`. Backed by SQLite advisory lease table (per D3).
- `src/runtime/pool/tabLease.ts` — Per-run, per-profile tab acquisition. Enforces §2.3 ban on `pages()[0]` at API layer. 5-min TTL + heartbeat + cancel.
- `src/runtime/pool/leaseStore.ts` — SQLite `profile_leases` + `tab_leases` tables; TTL GC every 60s; stale-PID detection + reaper.
- `src/runtime/exec/engine.ts` — `ExecutionEngine.run(manifestId, input, runtime)`. State machine: Created → PolicyCheck → AwaitingApproval → Planning → Observing → Executing → Recovering → Extracting → PersistingEvidence → {Completed|Failed|Cancelled|HumanHandoff}.
- `src/runtime/exec/actionDsl.ts` — Action DSL: open / observe / click / type / press / select / upload / waitFor / extract / download / assert / screenshot / humanPrompt.
- `src/runtime/heal/service.ts` — Injected into ExecutionEngine. Resolution order: primary selector → ARIA match → near-text+bbox → DOM fingerprint similarity → `UI_DRIFT_DETECTED`. Confidence formula per D4. Default `report` mode per D7.
- `src/runtime/heal/scoring.ts` — Weighted formula: `0.35*ariaMatch + 0.25*nearTextJaccard + 0.20*bboxOverlap + 0.15*domStructureSimilarity + 0.05*roleExactMatch`. Component scores logged.
- `src/runtime/cancel/registry.ts` — Cancel signal propagation: SQLite `cancel_requests` table. Detached workers poll. ExecutionEngine checks at every `await` boundary.

**Reuse**: `src/browser/managedLauncher.ts` (becomes internal launch primitive — `profilePool` is the external API), `src/browser/profileLease.ts` (persistence layer), `src/browser/sessionPool.ts` + `sessionManager.ts` + `managedCdpSessionManager.ts` (extend, NOT replace — they already handle CDP attachment).

**SQLite schema** (new tables, additive migration):
```sql
CREATE TABLE profile_leases (
  lease_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, run_id TEXT NOT NULL,
  acquired_at TEXT, ttl_seconds INTEGER, last_heartbeat_at TEXT,
  pid INTEGER, cdp_endpoint TEXT, status TEXT
);
CREATE TABLE tab_leases (
  lease_id TEXT PRIMARY KEY, profile_lease_id TEXT, url_match TEXT,
  acquired_at TEXT, ttl_seconds INTEGER, status TEXT
);
CREATE TABLE element_bank (
  id TEXT PRIMARY KEY, manifest_id TEXT, selector_role TEXT, target TEXT,
  state_hash TEXT, primary_css TEXT, primary_xpath TEXT,
  aria_role TEXT, aria_name TEXT, near_text_json TEXT, bbox_json TEXT,
  dom_fingerprint TEXT, last_success_at TEXT, last_failure_at TEXT,
  success_count INTEGER DEFAULT 0, failure_count INTEGER DEFAULT 0
);
CREATE TABLE drift_events (
  run_id TEXT, manifest_id TEXT, selector_role TEXT,
  resolution_step INTEGER, confidence REAL, component_scores_json TEXT,
  ts TEXT
);
CREATE TABLE cancel_requests (
  run_id TEXT PRIMARY KEY, requested_at TEXT, reason TEXT
);
```

### M4 — `facade/` (rewires `src/mcp/tools.ts` internally)

**Purpose**: stable `wah_*` MCP surface for agents + legacy alias preservation.

**Files**:
- `src/facade/wah/capabilityQuery.ts` — `wah_capability_query`
- `src/facade/wah/taskStart.ts` — `wah_task_start` (dry-run support)
- `src/facade/wah/taskStatus.ts` — `wah_task_status`
- `src/facade/wah/taskCancel.ts` — `wah_task_cancel`
- `src/facade/wah/taskResume.ts` — `wah_task_resume`
- `src/facade/wah/artifactGet.ts` — `wah_artifact_get`
- `src/facade/wah/adapterHealth.ts` — `wah_adapter_health`
- `src/facade/wah/policyExplain.ts` — `wah_policy_explain`
- `src/facade/legacy/aliases.ts` — All 38 `webai_*` + 121 `research_*` + `browser_*` + `capability_*` + `workflow_*` + `consumer_health` keep their MCP names; internally each is a 1-line `return ExecutionEngine.run('<adapter-id>', args, runtime)`.

**Total new commands**: 8 `wah_*` (per ledger in §5 below). Legacy names: zero change.

**Reuse**: `src/safety/` (safety classification — referenced by manifest + exec policy gates), `src/mcp/tools.ts` (rewired bodies only — `ToolSpec` literals still appear here for greppability).

---

## 4. The codemod (replaces v3.1's 9 wave-by-wave phases)

**Per xhigh D + §4**: structural repetition is so high (92 `ManagedBrowserLauncher` sites + 40 identical `flow.ts` files) that wave-by-wave migration is busywork. v3.2 ships ONE atomic codemod PR.

**The codemod** (~2 weeks):

| Day | Work |
|---|---|
| 1-2 | Author `scripts/codemod-managed-launcher.ts` (jscodeshift / ts-morph). Transforms `const launcher = new ManagedBrowserLauncher(); ... launcher.launch(...)` → `const lease = await profilePool.acquireProfile(...)`. Dry-run on all 92 sites. |
| 3-5 | Author `scripts/generate-research-db-manifests.ts`. Reads each of the 40 `src/mcp/researchdb/<db>/flow.ts` files, extracts the parameterized constants (`DB_NAME`, `CDP_PORT`, `BASE_URL`, `SEARCH_URL_TEMPLATE`, etc.), writes `configs/adapters/researchdb/<db>/{search,filter,export}.yaml`. The 3 handlers per DB collapse into 3 template handler functions parameterized by manifest. |
| 6-7 | Author `scripts/generate-tools.ts` (the M2 generator). Reads manifests, emits `src/generated/tools/<id>.ts` containing `ToolSpec` + body that calls `ExecutionEngine.run(...)`. Wire into `npm run build`. |
| 8-9 | Run all three scripts. Diff `dist/` between before-codemod and after-codemod. Golden snapshot test: `listMcpTools()` JSON output must be byte-identical except for the explicitly-listed deltas. |
| 10 | Add `wah_*` 8 new commands. Update `configs/consumer-contract.json` (1.6.0→1.7.0, errors 32→34). Update `tests/consumerContract.test.ts` line-by-line (the deltas are pre-listed in the codemod-PR description). |
| 11-12 | Live smoke: 3 web-AI sends + 5 research-DB searches via the new code path. 6-lock verification: pkg 1.0.0 candidate / contract 1.7.0 / cmds 189 / errors 34 / webai_ 38 / research_ 121. |
| 13-14 | Review fixes + rollback notes. Codemod is ONE PR; if rejected, `git revert` puts everything back atomically. |

**Result**: at end of week 2, the codebase is 100% on the new architecture. NO dual-architecture limbo (which is the real cost v3.1 was paying with its 9-wave plan).

---

## 5. Phasing — 4 phases over 6 weeks

| Phase | Week | Ships | Gates | Lock targets |
|---|---|---|---|---|
| **P0** | 1 | Contract verifier + manifest schema + generator skeleton + golden ToolSpec diff harness. No behavior change. | `npm run verify:contract-version` green; golden harness captures current 181-cmd / 32-err snapshot. | 0.7.1 / 1.6.0 / 181 / 32 / 38 / 121 |
| **P1** | 2-3 | **Atomic codemod PR** (per §4 above). 92 launcher sites + 40 research DB manifests + generator output + 8 `wah_*` commands all ship together. Heal layer wired in `report` mode (default off → no behavior change unless `heal_mode=report` opt-in). | Golden snapshot diff = only listed deltas. All live smokes green. Codemod PR reviewed + merged. | 0.9.0 / 1.7.0 / 189 / 34 / 38 / 121 |
| **P2** | 4-5 | ExecutionEngine wired through all 38 webai_ + 121 research_ legacy aliases. Cancel + heartbeat + TTL fully active. Report-only heal evidence accumulates. `wah_task_cancel` + `wah_task_resume` operational. | Drift events visible in `data/drift_events.sqlite`. ≥60% of failed selectors have a `report`-mode candidate. Cancel works for Gemini Veo long-runs. | 0.9.0 / 1.7.1 / 189 / 36 / 38 / 121 |
| **P3** | 6 | Remove obsolete handwritten paths whose tests now run through generator. Publish migration notes. Dashboard / health summaries (read-only, basic). Document Stagehand + Lightpanda as future work behind benchmark gates. | All 427+ tests pass. Migration notes in `docs/MIGRATION_v3.2.md`. | **1.0.0** / 1.7.1 / 189 / 36 / 38 / 121 |

**P4** (not required for v1.0): Stagehand local-mode evaluation, Lightpanda sidecar benchmark, full dashboard. Opt-in only.

---

## 6. Existing-asset disposition (per xhigh §5)

| Existing file | v3.2 disposition |
|---|---|
| `src/adapters/` | **Extend/reuse.** Manifests bind to existing adapter functions. No second abstraction. |
| `src/recipes/` | **Extend.** Recipes become typed execution targets for manifest `recipe.handler` refs. |
| `src/workflows/` | **Extend.** Workflow primitives inform ExecutionEngine state transitions. |
| `src/capabilities/integrationRegistry.ts` | **Extend then subsume.** Seed capability index migrates to manifest-backed registry. |
| `src/observe/selectorCandidates.ts` | **Reuse.** Candidate generator for scout/heal scoring. No reinvention. |
| `src/safety/` | **Reuse/extend.** Safety classification stays authoritative; referenced by manifests + exec policy. |
| `src/browser/sessionPool.ts` | **Extend → converge.** v3.2 ProfilePool absorbs its responsibilities under SQLite leases. |
| `src/browser/sessionManager.ts` | **Extend.** Coordination surface kept; profile-ownership duplication folded into ProfilePool. |
| `src/browser/managedCdpSessionManager.ts` | **Reuse.** CDP attachment primitive under runtime; no reimplement. |
| `src/browser/managedLauncher.ts` | **Reuse (internal).** Becomes internal launch primitive; external API is `profilePool`. |
| `src/browser/profileLease.ts` | **Reuse (extended).** Becomes persistence layer of `profilePool` lease store. |
| `src/browser/artifactClick.ts` | **Reuse.** Still the primitive for sandbox-iframe downloads. M3 ExecutionEngine calls it; no rewrite. |
| `src/maintenance/captureSiteMap.ts` + `diffSiteMap.ts` + `probe.ts` | **Reuse.** M1 scout calls these directly; no duplication. |
| `src/trace/` | **Reuse mandatory.** Redaction required before any snapshot/evidence/log persist. |
| `src/mcp/tools.ts` | **Internal rewire only.** ToolSpec literals still here for greppability; bodies become 1-line `ExecutionEngine.run(...)`. |

**Net new code**: ~3,000 LOC (M1 5 files + M2 4 files + M3 8 files + M4 9 files + codemod scripts + SQLite migrations).

**Net removed code**: ~6,000 LOC (40 `researchdb/<db>/tools.ts` boilerplate collapsed + duplicated launcher constructions + duplicated profile-management).

**Net delta**: -3,000 LOC (50% reduction in churn surface area).

---

## 7. Per-phase command ledger

### P1 adds 8 commands (181 → 189), contract 1.6.0 → 1.7.0, error_codes 32 → 34

| CLI | MCP | TS export | Contract row | error_codes added |
|---|---|---|---|---|
| `wah:capability:query` | `wah_capability_query` | `wahCapabilityQuery` | #182 | — |
| `wah:adapter:health` | `wah_adapter_health` | `wahAdapterHealth` | #183 | — |
| `wah:policy:explain` | `wah_policy_explain` | `wahPolicyExplain` | #184 | — |
| `wah:task:start` | `wah_task_start` | `wahTaskStart` | #185 | — |
| `wah:task:status` | `wah_task_status` | `wahTaskStatus` | #186 | — |
| `wah:task:cancel` | `wah_task_cancel` | `wahTaskCancel` | #187 | — |
| `wah:task:resume` | `wah_task_resume` | `wahTaskResume` | #188 | — |
| `wah:artifact:get` | `wah_artifact_get` | `wahArtifactGet` | #189 | — |
| — | — | — | — | `UI_DRIFT_DETECTED` (33), `HEAL_CONFIDENCE_LOW` (34) |

### P2 adds 2 error codes (34 → 36), contract 1.7.0 → 1.7.1

| error_codes added |
|---|
| `PROFILE_LEASE_TIMEOUT` (35) |
| `TAB_LEASE_EXPIRED` (36) |

### P3 — no new commands, no contract bump (collapse is internal-only)

---

## 8. Top 5 risks

| Risk | Mitigation |
|---|---|
| Generated `ToolSpec` drift from current contract | Golden JSON snapshots + consumer-contract verifier. CI fails on unexpected diff. |
| Atomic codemod PR review size | Separate generator code, generated output, and mechanical replacements into commits within the single PR. Reviewer can read commit-by-commit. |
| SQLite lease edge cases under crashed processes | TTL + owner heartbeat + stale-lease reclaim every 60s + explicit cancel tests. |
| Manifest under-modeling of special-case sites | `kind: direct` escape hatch for sites needing TS-only handlers. Per-site `selectors.<role>.override` allows manifest hot-fix without generator regen. |
| Heal/scout evidence privacy or token leakage | Mandatory `src/trace/` redaction before persist. Report-only is the default until evidence quality is proven. |

---

## 9. What v3.2 does NOT do

1. **No new external dependencies.** No Stagehand, no @playwright/mcp imports, no lightpanda. Zero new npm installs beyond what's already in `package.json`.
2. **No anti-detect, no stealth, no proxy rotation, no CAPTCHA bypass** — same as v3 / v3.1.
3. **No contract 2.0 break.** Minor bumps only through v1.0 ship.
4. **No browser fork, no custom Chromium.** Stays on managed Chrome + CDP.
5. **No removal of any of the 38 webai_ / 121 research_ / browser_ / capability_ / workflow_ / consumer_health tool names.** Schemas frozen.
6. **No Python sidecar.** Stays pure TypeScript.
7. **No 5-phase 8-week migration.** Atomic codemod + 3 follow-on phases over 6 weeks.
8. **No "needs spike to decide later" decisions.** All 9 D1-D9 are made now.

---

## 10. Strategic decisions left to user (the only questions you need to answer)

These are the 3 high-level questions that NEED user input. All implementation details are already decided.

### Q1. Scope confirmation

Does the refactor cover both `webai_*` AND `research_*` AND `browser_*` in one v3.2 codemod, or split?

- **Option A** (v3.2 recommended): all 159 tools touched in one atomic codemod PR. Maximum structural payoff in 6 weeks.
- **Option B**: only `webai_*` (38 tools) in v3.2; `research_*` (121 tools) deferred to v3.3 in a separate refactor. Lower-risk but preserves the 40-DB boilerplate for another release cycle.
- **Option C**: only the new `wah_*` facade (8 tools) ships in v3.2; legacy `webai_*` + `research_*` keep current implementation indefinitely. Smallest blast radius but doesn't fix P2/P3/P4 root cause.

### Q2. Codemod ship risk appetite

Atomic codemod PR (v3.2 recommended) is one giant diff. ~1k lines generated + ~92 mechanical replacements + ~40 `.yaml` files + ~3k LOC new. Reviewable but big.

- **Option A** (v3.2 recommended): one atomic PR. Reviewer reads commit-by-commit; rollback = single `git revert`.
- **Option B**: split into 4 PRs (generator + research-db manifests + launcher codemod + facade rewire) over 2 weeks. Each PR independently revertable. More overhead, more dual-architecture window per PR.
- **Option C**: keep v3.1's wave-by-wave 9-phase plan. Slower (8-10 weeks) but each wave is small. Most conservative.

### Q3. v3.2 doc finalization

- **Option A**: this `web-ai-refactor-v3.2-final.md` is the spec. P0 dispatch can start tomorrow.
- **Option B**: want amendments first (specify which §).
- **Option C**: want a 1-page executive summary for stakeholder review before P0 dispatches.

---

## 11. Approval matrix

| Decision | Owner | Trigger |
|---|---|---|
| Adopt v3.2 (this file) as the refactor spec | User | reply "approve v3.2" or amendments |
| Authorize P0 dispatch (1 week — verifier + schema + generator skeleton + golden harness) | User | "go P0" after Q1+Q2+Q3 answered |
| Authorize P1 codemod PR (2 weeks — biggest single dispatch) | User | "go P1" after P0 ship + golden harness captures baseline |
| Authorize P2 dispatch (2 weeks — ExecutionEngine + cancel/heartbeat + heal report) | User | "go P2" after P1 ship + 1 week parallel-run shows codemod stable |
| Authorize P3 (1 week — cleanup + 1.0.0 ship) | User | "go P3" after P2 ship + drift evidence visible |

---

## 12. Final references

- **This file**: `docs/plans/web-ai-refactor-v3.2-final.md`
- v3.2 sources:
  - User pain points (verbatim 2026-05-23)
  - `refector-ref/low-token-web-ai-discovery-plan.md`
  - `refector-ref/web-ai-capability-hub-optimization-plan/{00..08,README,REFERENCES,CHANGELOG_PROPOSAL}.md`
  - Subagent reports: `oh-my-claudecode:explore` (codebase audit), `oh-my-claudecode:document-specialist` (17 OSS + 5 2026 new finds)
  - Codex critique medium: `.omc/codex-out/refactor-v3-critique.md` (3 Critical + 9 High)
  - Codex critique **xhigh**: `.omc/codex-out/refactor-v3-critique-xhigh.md` (9 decisions + 4-module collapse + codemod recommendation)
- v3 baseline (superseded): `docs/plans/web-ai-refactor-v3.md`
- v3.1 deltas (superseded): `docs/plans/web-ai-refactor-v3.1-revisions.md`
- Project policy: `CLAUDE.md` §1 / §2.3 / §2.4 / §5
