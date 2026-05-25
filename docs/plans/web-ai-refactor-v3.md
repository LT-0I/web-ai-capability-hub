# Web AI Capability Hub — Refactor v3 (Scout + Manifest + Profile Pool)

> Status: **DRAFT for adversarial review**  •  Author: orchestrator session  •  Date: 2026-05-23  •  HEAD pin: `a1c51e3`
>
> Supersedes (does not replace) `web-ai-automation-v2.md`. v2 was an execution plan for the existing hand-rolled architecture; v3 is a structural refactor of that architecture itself, motivated by four user-stated pain points and ~30 codex-iterated selector-patch rounds in the last two weeks.
>
> This is a **planning document only**. No code changes ship from this file. Implementation is gated on (a) user approval of the open decision points in §11, (b) adversarial critique by codex (artifact `.omc/codex-out/refactor-v3-critique.md`), and (c) phased dispatches per the existing `omx exec` discipline in `CLAUDE.md`.

---

## 0. Executive summary

The hub today is a good v0.7 capability container but a **bad v1.0 platform**. It works because the issue-fix loop manually patches whatever drifts. That is not sustainable: every UI change is a 3-round codex dispatch + live smoke + ship cycle. The four user-stated pain points are real and each has a single structural cause in the code.

The refactor proposes **five orthogonal modules** layered onto (not replacing) the current code:

| # | New module | Fixes pain point | Risk |
|---|---|---|---|
| 1 | **`scout/`** — lite-snapshot / frontier / element-bank / probe DSL | P1 token cost | low (additive, no compat surface) |
| 2 | **`registry/`** — manifest-driven adapter loader + tool generator | P2 tool-layer rigidity | medium (touches MCP schema) |
| 3 | **`heal/`** — selector self-healing + drift detector with fingerprint cache | P3 update mechanism | medium (instruments existing tools) |
| 4 | **`pool/`** — unified browser pool + tab lease + serialized launch queue | P4 profile chaos | medium (replaces ManagedBrowserLauncher entrypoints) |
| 5 | **`wah/` facade** — unified MCP envelope `wah_capability_query/task_start/status/resume/...` | UX for agents | low (additive surface) |

The 6 locks remain held throughout (pkg 0.7.0, consumer-contract-1.6.0, 181 cmds, 32 error codes, webai_ 38, research_ 121). New surfaces ship under a **`consumer-contract-1.7.0-additive` minor bump** in P1, not a 2.0 break.

**Zero adoption of stealth-class tooling**: CloakBrowser, obscura, Skyvern Cloud, lightpanda (AGPL), BrowserOS (AGPL), AgentGPT (GPL) are all rejected. The borrowable-idea picks are Stagehand (MIT, action cache + act/extract/observe split), playwright-mcp (Apache-2.0, AX-tree formatter), vercel agent-browser (Apache-2.0, ref-based AX addressing as protocol), actionbook (Apache-2.0, session+tab pool design), healwright npm (self-healing locator wrapper, evaluate before adopting). Two are **adopt directly as deps** (Stagehand local-mode, playwright-mcp AX serializer); the rest are **borrow design patterns only**.

---

## 1. Evidence-based pain map (from §audit, file:line cited)

### P1. Token cost in agent probing

- `src/reader/snapshot.ts:14–22` — `readPageSnapshot()` unconditionally returns full DOM extraction + AX tree + screenshot. No lite/focused/full mode parameter.
- `src/reader/domExtract.ts:118–150` — `extractElementsFromHtml()` walks every button/link/input/textarea/select + role-tagged node, emits 3–5 selector candidates per element, no visibility/relevance filter.
- `src/reader/accessibility.ts:24–34` — `readAccessibilitySummary()` calls Playwright `accessibility.snapshot({interestingOnly:true})` then recurses 6 levels deep with 160-node-per-level budget.
- `src/mcp/tools.ts:2372` — `browser_read` tool calls `readPageSnapshot(page, { includeAccessibility: true, screenshot: true })` by default. Single 500KB–2MB JSON envelope back to consumer.
- **Root cause**: monolithic snapshot, no agent-summary tier, no `state_hash` for incremental diff, no chunking, no cache breakpoint.

### P2. Tool-layer rigidity

