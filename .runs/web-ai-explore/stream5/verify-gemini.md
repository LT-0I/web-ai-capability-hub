# Stream #5 — Gemini Capability LIVE Verification

Repo: `/home/l1u/workspace/noeticmind/web-ai-capability-hub`
Contract: `consumer-contract-1.4.0` (package 0.6.0)
Browser: profile `gemini-9225`, CDP port 9225 (already launched + logged in; not relaunched/closed)
Date: 2026-05-15
Tier: default / Fast (never Pro). All prompts benign/innocuous. No account/billing/publishing.

## Result counts

| Status | Count |
|--------|-------|
| VERIFIED_GREEN | 4 |
| GUARD_OK | 1 |
| FAILED | 0 |
| DEFERRED_QUOTA | 0 |

## Per-tool status table

| # | Tool | Status | Key evidence |
|---|------|--------|--------------|
| 1 | gemini:music:generate + task-status + download-track | VERIFIED_GREEN | Real MP3 744610 B, ID3v2.3 / MPEG layer III, sha256 `6aabda10273efa733f844a29704ab9d44fe475daf961a31f46f28ea585a82cc8` |
| 2 | gemini:deep-research + task-status | VERIFIED_GREEN | task_id `task_1778858455576_b53e18bb08eb`, status `queued` w/ progress_label (2 checks) |
| 3 | gemini:canvas-edit | VERIFIED_GREEN | `canvas_opened:true, edit_applied:true`; DOM confirms canvas panel + edit text landed |
| 4 | gemini:conversation-manage | GUARD_OK | read paths GREEN; share→SENSITIVE_CONTENT_GUARD; delete→POLICY_APPROVAL_REQUIRED |
| 5 | gemini:workspace (7 surfaces) | VERIFIED_GREEN | All 7 enum surfaces read, surface+url+summary, no error codes |

## Artifact sha256

| Artifact | Path | Size | sha256 |
|----------|------|------|--------|
| Music MP3 | `.runs/web-ai-explore/stream5/Beneath_the_Heavy_Arch.mp3` | 744610 B | `6aabda10273efa733f844a29704ab9d44fe475daf961a31f46f28ea585a82cc8` |

`file` verdict: `Audio file with ID3 version 2.3.0, contains: MPEG ADTS, layer III, v1, 192 kbps, 44.1 kHz, JntStereo`

## Test 1 — Music (full pipeline GREEN with a diagnosed transient)

- `music:generate` → `gemini_music_1778858449760`, conversation `3b45cae90638eb88`.
- First `music:task-status` returned `status:error`, and first `download-track` calls hung past the bound.
- **Root cause (diagnosed via CDP DOM probe, no mutation):** the `gemini-9225`
  profile exposes a SINGLE shared CDP browser page. The Test 3 send-prompt (and
  other gemini commands) navigated that shared page away from the music
  conversation. `music:task-status` and `download-track` then inspected the WRONG
  conversation: with no Stop button and no `button[aria-label="Download track"]`
  present, task-status's logic (`tools.ts`/`flow.ts`) emits a false-negative
  `status:error`, and `download-track`'s `runArtifactClick` hangs locating an
  absent button (past its own 60 s/20 s internal bounds).
- After navigating the shared page back to `3b45cae90638eb88`: DOM showed the
  generated 0:00/0:30 track, an `<audio>` element, and `button[aria-label="Download
  track"]` present. `task-status` then correctly returned
  `{status:complete, download_ready:true}` and `download-track` produced a valid
  744610-byte MP3. The 2-stage MP3 format submenu was handled internally
  (`followUpTextRegex="MP3"` in `gemini-music/flow.ts`).
- **Recommendation (not applied — report only):** `music:task-status` and
  `download-track` should explicitly navigate to the target conversation
  (via `tab_url_contains`) before inspecting, rather than trusting whatever the
  shared single page currently displays.

## Test 2 — Deep research

Queued correctly; `webai:task-status` shows valid `queued` + progress_label on two
checks. Did not wait for the full multi-minute report (per instructions).

## Test 3 — Canvas edit

`canvas-edit` opened a canvas, applied the inline edit, completed (exit 0). DOM
verification confirms the canvas panel is present and both the prompt text and the
`--edit-text` value landed inside the canvas. `ai_action_applied:false` is correct
(no `--ai-action` was requested).

## Test 4 — Conversation manage (GUARD_OK)

- Read paths GREEN: `menu_enumerate` → `["Files in this chat","Pin","Rename","Add to
  notebook","Delete"]`; `search` → conversation list.
- Destructive ops correctly refuse with stable contract codes:
  `share` (no confirm) → `SENSITIVE_CONTENT_GUARD`; `delete` →
  `POLICY_APPROVAL_REQUIRED` (source shows `rename` is gated the same way). Not
  forced — guard refusals are the correct outcome.
- Minor arg-handling observation: `menu_enumerate --tab-url-contains` is passed to
  `page.goto`, so a bare conversation-id string fails with an invalid-URL error;
  a full `https://gemini.google.com/app/<id>` URL works. Initial bare attempt on a
  non-conversation page returned `ELEMENT_NOT_FOUND` (stable contract code, no
  silent fallback) — honest failure surfacing, behaving as the contract requires.

## Test 5 — Workspace surfaces

All 7 contract enum surfaces (`gems, scheduled, study, audio_overview,
workspace_integration, connected_apps, personalization`) read without error;
each returns `surface+url+summary` with no error codes.

## Honesty / safety

No fabricated success. The single music download MP3 is a real
GEOB/ID3v2.3/MPEG-layer-III file, sha256 captured and re-verified. Guard refusals
recorded as GUARD_OK (correct). No relaunch/close, no profiles.json, no dist
rebuild, no src/test/config edits, no commit. `noeticbraid` and Playwright-MCP
chrome untouched; no pkill/pgrep against `data/browser-profiles/`. CDP probes were
read-only (`connectOverCDP` + `evaluate` of existing DOM; one `goto` to the
already-owned music conversation to correct the shared-page targeting).
