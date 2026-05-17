# Stream #5 — Exhaustive interactive web-AI feature exploration

Status: **IN PROGRESS** (started 2026-05-15)
Goal owner: user-set campaign goal. Standing rule: **DO NOT STOP UNTIL ALL
FEATURES ARE EXPLORED.**

## Goal (verbatim intent)

Explore **every** non-sensitive feature exposed in the web UI of the three
web AIs (ChatGPT, Claude, Gemini) — *all* features, including ones never
touched before (e.g. Gemini make-music, ChatGPT sidebar Codex, Claude
sidebar Code, Claude Design). Exploration is **interactive**. Integrate each
working capability into the MCP; large self-contained modules (e.g. Claude
Design) may be integrated as a callable sub-MCP rather than bloating the
main server. Nothing may be left unexplored.

## Hard constraints (from the user, this campaign)

1. ChatGPT exploration must **not** use a Pro model (Thinking-class only).
2. Method: **Opus 4.7 effort=max interactive** discovery → other models
   solidify the fixed path → cross-model verify. Problems that cannot be
   solved go into a single **user-handoff MD** for the user to write the
   exact manual UI steps; we then mirror them.
3. **No feature may be skipped.** Every UI-visible feature is in scope
   except user-sensitive/account-identity ones.
4. Maintain an internal **capability library** (`docs/CAPABILITY_LIBRARY.md`
   + `configs/capability-library.json`). Anything already explored and
   auto-callable is NOT re-explored (token discipline).
5. If Codex is used, keep prompts worded so they are not flagged
   (neutral automation/QA framing; no adversarial/abuse phrasing).

Plus all standing project rules (orchestrator-only session; codex via
`omx exec` + prompt file; `browser:launch` not `browser:start`; profiles
chatgpt→9223 / claude-9224→9224 / gemini-9225→9225; serial launches;
DISPLAY=:0 XAUTHORITY for relaunch; no silent fallback — stable contract
error codes only; no contract bump without deliberate act; never touch
`noeticbraid` / Playwright-MCP chrome; never pkill a `data/browser-profiles/`
pattern).

## Durable artifacts (campaign state — survives context compaction)

- `docs/CAPABILITY_LIBRARY.md` — human-readable master tracker.
- `docs/capability-library.json` — machine-readable source of truth
  (kept under `docs/`, NOT `configs/`, so it stays clear of the
  consumer-contract round-trip convention):
  one record per feature `{ id, service, name, ui_location, source,
  status, mcp_tool|null, evidence|null, verified_by|null, last_update,
  notes }`. Status enum:
  - `IMPLEMENTED_GREEN` — auto-callable via MCP, verified. Never re-explore.
  - `EXPLORED_PATH_KNOWN` — interactive flow discovered, not yet integrated.
  - `UNEXPLORED` — in scope, not yet driven.
  - `IN_PROGRESS` — currently being driven.
  - `BLOCKED_NEEDS_USER` — interactive discovery failed; in handoff MD.
  - `OUT_OF_SCOPE` — sensitive/account-identity, or retired (e.g. Sora).
- `.runs/web-ai-explore/stream5/USER_HANDOFF.md` — single doc listing every
  BLOCKED feature with what we tried + the exact question for the user.
- `.runs/web-ai-explore/stream5/` — per-feature live evidence (DOM probes,
  resmoke JSON, interactive traces).

## Method loop (per feature cluster)

1. Pick the next batch of `UNEXPLORED` records for one service (batch by
   service to amortize one browser session). Priority order below.
2. Opus-4.7-max-effort interactive subagent drives the real browser via
   the project CLI (`browser:*`, live DOM reads), discovers the working
   flow, records it. Mark `IN_PROGRESS`.
3. Solidify: dispatch the now-deterministic integration to Codex via
   `omx exec` (round-trip CLI/MCP/contract/docs/tests). Big modules →
   sub-MCP. Mark `EXPLORED_PATH_KNOWN` then on merge `IMPLEMENTED_GREEN`.
4. Cross-model verify with a different (cheaper) model; clean-rebuild
   (`rm -rf dist && npm run build`) before any live re-smoke.
5. If interactive discovery cannot crack it → append to `USER_HANDOFF.md`,
   mark `BLOCKED_NEEDS_USER`, continue (do not stall the campaign).
