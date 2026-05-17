# Stream #5 Integration Blueprint — 49 Web-AI Capabilities into the MCP Surface

Status: DESIGN (read-only architect output; no code edited). All `src/`,
`tests/`, `configs/` edits in this blueprint are dispatched to Codex via
`omx exec`, never written in-session (CLAUDE.md §1, §5).

Inputs analyzed:
- `.runs/web-ai-explore/stream5/integration-queue.json` — 49 capabilities,
  4 flagged `sub_mcp_candidate:true` (`chatgpt-sidebar-codex`, `claude-design`,
  `gemini-make-music`, `gemini-deep-research`); 2 additional blocked would-be
  sub-MCPs noted in recipes (`chatgpt-agent-mode`, `claude-sidebar-code`).
- `.runs/web-ai-explore/stream5/recipes-{chatgpt,claude,gemini}.md` — exact flows.
- `src/mcp/tools.ts:1318` (`toolSpecs[]`), `src/mcp/server.ts` (single
  `Server` + one `ListTools`/`CallTool` handler), `src/cli.ts:172`
  (`webAiMcpNameFromCli`), `configs/consumer-contract.json`
  (`consumer-contract-1.3.0`), `tests/consumerContract.test.ts:207`
  (hard invariant: webai command count == 13).

---

## 0. Codebase reality (the architectural constraint that drives everything)

The MCP surface is **one process, one flat tool array**:

- `src/mcp/server.ts:31` constructs a single
  `new Server({ name: "web-ai-research-automation-hub", version: "0.3.0" })`.
- `server.ts:32` answers `ListTools` with `listMcpTools()`; `server.ts:36`
  routes every call through one `callMcpTool(name, args, runtime)`.
- `src/mcp/tools.ts:1318` `export const toolSpecs: ToolSpec[]` is the single
  registry. `listMcpTools()`/`callMcpTool()` iterate it. There is **no**
  second server entry, no child-process MCP, no transport multiplexer.
- The CLI (`src/cli.ts`) is one binary (`bin: web-ai-research-automation-hub`)
  that maps `webai:<svc>:<verb>` → `webai_<svc>_<verb>` and shares one
  `base` arg-builder (`cli.ts:150-169`).
- The contract test enforces `manifest.commands.filter(c =>
  c.mcp_name.startsWith("webai_")).length === 13`
  (`consumerContract.test.ts:207`) and `cliSource.includes("\"<cli_name>\"")`
  for every row (`:148`), plus `mcpToolNames.has(mcp_name)` (`:155`).

**Therefore**, in *this* codebase a "sub-MCP" is NOT a separate OS process or a
second `Server`. The lean, codebase-honest definition is:

> A **sub-MCP** = a self-contained tool module under `src/mcp/submcp/<name>/`
> exporting its own `toolSpecs`-shaped array and namespaced tool names
> (`webai_<service>_<submcp>_<verb>`), composed into the single server via a
> registry merge in `tools.ts`, and lazily constructed (its browser/session
> wiring only instantiated on first call to one of its tools).

"Lean main server" is achieved by **module isolation + lazy wiring + naming
namespace**, not process isolation. This keeps `tools.ts` from absorbing the
large stateful flows (Codex cloud env picker, Design canvas/quota, Lyria
format-menu polling, multi-minute Deep Research) inline. A future true
out-of-process split (a second `bin` + stdio transport) is recorded as a
non-goal for this stream (see §6 R7).

---

## 1. Sub-MCP boundary decision

Decision rule: a capability becomes a sub-MCP module iff it has (a) its own
composer/model/quota surface distinct from the main chat, (b) a multi-step
stateful lifecycle (create → drive → poll → export) that would add >1 tool and
significant selector/polling logic, and (c) a self-contained artifact path.
Otherwise it is a main-server tool or a parameter on an existing tool.