- `src/mcp/tools.ts:2954–3150` — `coreToolSpecs` is a ~200-line hand-wired array. Each of the 159 tools is a literal `ToolSpec` object.
- `src/mcp/researchdb/{aiaa,wos,...}/tools.ts` — 40 research DBs × identical 36-line copy-paste pattern → ~2237 LOC of structural duplication.
- `src/mcp/tools.ts:445–526` — Selectors are module-level constants (`CHATGPT_IMAGE_OPEN_VIEWER_SELECTOR`, `GEMINI_VIDEO_PROMPT_SELECTOR`, ...). No data-driven override path.
- `src/mcp/tools.ts:3681–3699` — `callMcpTool()` does linear `.find()` on `toolSpecs[]`. No registry, no factory, no metadata-driven dispatch.
- **Root cause**: tools are static handlers, not data. Adding a target = code edit + rebuild. Drifted selectors = code edit + rebuild.

### P3. No automated update mechanism

- `src/observe/selectorCandidates.ts:11–26` — alternative selectors ARE generated at read time (ID, data-testid, name, aria-label, placeholder, role+name) but no feedback loop captures which candidate actually worked.
- `src/maintenance/{captureSiteMap,diffSiteMap,probe}.ts` — these exist but are **manual** audit tools, not background drift detectors.
- Recent git log: 30 R-rounds across #10 / #13 / #16 — each triggered by consumer-side failure, each handled by a codex dispatch that hand-edits `tools.ts`.
- **Root cause**: drift is detected by smoke-test failure (i.e. the consumer), then resolved by human (codex). No telemetry of selector success/failure, no fingerprint-match fallback, no automatic re-probe scheduler.

### P4. Browser profile chaos

- `src/browser/managedLauncher.ts:129–238` — `ManagedBrowserLauncher` holds **one** `launchedProcess` per instance. Multiple callers → multiple launchers → potential duplicate Chrome spawn on same profile.
- `src/browser/profileLease.ts:26–49` — `acquireProfileLease()` writes SQLite lease record, but no expiry, no auto-cleanup, no contention queue.
- `src/browser/profileLease.ts:80–95` — `releaseLeaseAndCleanLocks()` reactive lock-file delete; runs only on explicit user call.
- `CLAUDE.md:~120` — "Launching the three web-AI chromes in parallel. Wrong. They race on the global SingletonLock. Always serialize the three `browser:launch` calls." Documented as user-operational workaround.
- **Root cause**: profile coordination is per-process and file-based. No global queue, no lease TTL, no automatic stale-lock GC. Concurrent launches race.

---

## 2. Design principles (non-negotiable)

1. **Additive, not destructive.** Every existing `webai_*` / `research_*` tool keeps working byte-identically. New modules wrap, never replace, in P1–P3. Replacement only after P4 ship + 2 weeks of consumer parallel-run.
2. **Honest errors only.** The §2.3 ban from `CLAUDE.md` holds. New `UI_DRIFT_DETECTED` / `SELECTOR_HEALED` / `HEAL_CONFIDENCE_LOW` codes augment the taxonomy; they NEVER silently substitute a different answer.
3. **No stealth, no AGPL.** Rejects CloakBrowser, obscura, lightpanda, BrowserOS, Skyvern, AgentGPT. License + safety policy override "cool tech" arguments.
4. **Two-tier execution.** Determinstic (cached / manifest) is default. AI/visual is **fallback only**, gated behind `exploration_allowed=true` per-target.
5. **6 locks remain held through every intermediate ship.** Refactor must not break the existing post-ship contract-test invariants.
6. **Codex-dispatched code edits only.** Orchestrator (this session) writes plans, manifests, schemas; never `src/` code. Per `CLAUDE.md` §1.

---

## 3. Target architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Local Agent (Claude Code / Codex / OpenClaw)                      │
└─────────┬──────────────────────────┬───────────────────────────────┘
          │ Facade (low-token)       │ Targeted (precise)
          ▼                          ▼
┌────────────────────┐    ┌────────────────────────────────────────┐
│  wah_capability_*  │    │  webai_chatgpt_*  webai_claude_*       │
│  wah_task_*        │    │  webai_gemini_*   research_*_*         │  ← unchanged
│  wah_artifact_*    │    │  browser_*  capability_*  workflow_*   │
│  wah_adapter_*     │    │  consumer_health                       │
│  wah_policy_*      │    └────────────────────────────────────────┘
└─────────┬──────────┘                          │
          │                                     │
          ▼                                     │
┌────────────────────────────────────────────┐  │
│  CapabilityRegistry  (M2)                  │◀─┘  legacy handler internally
│  - manifest loader (YAML → ZodSchema)      │     resolves to a manifest
│  - tool generator (writes ToolSpec)        │     and routes through the
│  - capability_query / health               │     ExecutionEngine
└──────────────────────┬─────────────────────┘
                       ▼
       ┌───────────────────────────────────┐
       │  ExecutionEngine  (M5)            │
       │  - state machine                  │
       │  - action DSL runner              │
       │  - approval gate hook             │
       │  - evidence store writer          │
       └─┬─────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│  Heal layer (M3)   ←→   ElementBank (SQLite fingerprint cache)     │