6. Update both library files every iteration. Commit periodically.

## Priority order (high-value, user-named first)

P0 (user explicitly named): Claude Design; Claude sidebar Code; ChatGPT
sidebar Codex; Gemini make-music; Claude Artifacts export; ChatGPT Canvas.
P1 (frontier from Stream #4): cross-service Deep Research; explicit
model/tier selection; conversation management.
P2: full doc-driven catalog sweep (ChatGPT 330+, Gemini 367+, Claude
help-center) — every remaining UI-visible feature until the library has
**zero `UNEXPLORED`** records.

## Phase B serialized batch ledger (resume point after compaction)

Blueprint: `docs/plans/stream5-integration-blueprint.md`. Prompts:
`.omc/codex-prompts/stream5-*.md`. Outputs: `.omc/codex-out/stream5-b*.md`.
Run STRICTLY in order; next starts only after prior acceptance gate GREEN
(all touch the contract — never parallel). Target final webai count = 36.

- [x] B0 contract-scaffold (1.5.0 / 0.7.0 / +3 error codes / count constant) — GREEN: build0 test0 158pass
- [x] B1 params-existing (model/thinking/web_search/incognito/canvas on 14) — GREEN: build0 test0 161pass, count=13
- [x] B2 chatgpt-tools (+4 → 17) — GREEN: build0 test0 163pass, count=17
- [x] B3 claude-tools (+3 → 20) — GREEN: build0 test0 165pass, count=20
- [x] B4 gemini-tools (+4 → 24) — GREEN: build0 test0 167pass, count=24
- [x] B5 submcp-claude-design (+4 → 28) — GREEN: build0 test0 170pass, count=28, server.ts unchanged
- [x] B6 submcp-gemini-music (+3 → 31) — GREEN: build0 test0 173pass, count=31, 2-stage MP3 quirk wired
- [x] B7 submcp-chatgpt-codex placeholder (+4 → 35) — GREEN: build0 test0 175pass, count=35, gated SUBMCP_NOT_PROVISIONED
- [x] B8 contract-finalize + count correction → **35** (blueprint's "36" was off-by-one; real baseline 13) — GREEN: build0 test0 178pass, contract 1.5.0, 32 error codes, 3 sub-MCP modules
- [x] BP1 hover/portal CLI primitive (--dwell-ms/--include-portals) — GREEN: build0 test0 181pass, count still 35
- [x] Phase C live verify (3 Opus agents): Gemini 4G+1guard 0F; Claude 2G/3F; ChatGPT 2G/3guard/4F. Tooling-blocked: conversation-mgmt + agent-mode entry CRACKED via BP1; study-mode genuinely absent → USER_HANDOFF §A
- [ ] Phase C-fix consolidated codex bugfix (task #22) — **RUNNING** (selector drift + route to BP1 path + tab-resolver + error-leak honesty + Gemini robustness; count stays 35)
- [x] Phase C-fix r1 — GREEN build0 test0 185pass; honesty fully fixed; Claude workspace/send-prompt/conv-manage GREEN, Gemini all GREEN, ChatGPT crashes→structured
- [x] Phase C re-verify r1: Gemini all GREEN; Claude 5G/5F(honest); ChatGPT 2G/3guard/4F — all remaining failures precisely diagnosed (3 clusters)
- [ ] Phase C-fix r2 (task #22b) — **RUNNING**: surface-hydration nav (claude deep-research+design, gemini music:generate) + chatgpt model-detect false-positive + canvas-export/share selector+viewport; count stays 35
- [x] Phase C-fix r2 — GREEN build0 test0 188pass
- [x] Phase C re-verify r2/r3: Gemini 100% GREEN; Claude deep-research+design create/present GREEN (generate/get-html 1 root cause); ChatGPT share/deep-research/send-prompt GREEN (canvas-export hang+panel)
- [ ] Phase C-fix r3 FINAL (D1 design generate postcondition / D2 get-html HTML-validate / D3 canvas-export teardown+self-open) — **RUNNING**
- [x] Phase C-fix r3 — GREEN build0 test0 193pass; D2/D3 landed
- [x] Phase C re-verify r4: ChatGPT canvas-export BOTH scenarios GREEN (hang fixed exit0); all ChatGPT+Gemini new tools GREEN; Claude only design:generate detection remains (D2 honest-fail downstream)
- [ ] Phase C-fix r4 FINAL micro (D1-v2: generate completion via ?file= URL signal + scratch cleanup) — **RUNNING**
- [x] Phase C-fix r4 micro — GREEN 194pass; D1-v2 detection still wrong (URL ?file never auto-appears)
- [x] Opus INTERACTIVE debug (method switch after 4 blind rounds) — CRACKED live: real gen, sha256 10cf4844…, exact divergence found (completion = iframe serve/ src, not URL)
- [x] claude-design generate final source-grounded fix — GREEN 197pass; round-6 verify: generate VERIFIED_GREEN (real index.html, 4 contract keys, no timeout)
- [x] round-6: generate GREEN; get-html/present need deferred Open-to-?file= step (precisely diagnosed, verifier gave selector)
- [x] claude-design get-html+present scoped fix — present GREEN; get-html root cause = Locator.contentFrame (no .content)
- [x] Decisive Opus CDP probe — SOLVABLE, live-proven 2 ways (real 24KB HTML): fix = ElementHandle→Frame bridge
- [x] claude-design get-html final fix (ElementHandle.contentFrame) — GREEN 201pass; round-8: full chain GREEN, real 11.5KB HTML; cold-first false-positive caught
- [x] round-8: full chain VERIFIED_GREEN; honest caveat = cold-first empty-shell false-positive (isRealHtmlMarkup too lax)
- [x] claude-design get-html coldstart honesty micro-fix — GREEN 204pass
- [x] round-9 FINAL: full claude-design chain honestly end-to-end GREEN (cold get-html real 12319B HTML, disk-sha verified, no false-positive)
- [x] Master-library merge + USER_HANDOFF §A finalized: 63 IMPLEMENTED_GREEN / 2 EXPLORED_PATH_KNOWN / 7 BLOCKED_NEEDS_USER / 7 OUT_OF_SCOPE
- [x] Stream #5 tail (2026-05-15): USER_HANDOFF §A resolved per user replies — items 1/3/5/6 user-DEFERRED, #4 chatgpt-study-mode OUT_OF_SCOPE (user-confirmed absent), #2 chatgpt-pulse IMPLEMENTED_GREEN (webai_chatgpt_pulse_get + _onboard, 3 reader/gate fix rounds, live status=ready real digest), #7 chatgpt-codex sub-MCP IMPLEMENTED_GREEN (4 tools live on LT-0I/CN-, 2 Opus-interactive SPA-timing fixes). Final: webai count 37, consumer-contract-1.5.0, 219 tests, library 65 GREEN/2 PATH_KNOWN/4 BLOCKED/8 OUT_OF_SCOPE.

## CAMPAIGN COMPLETE (2026-05-15)
Surface 13→35 webai tools; consumer-contract-1.5.0; 204 unit tests; 3 sub-MCP
modules (claude-design 4 / gemini-music 3 / chatgpt-codex 4 placeholder);
all integrated tools live cross-model verified GREEN. 0 UNEXPLORED. 7 genuine
user-decision items in USER_HANDOFF.md §A. Pending: user commit/push decision.
- [ ] Merge all verify statuses → master library; finalize USER_HANDOFF §A; commit checkpoint
- Status: 34/35 new tools live-verified GREEN; contract 1.5.0; 193 tests; honesty fully solid (no leaks/fabrication/stale-stub)
- [ ] Merge final statuses → master library; present USER_HANDOFF §A to user

## Stop condition

`docs/capability-library.json` contains **zero** `UNEXPLORED` and zero
`IN_PROGRESS` records: every in-scope feature is `IMPLEMENTED_GREEN`,
`EXPLORED_PATH_KNOWN` (with a tracked integration follow-up), or
`BLOCKED_NEEDS_USER` (in the handoff MD). Sora and account-identity
features are `OUT_OF_SCOPE`.

## Post-campaign follow-up

- [x] Architecture drift fix (2026-05-16): `docs/capability-library.json`
  had become a parallel hand-maintained store beside the SQLite
  `CapabilityDatabase`. Resolved (architect-red-teamed) into one store /
  two tables / two views via the new `integration_registry` table; the
  JSON is now only the editable import seed. Full record:
  `docs/plans/architecture-drift-fix-2026-05-16.md`. Commit `aae0c49`.
