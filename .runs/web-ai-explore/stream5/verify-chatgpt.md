# Stream #5 — ChatGPT live verification + re-discovery report

Session 2026-05-15, profile `chatgpt`, CDP 9223, account `Shark Pro`.
Tab-ids `vx-cg-*`. Contract `consumer-contract-1.4.0` (pkg 0.6.0).
No dist rebuild, no src/test/config edits, no commit (orchestrator rules).
Cheap path: Thinking model only, never Pro; benign inputs.

> **Counts:** 12 items — VERIFIED_GREEN 2 · EXPLORED_PATH_KNOWN 2 ·
> GUARD_OK 3 · BLOCKED_NEEDS_USER 1 · FAILED 4.

---

## JOB 1 — the 3 tooling-blocked, re-discovered with the BP1 primitive

The new `browser:hover --dwell-ms` (real CDP pointer-dwell, telemetry
`ok:true mouseMovedEvents:5`) + `browser:read --include-portals`
(body-level Radix portal traversal) **cracked 2 of the 3**.

| id | result | how |
|---|---|---|
| chatgpt-conversation-management | ✅ CRACKED (EXPLORED_PATH_KNOWN) | in-chat-header `button[aria-label="Open conversation options"]` + `--include-portals` → 6 menuitems; Search palette via `Control+k` → dialog + 15 live results |
| chatgpt-agent-mode | ✅ CRACKED, entry verified (EXPLORED_PATH_KNOWN) | sustained `browser:hover --dwell-ms 5000` on `+`→`More` + `--include-portals` → submenu `Agent mode / GitHub / OpenAI Platform`, reproduced 2× |
| chatgpt-study-mode | ❌ STILL BLOCKED (BLOCKED_NEEDS_USER) | submenu now reachable but contains no Study item; `/study` = plain home; zero study controls in full DOM — genuinely absent on this account, NOT a tooling limit |

Recipes: `recipes-chatgpt-rediscover.md`.
Study-mode user question: `blocked-chatgpt-r2.md`.

**Key insight:** the prior block was specifically Radix hover-intent
submenu + body-portal traversal. `--include-portals` solves the portal
read; `--dwell-ms` solves the hover-intent. The sidebar per-conversation
kebab is a *different* block (sibling `<a>` overlay intercepts the click)
— solved by using the in-chat-header options button instead.

**Agent-mode flakiness:** the `+`→`More` submenu open is intermittent
(Radix hover-intent timing + a flaky `#composer-plus-btn` open step), but
the hover primitive itself fires correctly every call. Recommended
hardening (engineering, not user): a fused `hover+portal-read` step so
the read is deterministically mid-dwell. No autonomous agent task was
launched (policy).

---

## JOB 2 — new ChatGPT surface (contract 1.4.0)

All 12 ChatGPT MCP tools are registered and contract-wired.

| tool | status | evidence summary |
|---|---|---|
| `webai:chatgpt:workspace` (×7 surfaces) | VERIFIED_GREEN | all 7 return clean `{surface,url,summary}` envelopes, no error, **no forbidden sensitive fields** |
| `conversation-manage --action navigate_settings` | VERIFIED_GREEN | opens `#settings/DataControls`; strict enum validation correct |
| `conversation-manage --action delete` | GUARD_OK | refused with stable `HUMAN_HANDOFF_REQUIRED` |
| `chatgpt:codex:list-envs` (sub-MCP) | GUARD_OK | returns `SUBMCP_NOT_PROVISIONED` — the intended gated placeholder = correct PASS |
| `webai:task-status` (synthetic id) | GUARD_OK | stable `INVALID_ARGS` envelope |
| `conversation-manage --action share` | FAILED | `ELEMENT_NOT_FOUND` — stale selector `button[data-testid="share-chat-button"]`; live UI uses `button[aria-label="Share"]` |
| `webai:chatgpt:canvas-export --format md` | FAILED | canvas doc built & verified, but export `ELEMENT_NOT_FOUND` on stale `button[aria-label="Download"][aria-haspopup]`; live control is `#radix-_r_9b_` role=button. No artifact, **no fabricated sha256** |
| `webai:chatgpt:deep-research` | FAILED | 2 clean attempts; Playwright click-interception (`modal-settings` / sidebar `subtree intercepts pointer events`); no `task_id` emitted |
| `webai:chatgpt:send-prompt` | FAILED | 2 attempts incl. cleaned tab; same click-interception class; send never occurred so `MODEL_SELECTION_DRIFT` could not be asserted (reported honestly, not GREEN) |

### Artifact sha256s
None. `canvas-export` produced **no artifact** (honest `ELEMENT_NOT_FOUND`,
not a fabricated success). No sha256 is recorded because no real file
was created — per the no-fabrication / no-fallback honesty rules.

### Root causes (per FAILED, one clean attempt each, no blind retries)

1. **conversation-manage share** & **canvas-export** — *selector drift*.
   Both tools hardcode selectors that no longer match the live ChatGPT
   DOM (`data-testid="share-chat-button"` → now `aria-label="Share"`;
   `button[aria-label="Download"][aria-haspopup]` → now a Radix
   `#radix-_r_*_` role=button without the matchable `aria-haspopup`
   predicate). Fix = selector-refresh dispatch to Codex.
   (Minor: canvas-export evidence `pageUrl` shows literal
   `<conversation-id>` placeholder — it did not substitute the resolved
   id into its evidence; small reporting bug.)

2. **deep-research** & **send-prompt** — *fragile click under overlay*.
   Both use a default Playwright `.click()` that fails the actionability
   hit-test when a ChatGPT settings modal or the sidebar covers the
   target's center point (`<div … subtree intercepts pointer events`).
   This is the SAME systemic blocker class that BP1's robust hover/portal
   primitive was built to defeat — but the `webai:chatgpt:*` MCP tools
   were **not migrated** onto that robust interaction path. Fix =
   dispatch to route these tools through the BP1-style interaction
   (dismiss/avoid pre-existing modals; overlay-aware click).

### Honesty / safety compliance
- No fabricated success anywhere; every failure is the exact contract
  error code + the CLI JSON envelope.
- One clean attempt per item; root-cause hypotheses given instead of
  blind retry-reruns.
- Guard refusals (`HUMAN_HANDOFF_REQUIRED`, `SUBMCP_NOT_PROVISIONED`,
  `INVALID_ARGS`) treated as CORRECT (guard-ok).
- Thinking model only (verified Pro→Thinking switch live), benign
  inputs, no account/billing/publishing, no autonomous Agent/Codex task,
  no dist rebuild, no src/test/config edits, no commit, no relaunch.

---

## Output files
- `.runs/web-ai-explore/stream5/verify-chatgpt.json` (machine-readable, 12 items)
- `.runs/web-ai-explore/stream5/verify-chatgpt.md` (this report)
- `.runs/web-ai-explore/stream5/recipes-chatgpt-rediscover.md` (cracked recipes)
- `.runs/web-ai-explore/stream5/blocked-chatgpt-r2.md` (study-mode user question + eng follow-up)