│  - selector miss → fingerprint lookup → reload candidate           │
│  - confidence ≥ τ → execute + log SELECTOR_HEALED                  │
│  - confidence < τ → UI_DRIFT_DETECTED + record drift event         │
└──────────────────────┬─────────────────────────────────────────────┘
                       ▼
       ┌───────────────────────────────────┐
       │  BrowserPool  (M4)                │
       │  - profile lease w/ TTL + queue   │
       │  - tab lease per run              │
       │  - serialized launch              │
       │  - auto-cleanup stale locks       │
       │  - engine router:                 │
       │      * Playwright+CDP (default)   │
       │      * AX-tree-only (read-only)   │
       │      * (no stealth, no lightpanda)│
       └─┬─────────────────────────────────┘
         ▼
       ┌──────────────────┐
       │  Managed Chrome  │   chatgpt-9223 / claude-9224 / gemini-9225
       │  (CDP, visible)  │
       └──────────────────┘

──────────────────────────────────────────────────────────────────────
Side-band:
       Scout (M1)        — wah-scout CLI, low-token discovery pipeline
       Frontier coverage — taxonomy → coverage_map → unexplored frontiers
       Probe DSL         — declarative observe/act/extract per feature
       LLM Judge         — gated, ≤12 calls/target/run, fixed-JSON-out