| Candidate | Decision | Rationale (recipe evidence) |
|---|---|---|
| `claude-design` | **Sub-MCP** `submcp/claude-design` | Self-contained iframe SPA at `/design`, own composer (`textarea[data-testid="chat-composer-input"]`), own model selector (`[data-testid="model-selector-button"]`), separate quota, own artifact (`iframe[data-testid="html-viewer-iframe"]` + Present→new tab). recipes-claude.md P0. 4 tools: `create_project`, `generate`, `get_html`, `present`. |
| `gemini-make-music` | **Sub-MCP** `submcp/gemini-music` | Lyria tool mode, own player widget, **2-stage** "Download track" format menu (single click won't download — recipes-gemini.md P0 QUIRK), share-track, video-render variant. Verified artifact (`Paper_Keys.mp3`). 3 tools: `generate`, `task_status` (reuse), `download_track` (2-stage). |
| `chatgpt-sidebar-codex` | **Sub-MCP module SCAFFOLDED, tools gated** `submcp/chatgpt-codex` | Large self-contained cloud-coding surface at `/codex/cloud` (own composer, repo/branch picker, env dropdown, versions, task tabs). recipes-chatgpt.md P0. BUT not live-exercised: every connected env is a real GitHub repo incl. forbidden noeticbraid. Build the module + contract rows as `maturity:"placeholder"`, handler returns `HUMAN_HANDOFF_REQUIRED` until a throwaway sandbox repo is supplied. No silent stub success (CLAUDE.md §2.3). |
| `gemini-deep-research` | **Main-server tool, async-task pattern** (NOT a sub-MCP) | Despite the queue flag: it has **no distinct composer/model/quota** — it is the existing Gemini composer + a Tools-drawer toggle + a long async run. It already fits the proven `webai_gemini_generate_video` → `webai_task_status` async-task architecture exactly. Making it a sub-MCP duplicates that machinery. Implement as `webai_gemini_deep_research` (queues task, returns `task_id`) + reuse `webai_task_status`. This is the one place I overrule the queue's `sub_mcp_candidate:true`. |
| `chatgpt-agent-mode` (blocked) | **Deferred — no module** | BLOCKED behind unreachable Radix `+`→`More` submenu (Phase B1 tooling fix). No reachable recipe → cannot build a working tool. Record in risk register, exclude from all batches. |
| `claude-sidebar-code` (blocked) | **Deferred — no module** | BLOCKED on editor targeting + Send-guard; recipe explicitly defers sub-MCP design until user clarifies manual UI. Exclude from all batches. |

**Net: 3 sub-MCP modules** (`claude-design` live, `gemini-music` live,
`chatgpt-codex` scaffolded/gated). `gemini-deep-research` reclassified to a
main-server async tool. 2 blocked candidates deferred.

### How a sub-MCP is structured & invoked in THIS repo (concrete)

```
src/mcp/submcp/
  index.ts                      // export const subMcpToolSpecs: ToolSpec[]  (merge of all modules)
  claude-design/
    tools.ts                    // export const claudeDesignToolSpecs: ToolSpec[]
    flow.ts                     // selectors + create/generate/get_html/present steppers
  gemini-music/
    tools.ts                    // generate / download_track (2-stage) / status
    flow.ts
  chatgpt-codex/
    tools.ts                    // placeholder handlers -> HUMAN_HANDOFF_REQUIRED
    flow.ts
```

- Each `*/tools.ts` exports a `ToolSpec[]` using the SAME `ToolSpec` interface
  (`tools.ts:71`) — `{ name, description, schema, handler }`. No new contract
  shape, no new transport.
- `submcp/index.ts` concatenates them: `export const subMcpToolSpecs =
  [...claudeDesignToolSpecs, ...geminiMusicToolSpecs, ...chatgptCodexToolSpecs]`.
- `tools.ts` composes once at the registry boundary:
  `export const toolSpecs: ToolSpec[] = [ ...coreToolSpecs, ...subMcpToolSpecs ]`
  (single edit point near `tools.ts:1318`). `listMcpTools()`/`callMcpTool()`
  unchanged — they still iterate one array, so `server.ts` is untouched.
- **Lazy wiring:** sub-MCP handlers receive the existing
  `Required<BrowserToolRuntime>` and call `withManagedPage(...)`
  (`tools.ts:123`) like every other tool. Heavy per-module state (Design
  quota tracking, Lyria poll loop) lives in `flow.ts`, only constructed inside
  the handler — nothing runs at import. This is what keeps the "main server
  lean": `tools.ts` core stays ~unchanged; module code is physically separate
  files and only executes on demand.
- **Invocation:** identical to today. MCP clients call
  `webai_claude_design_generate`; CLI calls
  `webai:claude:design:generate` (the `webAiMcpNameFromCli` map in
  `cli.ts:172` gains the namespaced rows; the `:` → `_` convention already
  generalizes — `webai:claude:design:generate` →
  `webai_claude_design_generate`).
- **Naming namespace:** `webai_<service>_<submcp>_<verb>`. This is the
  isolation boundary the contract and tests key on; a 4-segment name is
  unambiguously a sub-MCP tool.

Trade-off acknowledged: in-process module isolation does not give independent
crash/restart or memory isolation. Accepted because (a) the codebase has no
multi-process MCP harness to build on, (b) all flows already share one
`BrowserSessionManager`/`ManagedBrowserLauncher` and the per-profile lease, so
a second process would still serialize on the same Chrome profile lock —
process split buys nothing here and costs a whole new transport+contract
surface. Recorded as future work (§6 R7).

---

## 2. Main-server tool taxonomy (the ~43 non-sub-MCP capabilities)

Principle: **collapse capabilities into parameters of existing/few tools**;
add a new tool only when the artifact path or lifecycle genuinely differs.
Naming stays `webai_<service>_<verb>`.

### 2a. Folded into EXISTING 14 GREEN tools as parameters (0 new tools)

These are toggles/selectors on the same composer→send→read path the GREEN
`*_send_prompt` / `*_upload_and_query` / `*_generate_*` tools already own:

| Capability(ies) | Folded into | New optional param |
|---|---|---|
| `*-model-selector` (chatgpt/claude/gemini) | all `webai_*_send_prompt`, `*_upload_and_query`, `*_generate_*` | `model` (already in CLI base, `cli.ts:155`) — wire it to the per-service model picker; emit `MODEL_SELECTION_DRIFT` on mismatch (code already in contract). Covers ChatGPT Pro-reset-on-nav (re-select every send). |
| `claude-extended-thinking`, `gemini-deep-think`, `claude-style-presets` | `webai_claude_send_prompt` / `webai_gemini_send_prompt` | `thinking:boolean`, `style:string` (style already in CLI base). |
| `chatgpt-search-web`, `claude-web-search`, `gemini` web search | `webai_*_send_prompt` | `web_search:boolean` (composer `+`/Tools toggle before send). |
| `claude-analysis-tool`, `chatgpt-code-generation` | already covered by `*_send_prompt` / `*_generate_file` (auto-invoked; recipe confirms no toggle) | none — document only. |
| `gemini-long-context` | already subsumed by `webai_gemini_upload_and_query` (recipe: "no distinct UI") | none — document only. |
| `gemini-image-editing` | `webai_gemini_generate_image` | `reuse_conversation:boolean` (already in base) — multi-turn edit instruction. |
| `chatgpt-image-visual-query`, `chatgpt-data-analyst` | `webai_chatgpt_upload_and_query` | none new — same `#upload-files` mechanism (recipe confirms). Data-analyst chart-PNG export deferred (multi-step, see §6). |
| `chatgpt-canvas`, `chatgpt-canvas-export`, `gemini-canvas-edit` | extend `webai_gemini_canvas_to_docs` family + `*_generate_file` | add `webai_chatgpt_canvas_export` ONLY (different artifact: PDF/DOCX/MD dropdown). Canvas creation = `send_prompt` with `canvas:boolean`. Gemini canvas inline-edit = new tool (see 2b). |
| `claude-artifacts-export`, `claude-mermaid-live` | `webai_claude_generate_file` (verified same `button[aria-label^="Download "]` + CDP artifact-click path; recipe: "same path covers HTML/React/SVG/Mermaid/DOCX/PDF") | `artifact_class` (already in base). 0 new tools. |
| `claude-incognito-mode` | `webai_claude_send_prompt` | `incognito:boolean` (navigates `/new?incognito=`). |

### 2b. New main-server tools (minimal set)

Naming `webai_<service>_<verb>`. One tool per genuinely distinct
artifact/lifecycle. **Conversation/settings management collapsed into ONE
generic per-service tool** rather than rename/delete/search/pin/share as
separate tools.

| New tool | Covers | Why new (not a param) |
|---|---|---|
| `webai_chatgpt_canvas_export` | chatgpt-canvas-export | Distinct artifact dropdown (PDF/DOCX/MD); verified CDP path. |
| `webai_gemini_canvas_edit` | gemini-canvas-edit | Direct inline edit into canvas contenteditable — distinct write target not on the send path. |
| `webai_chatgpt_deep_research` | chatgpt-deep-research | Long async run → async-task pattern (task_id + `webai_task_status`). |
| `webai_gemini_deep_research` | gemini-deep-research (reclassified from sub-MCP) | Async-task pattern, reuses `webai_task_status`. |
| `webai_claude_deep_research` | claude-deep-research | Async-task pattern. |
| `webai_chatgpt_conversation_manage` | chatgpt-share-conversation, chatgpt-conversation-management (entry known, kebab Radix-blocked → returns `HUMAN_HANDOFF_REQUIRED`/`MODE_UNCERTAIN` honestly) | Conversation lifecycle, not a chat turn. |
| `webai_claude_conversation_manage` | claude-conversation-management, claude-sharing | same shape. |
| `webai_gemini_conversation_manage` | gemini-conversation-management, gemini-share-chat | menu enumerated; Delete/Rename gated by confirmation guard. |
| `webai_chatgpt_workspace` | chatgpt-projects, chatgpt-gpt-store, chatgpt-tasks, chatgpt-apps-mcp, chatgpt-memory, chatgpt-settings-personalization, chatgpt-settings-data-controls | One read/navigate tool with `surface` enum param (projects\|gpts\|tasks\|apps\|memory\|personalization\|data_controls). All are stable hash/route reads; destructive ops refuse with `POLICY_APPROVAL_REQUIRED`. Collapses 7 caps → 1 tool. |
| `webai_claude_workspace` | claude-projects, claude-integrations-connectors, claude-skills, claude-settings-appearance, claude-style-presets(view) | `surface` enum. Collapses 5 → 1. |
| `webai_gemini_workspace` | gemini-gems, gemini-scheduled-actions, gemini-study-materials, gemini-audio-overview, gemini-workspace-integration, gemini-connected-apps, gemini-personalization-memory | `surface` enum. Collapses 7 → 1. OBSERVE-ONLY surfaces stay read; toggles refuse with policy error. |

**New main-server tool count: 11.** (3 deep-research async, 3 conversation
mgmt, 3 workspace, chatgpt canvas-export, gemini canvas-edit.) The remaining
~28 capabilities are absorbed as parameters/documentation on the existing 14
GREEN tools — zero new tools for those.

**Surface total after Stream #5:** 14 GREEN + 11 new main-server + 3 sub-MCP
modules. Sub-MCP tool count: claude-design 4, gemini-music 3, chatgpt-codex 4
(placeholder) = 11 namespaced tools. Grand total webai tools:
14 + 11 + 11 = **36** (vs 14 today).

Errata (2026-05-15): The authoritative pre-existing baseline is 13 (`configs/consumer-contract.json` / `tests/consumerContract.test.ts`), so the final Stream #5 webai total is 13 + 11 + 11 = **35**, not 36.

Trade-off: the `surface`/enum collapse trades discoverability (fewer
self-describing tool names) for a lean surface and a tractable contract diff.
Mitigated by rich `description` + enum docs. Alternative (one tool per
capability) would add ~28 tools and a far larger contract/test churn — rejected.

---

## 3. Contract versioning decision

**Decision: deliberate bump to `consumer-contract-1.5.0`.** Package version
`0.5.0` → `0.7.0`.

Justification against CLAUDE.md §2.4:
- §2.4 says a contract bump is a *deliberate act* and patches within a minor do
  NOT bump. Stream #5 is the opposite of a patch: it adds 11 new main-server
  tools + 11 sub-MCP tools + new params on 14 tools + new CLI verbs + new
  output fields. This is a major public-surface expansion → minor bump is the
  correct deliberate act.
- The contract test hard-codes the old surface size:
  `consumerContract.test.ts:207` asserts webai command count `=== 13`, plus the
  `webaiV13Tools` list (`:195`) and `error_codes.length === 29` (`:137`).
  These invariants MUST be deliberately updated in lockstep — they are the
  enforcement mechanism that makes the bump auditable. Bumping to 1.5.0 and
  updating these counts is the sanctioned path; leaving 1.3.0 would force
  weakening a guard, which §2.4 forbids.
- Every new CLI/MCP/TS surface must round-trip
  `configs/consumer-contract.json` ↔ `docs/CONSUMER_CONTRACT.md` ↔
  `tests/consumerContract.test.ts` in the SAME dispatch (§2.4) — see §4 batch
  gates.

### Sensitive-field classification for new output fields

Apply the existing `forbidden_output_fields` / `sensitive_fields` model
(contract keys verified). Rules for every new field a Stream #5 tool emits:

- New tools must NEVER emit any `forbidden_output_fields` member (`dom`,
  `html`, `screenshot`, `cdpEndpoint`, `cookies`, `email`, …). Design tools
  return `iframeArtifactSha256` + `savedPath`, never the iframe `html`.
- New local-path/fingerprint fields are classified in `sensitive_fields` with
  the same wording style as `artifact_click.path`:
  - `claude_design.savedPath`, `gemini_music.savedPath`,
    `*_canvas_export.path` → "Local filesystem path; treat as sensitive local
    metadata." → row sets `may_contain_sensitive_local_fields: true`.
  - `*.sha256` → "Content fingerprint; acceptable to log when artifact logging
    is allowed."
  - `*_deep_research.task_id`, `*_conversation_manage.conversationId` →
    opaque-id wording like `profile-id`; `may_contain_sensitive_local_fields`
    stays `false` (no local path), but documented in `sensitive_fields`.
- New error codes needed: `SENSITIVE_CONTENT_GUARD` (the Share/Send
  human-confirm refusal — currently surfaced ad hoc; promote to a contract
  code), `SUBMCP_QUOTA_EXHAUSTED` (Design separate quota),
  `SUBMCP_NOT_PROVISIONED` (chatgpt-codex no sandbox repo — alias path of
  `HUMAN_HANDOFF_REQUIRED`). Final count to be set in the same dispatch and
  the `error_codes.length` assertion updated deliberately. No silent fallback
  — every drift surfaces a contract code (CLAUDE.md §2.3).

---

## 4. Serialized codex dispatch batching plan

Hard rule: **every contract-touching dispatch is serialized** — parallel edits
to `consumer-contract.json` / `consumerContract.test.ts` corrupt them. Each
batch is one `omx exec` with a prompt file in `.omc/codex-prompts/`, output to
`.omc/codex-out/`, round-tripping CLI ↔ MCP ↔ contract ↔ docs ↔ tests
(CLAUDE.md §1, §2.4). Run strictly in order; the next batch starts only after
the prior batch's acceptance gate is GREEN.

| # | Batch (prompt file) | Scope | Contract touch | Acceptance gate |
|---|---|---|---|---|
| B0 | `stream5-contract-scaffold.md` | Bump `contract_version`→`consumer-contract-1.5.0`, `package_version`→`0.7.0`; add new `error_codes`; update `consumerContract.test.ts` invariants (webai count target, `webaiV13`→`webaiV14`+ list, `error_codes.length`); add `release_notes`. NO new tools yet. | YES (sole owner of count/version) | `npm run build` clean; `node --test dist/tests/*.test.js` green with new counts asserting the *intended* final surface as it lands per batch (use a per-batch incremental count or a single end-state count gated last — see note). |
| B1 | `stream5-params-existing.md` | §2a: add `model`/`thinking`/`web_search`/`incognito`/`canvas` params to existing 14 GREEN tools' schemas; wire model re-select (Pro-reset fix) + `MODEL_SELECTION_DRIFT`. Contract rows: update `required_args`/optional output keys for the 14. | YES | Unit tests for each new param; contract row round-trip test; no forbidden fields; build clean. |
| B2 | `stream5-chatgpt-tools.md` | ChatGPT new tools: `webai_chatgpt_canvas_export`, `webai_chatgpt_deep_research`, `webai_chatgpt_conversation_manage`, `webai_chatgpt_workspace`. CLI verbs + contract rows + docs + tests. | YES | New tool contract rows present; CLI source contains cli_name (`test:148`); MCP tool registered (`:155`); live re-smoke gate (§5). |
| B3 | `stream5-claude-tools.md` | Claude new tools: `webai_claude_deep_research`, `webai_claude_conversation_manage`, `webai_claude_workspace`. | YES | same gate as B2. |
| B4 | `stream5-gemini-tools.md` | Gemini new tools: `webai_gemini_deep_research`, `webai_gemini_canvas_edit`, `webai_gemini_conversation_manage`, `webai_gemini_workspace`. | YES | same gate as B2. |
| B5 | `stream5-submcp-claude-design.md` | `src/mcp/submcp/claude-design/*` + registry merge in `tools.ts`; 4 namespaced tools; CLI 4-segment mapping; contract rows; docs; tests. | YES | Sub-MCP module imports lazily (no import-time side effects test); 4 tools in `listMcpTools()`; live re-smoke produces verified HTML artifact. |
| B6 | `stream5-submcp-gemini-music.md` | `submcp/gemini-music/*`; 3 tools incl. 2-stage `download_track`; registry merge; CLI; contract; docs; tests. | YES | Live re-smoke reproduces a valid MP3 (sha256 verified, matches recipe quirk handling). |
| B7 | `stream5-submcp-chatgpt-codex.md` | `submcp/chatgpt-codex/*` scaffold; handlers return `HUMAN_HANDOFF_REQUIRED`/`SUBMCP_NOT_PROVISIONED`; `maturity:"placeholder"` rows; CLI; contract; docs; tests. NO live send. | YES | Tools registered; handler returns the contract error code (unit test); NO live ChatGPT Codex task executed (policy). |
| B8 | `stream5-contract-finalize.md` | Final reconciliation: confirm webai tool count == intended end state (35), `error_codes.length` final, `CONSUMER_CONTRACT.md` regenerated, release_notes finalized. | YES | Full `npm run test` green; full contract round-trip; no forbidden fields anywhere; `git diff --stat` shows only contract/docs deltas. |

Note on per-batch counts: B0 sets the test's expected webai-count to the
*final* end-state and marks intermediate batches with a `// SURFACE IN
PROGRESS` allowance OR (preferred, cleaner) B0 introduces a single
`expectedWebaiToolCount` constant the test reads, and each batch B1–B7 bumps
that constant by exactly the tools it adds, with B8 asserting it equals 35.
This keeps each batch's test green without weakening the invariant — the
constant change IS the deliberate, auditable count bump. (Architect
recommendation: prompt B0 to install the constant; do not let batches edit raw
magic numbers in parallel.)

Total: **9 serialized batches (B0–B8)**. None may run in parallel — all touch
the contract or its test.

---

## 5. Test & verification strategy (per batch)

Mandatory rule before ANY live re-smoke (CLAUDE.md "Clean-build before
re-smoke"; user-memory `feedback_clean_build_before_resmoke.md`):
`rm -rf dist && npm run build` — a stale `dist/` masked ~5 rounds of fixes
previously. The npm `test` script already chains `npm run build`
(`package.json`), but the explicit `rm -rf dist` is required because `clean`
only `rmSync` — confirm dist is gone before smoke.

Per batch:
- **Unit/contract tests added in-dispatch** (§2.4 round-trip): every new
  command row asserted via the existing patterns at
  `consumerContract.test.ts:147-155` (cli_name in CLI source, maturity ∈
  set, safety_class ∈ set, mcp_name in `listMcpTools()`),
  `assertNoForbiddenFields` on every new `output_keys` block, and a schema
  test for every new input param. New error codes added to
  `CONSUMER_ERROR_CODES` and the `deepEqual(manifest.error_codes, …)`
  assertion (`:136`) updated deliberately.
- **Sub-MCP isolation test (B5–B7):** assert importing
  `src/mcp/submcp/index` has no side effects (no browser launch at import),
  and that the module's tools appear in `listMcpTools()` only via the merged
  array (proves composition, not a second server).
- **Cross-model live verification (B2–B6):** exactly ONE live re-smoke per
  batch via the established skills (`web-ai-live-smoke` then, only on failure,
  `web-ai-bugfix-iterate` → root-cause → ONE targeted re-smoke; never
  "retry-and-rerun", CLAUDE.md §5). Browsers launched serially via
  `browser:launch` per `web-ai-launch-browsers` SKILL (never `browser:start`;
  never parallel — SingletonLock race). Claude lane uses profile
  `claude-9224`; ChatGPT uses Thinking (re-select every send, never Pro);
  Gemini `--confirmed true` only for known-benign sends.
  - B2 smoke: ChatGPT canvas export → verified `.md`/`.docx` sha256 matches
    recipe artifact.
  - B5 smoke: Claude Design generate → HTML artifact via
    `iframe[data-testid="html-viewer-iframe"]` → Present, sha256 verified.
  - B6 smoke: Gemini music → MP3 via 2-stage `Download track`
    (`browser:artifact-click` with `--follow-up-text-regex 'MP3'`), sha256
    verified valid MPEG-1 layer III.
- **Verification owner separation:** the implementing Codex dispatch does NOT
  self-approve; verification is a separate pass (CLAUDE.md global
  `<verification>` / OMC execution protocol) — orchestrator reads evidence
  JSON (`triedFrames`, `pageUrl`, error code) before declaring a batch GREEN.
- B7 has NO live verification (policy: no live ChatGPT Codex task) — unit
  test that handler returns `HUMAN_HANDOFF_REQUIRED`/`SUBMCP_NOT_PROVISIONED`
  is the gate.

---

## 6. Risk register

| ID | Risk | Evidence | Mitigation / contract behavior |
|---|---|---|---|
| R1 | Sensitive-content guard refuses Share/Send (needs human confirm) | recipes: Claude Send button + Share, Gemini "Send message" trips RISK_WORDS, Claude `/design` send-btn guarded | Do NOT bypass silently. Surface a stable code — promote to `SENSITIVE_CONTENT_GUARD` in 1.5.0. Known-benign sends use the sanctioned `--confirmed true` / Enter-key path (the contract's explicit human-confirm path, NOT a fallback — CLAUDE.md §2.3). Conversation-manage Delete/Rename refuse with `POLICY_APPROVAL_REQUIRED`. |
| R2 | ChatGPT model selector resets to Pro on every navigation | recipes-chatgpt.md cross-cutting #1 | §2a `model` param logic MUST re-select `Thinking` before EVERY send; assert post-select label; emit `MODEL_SELECTION_DRIFT` if it didn't stick. Never proceed on Pro (cheap-models rule). |
| R3 | Radix portal limitation: kebab/submenu/command-palette don't open via CLI synthetic click | recipes-chatgpt.md #3; `tooling-blocked.json` (chatgpt-conversation-management, agent-mode, study-mode) | Phase B1 fixes this SEPARATELY (native-hover/pointer-dwell). Stream #5 must NOT depend on it: affected tools return `MODE_UNCERTAIN`/`HUMAN_HANDOFF_REQUIRED` honestly. `chatgpt-agent-mode` excluded from all batches. Do not build flows that need the unreachable submenu. |
| R4 | Per-profile lease serialization | `src/browser/sessionManager.ts`/`managedLauncher.ts`; contract codes `PROFILE_LOCKED`/`PROFILE_LEASE_BUSY`; `withManagedPage` (tools.ts:123) | Sub-MCP modules share the SAME launcher/session/lease — they cannot run concurrently against one Chrome profile anyway (this is also why an out-of-process sub-MCP buys nothing — R7). Batches serialized; live smokes serialized; surface `PROFILE_LEASE_BUSY` not a silent wait. |
| R5 | Sub-MCP quota (Claude Design separate quota) exhausts mid-run | recipes-claude.md ("separate quota") | New code `SUBMCP_QUOTA_EXHAUSTED`; Design `generate` detects quota wall and returns it — no synthesized artifact (CLAUDE.md §5 anti-pattern: no local synthesis). |
| R6 | chatgpt-codex tasks hit a real GitHub repo (incl. forbidden noeticbraid) | recipes-chatgpt.md P0 "Not exercised live" | B7 scaffolds only; handlers refuse with `SUBMCP_NOT_PROVISIONED`/`HUMAN_HANDOFF_REQUIRED` until user supplies a throwaway sandbox repo. Never auto-pick a connected env. |
| R7 | "Sub-MCP" expected to be a separate process; in-process module chosen | §0/§1 analysis | Documented non-goal. In-process is correct here because all flows serialize on one Chrome profile lease (R4) so process isolation gives no concurrency win while adding a whole transport+contract surface. Revisit only if profiles become per-module. |
| R8 | Contract corruption from parallel edits | CLAUDE.md §4 dispatch rule | Strict B0→B8 serialization; single `expectedWebaiToolCount` constant so no batch edits raw count magic numbers; B8 reconciles. |
| R9 | Deep Research multi-minute runs exceed dispatch/timeout | recipes: 5–30 min runs | Reuse proven async-task architecture (`webai_*_deep_research` → `task_id` → `webai_task_status`), exactly like `webai_gemini_generate_video`. Do NOT block a dispatch on completion; smoke validates queue+task_id, not full report (stream4 precedent). |

---

## 7. Out of scope / explicitly excluded this stream

- `chatgpt-agent-mode`, `chatgpt-study-mode`, `claude-sidebar-code`
  (blocked — no reachable recipe; Phase B1 or user clarification first).
- True out-of-process sub-MCP transport (R7 — future work).
- ChatGPT data-analyst chart-PNG multi-step export (deferred; documented).
- Any account/billing/identity surface, public link publishing, OAuth connect
  (policy — CLAUDE.md §2.3; recipes mark these OUT_OF_SCOPE).