```

---

## 4. OSS adoption decisions

### 4.1 Adopt as direct dependency

| Pick | License | What we add | Where |
|---|---|---|---|
| **`@playwright/mcp` (snapshot serializer only)** | Apache-2.0 | AX-tree formatter that produces 2–10 KB lite snapshots, ref-addressed | `src/scout/snapshot.ts` (vendored helper or thin wrapper, NOT the MCP server itself) |
| **`stagehand` local-mode** | MIT | `act()` / `extract()` / `observe()` + action cache | `src/heal/actionCache.ts` (used by ExecutionEngine when manifest marks step `aiAssisted: true`) |

Both are evaluated for size, runtime cost, transitive deps before P1 ship. If either fails the audit (e.g. Stagehand local-mode requires a paid Browserbase key for cache invalidation), we drop the dep and reimplement the pattern.

### 4.2 Borrow design patterns (no dep)

| Source | Pattern | Implemented as |
|---|---|---|
| vercel-labs/agent-browser | ref-based AX addressing (`@e7` instead of `[data-testid=...]`) | Protocol convention in `wah_task_start` input/output |
| actionbook | named `session` + `tab` pool, action manuals | `src/pool/sessionTab.ts` + `configs/action-manuals/*.yaml` |
| Scrapling | adaptive selector fingerprint (struct + text + nearby labels) | `src/heal/elementBank.ts` (SQLite-backed, TS impl) |
| AutoCLI | declarative YAML adapter pipeline | `configs/adapters/{webai,researchdb}/*.yaml` |
| browser-use | per-context cookie/storage isolation | enforce in `BrowserPool` profile dirs |
| Anthropic prompt caching | cache breakpoint after capability registry | document in `docs/AGENT_PROMPT_CACHING.md` |
| healwright npm | self-healing locator wrapper | study before reimplementing — license check pending |

### 4.3 Reject

| Project | Reason |
|---|---|
| CloakBrowser | Stealth-class + CAPTCHA bypass; bans §2.3. |
| h4ckf0r0day/obscura | Stealth as core feature; cannot be disabled. |
| Skyvern | AGPL viral + CAPTCHA solvers in Cloud tier. |
| lightpanda | AGPL viral + JS-compat gaps for SPA web-AI. |
| BrowserOS | AGPL + custom Chromium fork. |
| AgentGPT | GPL viral + stale since 2025-04. |
| browser-use (as dep) | Python stack mismatch. Borrow pattern only. |
| Magnitude | Vision-first worsens P1; stale since 2026-02. |
| autocli-skill | No license. |

### 4.4 Defer

| Project | Why defer |
|---|---|
| browser-mcp-lite | Useful study model; revisit in P4 if our AX serializer needs simplification. |
| playwright-cli SKILLS mode | Useful for codex-side orchestration token budget; not the hub-side concern. Document as recommendation only. |
| minhlucvan/agent-browser-mcp | Bridge layer; only relevant if we commit to vercel agent-browser as runtime — currently we are not. |

---

## 5. Module specifications

### 5.1 M1 — Scout (`src/scout/`)

**Purpose**: low-token discovery pipeline. Replaces "let codex/Claude Code dump the page" with "scout produces a 1-3 KB summary, agent reads only that, asks for ≤12 LLM judgments per run."

**Components** (all new files, no existing-code edits):
- `snapshot.ts` — Raw / Lite / AgentSummary tiers. Each tier has a `state_hash` for incremental diff.
- `reducer.ts` — Lite-snapshot reducer: visible interactive elements only, near-text + bbox + role.
- `frontier.ts` — Coverage map keyed by feature taxonomy (composer / input_assets / model_and_mode / artifacts / media_generation / workspace / history / account / integrations).
- `prober.ts` — Probe DSL runner. Reads `probes/<target>/<feature>.yaml`, executes deterministic observe→act→assert sequence, writes evidence.
- `element-bank.ts` — Persisted selector evidence (forwarded to M3 heal layer).
- `evidence-store.ts` — `data/scout/runs/<run_id>/{snapshots,events,artifacts}/`.
- `llm-judge.ts` — Gated LLM calls with fixed-JSON output. Budget enforcement.
- `manifest-promoter.ts` — Successful probe → `configs/adapters/<target>/<feature>.yaml` manifest.
- `cli.ts` — `wah-scout` binary (NOT registered as MCP tool — CLI is the point).

**Token-budget contract** (per `low-token-web-ai-discovery-plan.md` §12 targets):
- Lite snapshot ≤ 4 KB → ≤ 1k tokens
- Agent summary ≤ 1 KB → ≤ 250 tokens
- LLM calls ≤ 12 per target per run
- Same `state_hash` → 0 LLM calls

### 5.2 M2 — Registry (`src/registry/`)

**Purpose**: turn the 159 hand-wired ToolSpec literals into manifest-driven dispatch.

**Manifest schema** (already drafted in `refector-ref/.../schemas/capability-manifest.schema.json`; v3 adopts as-is with two additions: `heal.fingerprintRef` and `engineHint`):

```yaml
id: webai.chatgpt.send_prompt
version: 1.0.0
target: {kind: webai, provider: chatgpt, baseUrl: https://chatgpt.com/}
operation: send_prompt
maturity: stable
safety: {class: write, requiresApproval: true}
input: {schema: ...}        # Zod-compilable JSON Schema
output: {schema: ...}
preconditions: [browserProfile: chatgpt, loginState: logged_in]
selectors:
  promptBox: {candidates: [...], stability: 0.72, fingerprintRef: cb_001}
  submitButton: {candidates: [...], stability: 0.81, fingerprintRef: cb_002}
recipe:
  steps: [observe, type, click, waitFor, extract]
evidence: {required: [url, snapshot_before, snapshot_after, run_events]}
errors:
  login: LOGIN_REQUIRED
  captcha: HUMAN_HANDOFF_REQUIRED
  quota: PLAN_OR_QUOTA_REQUIRED
  drift: UI_DRIFT_DETECTED
engineHint: playwright-cdp     # never lightpanda for web-AI
```

**Tool generator**: reads `configs/adapters/**/*.yaml` → emits ToolSpec stubs that call `ExecutionEngine.run(manifestId, input)`. Generated stubs replace the hand-wired bodies but keep the **exact same `name`, `description`, `inputSchema` outer shape** (contract-frozen).

**Migration order** (NOT all 159 at once):
1. P1 ship: 4 pilot manifests — `webai_chatgpt_send_prompt`, `webai_claude_send_prompt`, `webai_gemini_send_prompt`, `research_ieee_search`. Round-trip proven.
2. P2 ship: rest of `webai_*` (38 total).
3. P3 ship: `research_*` (121 total). The 40-DB copy-paste finally collapses.

### 5.3 M3 — Heal (`src/heal/`)

**Purpose**: stop the codex selector-fix loop.

**`ElementBank`** — SQLite table:
```sql
CREATE TABLE element_bank (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  selector_role TEXT NOT NULL,          -- "promptBox", "submitButton"
  target TEXT NOT NULL,                  -- "webai.chatgpt"
  state_hash TEXT NOT NULL,
  primary_css TEXT,
  primary_xpath TEXT,
  aria_role TEXT,
  aria_name TEXT,
  near_text_json TEXT,
  bbox_json TEXT,
  dom_fingerprint TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0
);
```

**Resolution order** when ExecutionEngine asks for a selector:
1. Primary CSS / XPath from manifest → if works, increment `success_count`.
2. ARIA role + name match.
3. ARIA path / label fuzzy.
4. Near-text + bbox match.
5. DOM fingerprint similarity.
6. **Stop here** — surface `UI_DRIFT_DETECTED` with `evidence.heal_attempts[]`. Do NOT fall through to LLM unless `heal.exploration_allowed=true` in manifest.

**Drift event** — every healing > step-1 writes a row to `drift_events`:
```sql
CREATE TABLE drift_events (
  run_id TEXT, manifest_id TEXT, selector_role TEXT,
  resolution_step INTEGER, confidence REAL, ts TEXT
);
```

**Daily report** — `npm run heal:report` emits `data/heal/daily-<date>.md` showing top-drifted selectors. The issue-fix loop reads this instead of waiting for consumer failures.

### 5.4 M4 — BrowserPool (`src/pool/`)

**Purpose**: kill the SingletonLock race and the "I have no idea if profile X is free" problem.

**`ProfilePool`** — singleton across the process:
- Profile leases with TTL (default 30 min, renewable).
- Launch queue: serializes `browser:launch` for the same profile.
- Auto-cleanup: every 60 s, GC leases whose Chrome PID is dead and whose lock files are stale.
- `acquireProfile(profileId, runId, opts) → { cdpEndpoint, releaseFn }` is a Promise that QUEUES if profile is held by another runId.

**`TabLease`** — per run, per profile:
- `acquireTab(profileLease, { urlContains, urlEquals }) → { page, releaseFn }`.
- Enforces the existing §2.3 ban on `pages()[0]` at the API layer (no silent picks).
- Tab lease TTL = parent profile TTL.

**Engine router** — limited and explicit:
- `playwright-cdp` (default): logged-in / mutating / web-AI / research-DB.
- `playwright-readonly`: public read-only pages where AX-tree is sufficient.
- *(No lightpanda. No stealth. Listed for future consideration only if AGPL changes.)*

**Removes / wraps**:
- `managedLauncher.ts` becomes the **internal** launch primitive; external callers route through `ProfilePool`.
- `profileLease.ts` becomes the persistence layer of `ProfilePool`.

### 5.5 M5 — wah_ Facade + ExecutionEngine

**Facade tools** (new, additive — bumps to `consumer-contract-1.7.0`):
- `wah_capability_query` — list / filter capabilities.
- `wah_task_start` — start a run (dry-run support).
- `wah_task_status` — poll.
- `wah_task_resume` — after `HUMAN_HANDOFF_REQUIRED`.
- `wah_artifact_get` — read artifact metadata/text/path.
- `wah_adapter_health` — selector health, login state, last drift.
- `wah_policy_explain` — why is this gated / blocked.

**ExecutionEngine** — single entry point used by both new facade tools AND the legacy 159 tools (after their internal rewire in M2). State machine per `optimization-plan/03_execution_engine_design.md` §3.3.

---

## 6. File / directory reorganization

### 6.1 New paths

```
src/
  scout/         — M1 (CLI binary, no MCP exposure)
  registry/      — M2 manifest loader + tool generator
  heal/          — M3 element bank + drift detector
  pool/          — M4 profile + tab leases
  exec/          — M5 ExecutionEngine + state machine
  facade/        — M5 wah_* tool handlers
configs/
  adapters/
    webai/{chatgpt,claude,gemini}/*.yaml
    researchdb/{ieee,wos,aiaa,...}/*.yaml
  action-manuals/{chatgpt,claude,gemini}.yaml
probes/
  {chatgpt,claude,gemini}/*.yaml
data/
  scout/runs/<run_id>/...
  heal/element-bank.sqlite
  pool/profile-leases.sqlite
docs/
  WAH_REFACTOR_V3.md (this file → moves to docs/plans/)
  AGENT_PROMPT_CACHING.md
  SCOUT_GUIDE.md
  HEAL_GUIDE.md
```

### 6.2 Untouched

```
src/mcp/         — tools.ts stays as the public surface (internally rewires per M2)
src/browser/     — managedLauncher.ts + artifactClick.ts + sessionManager.ts stay,
                   but ProfilePool becomes the external API
src/capabilities/ — SQLite integration_registry stays authoritative
src/observe/, src/reader/, src/recipes/ — augmented, not replaced
configs/consumer-contract.json — bumps to 1.7.0 in P1 (additive only)
```

### 6.3 Eventually deleted (P3+ only, after parallel-run validation)

- 40 × `src/mcp/researchdb/<db>/tools.ts` duplicate boilerplate — collapses into generator output from manifests.
- Hand-rolled selector constants in `src/mcp/tools.ts:445–526` — move to manifests.

---

## 7. Migration phases

| Phase | Version | Ships | Gates | Compat |
|---|---|---|---|---|
| **P0** | 0.7.1 patch | Contract-version verifier script. `npm run verify:contract-version` fails CI if `package.json` / `configs/consumer-contract.json` / README / CONSUMER_CONTRACT.md drift. No new modules, no new tools. | Existing 427/427 tests green. 6 locks held. | 100%. |
| **P1** | 0.8.0 | M1 scout CLI (no MCP). M3 ElementBank schema + populate from current 30 R-round selectors. 4 pilot manifests in M2 round-tripped. `wah_capability_query` + `wah_adapter_health` shipped. **No legacy tool body changes** — they still run the hand-rolled code. | 4 manifests pass fixture tests. Scout produces ≤ 4 KB lite snapshot for each of 3 web-AI tabs. ElementBank populated from `git log --grep selector --since 2026-05-01` audit. 6 locks held. Contract bumps to 1.7.0. | 100%. |
| **P2** | 0.9.0 | M4 ProfilePool replaces external entrypoints to ManagedBrowserLauncher. M5 ExecutionEngine + state machine. All 38 `webai_*` legacy handlers internally rewire to `ExecutionEngine.run(manifestId)`. `wah_task_*` facade beta shipped. | Existing webai live smokes 100% green via new path. New runs visible in `data/scout/runs/`. Drift events written to `drift_events`. 6 locks held. | 100% (legacy tool names & schemas frozen). |
| **P3** | 1.0.0 | All 121 `research_*` migrated to manifests + generator. 40 × `researchdb/<db>/tools.ts` collapsed. Contract finalized at 1.8.0 (still additive). | Full contract regression. 6 locks: pkg 1.0.0 / contract 1.8.0 / cmds 181 / errors 32 / webai_ 38 / research_ 121 (cmd count unchanged — manifest count, not surface count, is what grew). | 100%. |
| **P4** | 1.1.0 | Optional Stagehand local-mode for `aiAssisted` steps. `wah-scout promote` writes new manifests. Auto-drift-detector cron. Local dashboard (read-only). | Stagehand evaluation report. If license/runtime/cost fails → pattern is reimplemented in-house. | 100%. |

**Per-phase ship discipline** (binds the orchestrator):
- Each phase = one or more codex dispatches via `omx exec` with prompt files in `.omc/codex-prompts/`.
- Independent gate after each: `rm -rf dist && rtk npm run build && rtk npm test`, 6 locks verified, scope clean.
- Live smoke for any path that touches a webai/research live tool.
- Commit via `git commit -F msgfile`, no `Closes/Fixes/Resolves #N` (per `feedback_no_auto_close_keywords.md`).
- Active post-ship watchdog per `feedback_active_post_ship_watchdog.md`.

---

## 8. Compatibility strategy

### 8.1 Contract locks (preserved through all phases)

| Lock | P0 | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| pkg version | 0.7.1 | 0.8.0 | 0.9.0 | 1.0.0 | 1.1.0 |
| contract_version | 1.6.0 | 1.7.0 | 1.7.0 | 1.8.0 | 1.8.0 |
| commands count | 181 | 187 | 192 | 192 | 192 |
| error_codes count | 32 | 34 | 36 | 36 | 36 |
| webai_ count | 38 | 38 | 38 | 38 | 38 |
| research_ count | 121 | 121 | 121 | 121 | 121 |

(Cmd/error counts above are **estimates** based on M5 facade scope. Actual deltas locked by the dispatch prompt for each phase. The user-facing rule remains: existing tools never disappear, never change schema, never change error code semantics.)

### 8.2 Error-code additions (additive only)

| Code | Phase | Replaces? |
|---|---|---|
| `UI_DRIFT_DETECTED` | P1 | No — augments ELEMENT_NOT_FOUND when heal found a candidate but confidence too low. |
| `SELECTOR_HEALED` | P1 | No — informational; tool result still `ok=true`. Returned in `evidence.heal_notes[]`. |
| `HEAL_CONFIDENCE_LOW` | P1 | No — augments above. |
| `PROFILE_LEASE_TIMEOUT` | P2 | No — replaces silent stall when ProfilePool queue overflows. |
| `TAB_LEASE_EXPIRED` | P2 | No — replaces some `COMMAND_TIMEOUT` cases. |

### 8.3 Consumer impact

- Existing consumers see **no breaking change** at any phase.
- The new fields (`evidence.heal_notes`, `evidence.fingerprint_used`, `evidence.lease_id`) are additive and behind the safe-output redaction allowlist.
- Forbidden fields (`cdpEndpoint`, `cookies`, `profileDir`) remain forbidden — `ProfilePool` exports a redacted `endpointRef` instead of a raw `cdpEndpoint`.

---

## 9. Success metrics

| Metric | Today | P1 target | P3 target |
|---|---|---|---|
| Codex selector-patch rounds per week | ~15 (from git log) | ≤ 5 | ≤ 1 (only for genuinely new affordances) |
| LLM input tokens per scout-driven discovery run | unmeasured, est. 100k+ | ≤ 30k | ≤ 10k |
| LLM calls per scout run | unmeasured | ≤ 12 | ≤ 6 |
| Browser-launch race incidents per week | tracked manually; ≥ 1 | 0 | 0 |
| Time to onboard a new research DB | 1–2 days (full code path) | 1 day (manifest + fixture) | < 2 hours (manifest + fixture) |
| % selector failures auto-healed | 0% | ≥ 60% | ≥ 80% |
| Consumer-reported regressions per week | tracked via issue-fix loop | ≤ 50% of today | ≤ 20% of today |
| MCP schema token estimate (facade-only mode) | n/a (no facade) | ≤ 5k | ≤ 5k |

The selector-patch metric is the **headline KPI**. The whole refactor pays off if it falls from ~15/week to ≤ 1/week.

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Manifest loader / generator emits schemas that don't byte-match current ToolSpec literals | Medium | High (breaks contract) | P1 round-trip test: load manifest → generate → diff vs current ToolSpec literal. Must be byte-identical for the 4 pilots. |
| Stagehand local-mode requires LLM key for cache invalidation, blowing through token budget | Medium | Medium | Eval before P4. Fallback = reimplement action cache in-house using ElementBank fingerprints as the cache key. |
| ElementBank fingerprint mismatch produces wrong-element clicks (worst case: submits to wrong textarea) | Low | Critical | Heal confidence threshold τ = 0.85 default. Below τ → drift event, NOT auto-click. Each auto-heal logged for post-hoc audit. |
| ProfilePool queue causes user-visible latency (sequential launches add 3–5 s each) | Medium | Low | Profile leases hold across multiple runs — launch cost amortizes. Add `--prelaunch` flag for explicit warm-up. |
| Contract version bump 1.6 → 1.7 breaks a consumer expecting exact 1.6.0 string match | Low | High | Add to P1 dispatch: greppable confirm that no consumer code does `===` on the version string; publish migration note in CONSUMER_CONTRACT.md. |
| Existing codex fix-loop momentum is lost during refactor → backlog grows | Medium | High | Refactor runs in parallel with issue-fix loop, NOT in place of it. The loop continues handling drift while M3 heal layer is being built. |
| User decision points (§11) take weeks, blocking P1 | Medium | Medium | Defer non-critical decisions (e.g. dashboard scope) past P3. Only block on §11.1 + §11.2 to start P1. |

---

## 11. Open decision points (need user input before P1 dispatch)

### 11.1 Contract version strategy

- **Option A** (recommended): minor bumps per phase — 1.6.0 → 1.7.0 (P1) → 1.7.0 (P2) → 1.8.0 (P3). Additive only. No 2.0 break in this refactor.
- **Option B**: stay on 1.6.x patches throughout; ship facade as `experimental` flag-gated tools. Slower agent adoption but zero contract-version churn.
- **Option C**: commit to `consumer-contract-2.0.0-draft` from P1, signaling the architectural shift even though every individual change is additive. Breaks the §2.4 patch-no-bump rule.

### 11.2 Stagehand vs in-house action cache

- **Option A** (recommended): adopt Stagehand local-mode in P4 after eval. Get act/extract/observe + action cache for free.
- **Option B**: skip Stagehand entirely. Build the action cache in-house atop ElementBank. Longer P4 but zero external dep + no MIT/cloud-coupling surprise.

### 11.3 Scout binary distribution

- **Option A** (recommended): scout is a separate binary `wah-scout` in the same npm package. Different CLI entry, same install.
- **Option B**: scout is a separate npm package `@noeticmind/wah-scout`. Cleaner boundary, more release overhead.
- **Option C**: scout is internal-only, callable via `npm run scout`. No agent-facing CLI. Defers the AutoCLI/skills-style pattern to P4+.

### 11.4 Aggressive vs conservative heal default

- **Option A**: τ = 0.85. Auto-heal between 0.85 and 0.99; below → drift event. Aggressive: gets more auto-fixes but raises the wrong-element risk.
- **Option B** (recommended): τ = 0.95. Conservative. Most heals require human review for the first 4 weeks; tighten/loosen based on `drift_events` analysis.

### 11.5 P3 collapse of 40-DB boilerplate

- **Option A**: collapse all 40 in one P3 codex dispatch. Big-bang.
- **Option B** (recommended): collapse in waves of 5 DBs each, one dispatch per wave, gate per wave. Slower but each wave is reviewable.

### 11.6 healwright npm — adopt or reimplement?

- Needs a license + maintenance audit before deciding. Defer to a research dispatch in P2.

---

## 12. Dispatch plan (codex-prompt skeleton)

Each phase's codex dispatch will use the standard pattern (`.omc/codex-prompts/refactor-<phase>-<scope>.md`, `omx exec` via launcher). High-level:

- **P0**: 1 dispatch — `refactor-p0-contract-version-verifier.md` → adds `scripts/verify-contract-version.ts` + npm script + CI hook.
- **P1**: 3 dispatches in serial (per `feedback_serial_codex_shared_tree.md`):
  1. `refactor-p1-manifest-schema-and-loader.md` → `src/registry/`, `schemas/`, 1 pilot manifest.
  2. `refactor-p1-elementbank-and-heal.md` → `src/heal/`, ElementBank populated from git-log audit, `UI_DRIFT_DETECTED` error code.
  3. `refactor-p1-scout-cli-and-snapshot.md` → `src/scout/`, `wah-scout` binary, 1 web-AI target.
- **P2**: 4 dispatches — pool / engine / facade / legacy-rewire (38 webai_).
- **P3**: 8 dispatches in waves of 5 DBs (40 / 5 = 8).
- **P4**: 2 dispatches — Stagehand eval + dashboard.

Total: ~18 codex dispatches over ~6–8 calendar weeks at current cadence.

---

## 13. What this plan deliberately does NOT do

1. **No "let an LLM agent free-roam to discover features."** That's the current expensive pattern; scout's whole point is to invert it.
2. **No anti-detect, no stealth, no proxy rotation.** Even when borrowing patterns from CloakBrowser/obscura/Scrapling-StealthyFetcher, the stealth surface stays out.
3. **No version 2.0 contract break in this refactor.** Every breaking concern is deferred to a future deliberate breaking change, not piggybacked onto this work.
4. **No browser fork.** Stays on managed Chrome + CDP. No BrowserOS / Chromium fork / custom binary distribution.
5. **No removal of any existing webai_ / research_ tool.** They might internally rewire, but the names + schemas + error codes remain frozen.
6. **No dashboard before P4.** CLI + MCP first; UI is the last thing built.
7. **No second 2nd-proposal Python sidecar.** The `refector-ref/web_ai_capability_optimization/` Python stubs are noted but unused — incompatible with TypeScript-only constraint in §4 of v2 plan.

---

## 14. Approval matrix

| Decision | Owner | Signal |
|---|---|---|
| Adopt this v3 plan as the refactor north star | User | reply "approve v3" or amendments |
| Authorize P0 dispatch (contract verifier) | User | "go P0" |
| Authorize P1 dispatch wave (3 serial codex runs) | User | "go P1" — after §11.1 + §11.2 + §11.3 + §11.4 decided |
| Authorize P2 (touches managedLauncher entrypoints) | User | "go P2" — after P1 ship + 1 week consumer parallel-run |
| Authorize P3 (40-DB collapse) | User | "go P3" — after P2 ship + drift report shows ≥ 60% auto-heal |
| Authorize P4 (Stagehand + dashboard) | User | "go P4" — after P3 ship + metric review |

---

## 15. References

- This file: `docs/plans/web-ai-refactor-v3.md`
- Pain audit (this session): subagent report from `oh-my-claudecode:explore`, see conversation transcript
- OSS due-diligence (this session): subagent report from `oh-my-claudecode:document-specialist`, see conversation transcript
- Source ref docs: `refector-ref/low-token-web-ai-discovery-plan.md`, `refector-ref/web-ai-capability-hub-optimization-plan/{00..08,README,REFERENCES,CHANGELOG_PROPOSAL}.md`
- Project policy: `CLAUDE.md` §1 (orchestrator role), §2.3 (honest errors), §2.4 (consumer contract), §5 (anti-patterns)
- Prior plans: `docs/plans/web-ai-automation-v2.md`
