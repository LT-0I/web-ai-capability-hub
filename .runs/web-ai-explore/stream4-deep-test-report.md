---
title: Stream #4 Deep-Exploration Test Report
run_date: 2026-05-14
lanes:
  - chatgpt
  - claude
  - gemini
inputs:
  - .runs/web-ai-explore/stream4-chatgpt-exhaustive-2026-05-14/feature-exercise-report.md
  - .runs/web-ai-explore/stream4-claude-exhaustive-2026-05-14/feature-exercise-report.md
  - .runs/web-ai-explore/stream4-gemini-exhaustive-2026-05-14/feature-exercise-report.md
agent: claude-opus-orchestrator
---

# Stream #4 — Deep-Exploration Test Report

Three Claude Opus subagents exhaustively interacted with chatgpt.com,
claude.ai, and gemini.google.com on three separate Chrome instances
(CDP ports 9223/9224/9225). Each lane ran a 7-group ladder (core, upload,
generate, settings, tools, share, meta) totalling ~30-40 feature probes,
with strict PASS-only-on-evidence discipline.

**Aggregate**: 105 features attempted, **78 PASS / 14 NOT-REACHABLE / 13
INCONCLUSIVE**, **26 artifacts captured to disk with sha256**, **19
service-specific MCP candidates proposed**.

This report is Phase 2a — the input to Phase 2b (cross-model MCP design
debate). It does NOT propose code changes; it inventories what is
stably automatable, what is flaky, what is gated, and what should
become MCP tools.

## 1. Cross-service outcome matrix

| Metric | ChatGPT | Claude | Gemini | Total |
|---|---:|---:|---:|---:|
| Features attempted | 32 | 37 | 36 | **105** |
| PASS | 23 | 27 | 28 | **78** |
| NOT-REACHABLE | 4 | 6 | 4 | **14** |
| INCONCLUSIVE | 5 | 4 | 4 | **13** |
| Artifacts on disk (sha256) | 7 | 12 | 7 | **26** |
| Artifact total size | ~960 KB | ~140 KB | ~5.0 MiB | **~6 MiB** |
| MCP candidates proposed | 7 | 6 | 6 | **19** |
| Tab handoff | clean (40→40) | leak (3 freed by orchestrator) | clean (1→1) | — |
| Wall time | 65 min | 52 min + 8 min finalize | 57 min | — |

## 2. What is stably automatable today (per service)

### ChatGPT (port 9223 / profile `chatgpt`)

End-to-end with deterministic selectors:

| Capability | Selector / path | Evidence |
|---|---|---|
| Send prompt + capture response | `#prompt-textarea` + Enter or `[data-testid=send-button]` | core/send-receive, generate/python, etc. |
| Multi-file upload + Q&A | `input#upload-files` (sequential calls) | upload/multifile |
| Code-class artifact download (.py/.md/.csv/.docx/.pdf/.svg) | `button.behavior-btn` via `browser:artifact-click` | 6 files captured |
| Image-gen download (NEW — unblocks Stream #3 INCONCLUSIVE) | `img` (open viewer) → `button[aria-label='Save']` | yellow-circle-blue-bg.png 919 KB captured |
| Custom GPT direct invocation | URL pattern `/g/<id>-<slug>` + same composer | Scholar GPT response captured |
| List Custom GPTs landing | `/gpts` route + gizmo-link cards | ≥9 GPTs enumerated |
| Settings tab read (10 tabs) | `button:has-text('<tab name>')` | General/Personalization/Apps/Schedules/Data/Storage/Security/Parental/Notifications/Account |

Critical fact discovered: ChatGPT's `?model=gpt-5-thinking` URL hint
reliably pins the Thinking-tool path that emits `button.behavior-btn`
download chips. Without it the model often flips to Instant which
cannot write DOCX/PDF/SVG and stalls in `Stop answering`.

### Claude (port 9224 / profile `claude-9224`)

End-to-end with deterministic selectors:

| Capability | Selector / path | Evidence |
|---|---|---|
| Send prompt + capture response | `[contenteditable="true"]` or `#prompt-textarea` | core/send-receive |
| Multi-file upload | `#chat-input-file-upload-onpage` (up to 3 simultaneous) | upload/multifile |
| **Code-class** artifact download (.py/.csv/.svg/.mmd/.jsx) | in-message `button[aria-label="Download <Name>"]` | py + csv + svg + mmd + jsx captured |
| **Document-class** artifact download (.docx/.xlsx/.pdf/.pptx/.html/.md) | panel-header icon `button[aria-label="Download"]` at ≈(1160,10,32,32) | xlsx + docx + pdf + pptx + html captured |
| Artifact HTML preview pane | `iframe` inside artifact panel | dark-mode-toggle.html captured |
| Artifact React component | Preview/Code radio toggle | counter.jsx captured |
| Artifact Mermaid diagram + Live Editor iframe (NEW catalog surface) | `iframe` inside artifact panel | three_ai_orchestration.mmd captured |
| Create project with knowledge text | `/projects/create` form → "Add files" → "Add text content" modal | stream4-claude-test project created |
| List Skills | `/customize/skills` | 1 skill: skill-creator |
| Set style preset | composer "+" → menuitem "Use style" → `menuitemcheckbox` | Normal/Concise/Normal cycle |
| Settings tab read (5+ tabs) | sidebar nav | General/Account/Usage/Claude Code/Browser Extension |

Critical fact: Claude file-creation downloads route to system default
`~/Downloads`, NOT `--download-dir`. MCP tools must move the file
after capture.

### Gemini (port 9225 / profile `gemini-9225`)

End-to-end with deterministic selectors:

| Capability | Selector / path | Evidence |
|---|---|---|
| Send prompt + capture response | `div[role="textbox"][aria-label="Enter a prompt for Gemini"]` + Enter | core/send-receive |
| Multi-file upload | `button[aria-label="Open upload file menu"]` → 2-step menu → `input[type=file]` | upload/multifile |
| Image generation + download | home-screen `Create image` chip → composer → `button[aria-label="Download full size image"]` | 4.2 MiB PNG captured |
| **Video generation + download** (PRO) | Tools → Create video → composer → `button[aria-label="Download video"]` | 8s MP4 captured (~750 KB, 3-5 min latency) |
| Canvas + Export to Docs (text artifacts only) | Tools → Canvas → composer → `button[aria-label="Expand"]` → `button[aria-label="Share and export canvas"]` → menu `Export to Docs` | Docs URL captured |
| Deep Research full flow | Tools → Deep research → plan → `button[aria-label="Start research"]` → poll for `button[data-test-id="export-menu-button"]` → `Export to Docs` | 14k-char report + 28+ sources + Drive doc |
| Settings menu enumeration | `button[aria-label="Settings & help"]` | full menu captured |
| Personal Intelligence / Saved info / Apps / My stuff | `/personalization-settings`, `/saved-info`, `/apps`, `/library` (all `?hl=en`) | all PASS |
| Audio Overview play (PLAYBACK only) | per-response menu → `Listen` | no download surface |
| Scheduled actions read | `/scheduled?hl=en` (NOT `/scheduled-actions` — 404) | form captured (NOT submitted) |

Critical fact: Gemini's code-execution sandbox **always returns the
source Python**, NOT the requested `.csv` / `.md` / `.svg` artifact.
For text-shaped outputs (DOCX/PDF text/etc.) the **Canvas → Export
to Docs** path is the only reliable way to capture the actual file.

## 3. What is flaky / multi-step / state-dependent

These need careful MCP design or a `--follow-up-*` flag chain:

| Service | Feature | Reason |
|---|---|---|
| ChatGPT | XLSX generation | Model auto-flips to Instant which can't write XLSX; needs Thinking + tool-pin via URL hint, fragile |
| ChatGPT | PPTX export | Inline presentation viewer + fullscreen overlay; multi-step capture |
| ChatGPT | Canvas text export | Download is dropdown menu trigger, not chip; needs `--follow-up-selector` inside menu |
| ChatGPT | Data Analyst chart PNG | `role=dialog` with duplicate `Download <name>.png` buttons; the chip click opens dialog (not download) |
| Claude | Markdown / HTML download via chevron | Radix IDs rotate per session; transient network-error toasts intercept first click; needs Escape-and-retry loop with re-query |
| Claude | Deep Research export path | Research completed (30 sources, 44s) but export selector sequence not yet discovered before run terminated; multi-step + timing-sensitive |
| Claude | Connector setup (GitHub) | Connect triggers OAuth → out of scope for AI automation |
| Gemini | Premade Gem launch | Brainstormer now opens at `/gem-labs/<id>` iframe instead of `/app/<id>` chat; composer unreachable from outer frame — active A/B rollout |
| Gemini | Share conversation | **AUTO-PUBLISHES** with no confirmation step — incompatible with autonomous MCP without mandatory cleanup pass |
| Gemini | Generic file (.csv/.md/.svg/.docx) | Returns source Python, not the artifact — architectural; needs alternate routing through Canvas |

## 4. What is gated / NOT-REACHABLE

Privacy-sensitive or plan/account-gated; should not be in scope for general MCP:

| Service | Feature | Gate type |
|---|---|---|
| All | Audio / microphone surfaces | Shared host |
| All | Billing / subscription routes | Doctrine §3 |
| All | API key routes | Doctrine §3 |
| All | Drive / GitHub fresh OAuth | Auth out of scope |
| All | Public publishing buttons | Doctrine §3 |
| ChatGPT | Pulse content view | Onboarding not completed (durable change) |
| ChatGPT | Schedule action create | Durable account state change |
| Claude | `/settings/connectors` direct route | Returns server error toast (now redirects to `/customize/connectors`) |
| Claude | Skills add-skill | Requires external bundle upload (state-changing) |
| Claude | Computer-use autonomous browsing | Doctrine — entry observation only |
| Claude | Video / audio generation | Not present in Claude web UI |
| Gemini | Workspace connectors enable | Requires per-app OAuth |
| Gemini | Audio Overview download | No file-export control (TTS playback only) |
| Gemini | Scheduled actions create | Durable account state change |
| Gemini | Gemini Agent autonomous | Doctrine — entry only |

## 5. Selector / behavioral findings → catalog v1.3.0

Should flow back into `docs/research/{chatgpt,claude,gemini}-feature-catalog.md` as a v1.3.0 bump in a future pass:

### ChatGPT
1. `WAH_DEFAULT_PROFILE` env-var requirement for `browser:read|type|click|press|upload` (CLI behavior, document in catalog `automation_notes`).
2. `?model=gpt-5-thinking` URL hint pins the Thinking-tool path.
3. Image-gen download path: `img → fullscreen viewer → button[aria-label='Save']`.
4. Custom GPT URL pattern `/g/<id>-<slug>/c/...`.
5. Settings → Apps "Connectors are now called Apps" — name change.
6. Settings → Schedules tab confirmed (Stream #2 only had inference).
7. `share-menu-social` — Share dialog is `Copy link / X / LinkedIn / Reddit` only.

### Claude
1. `/settings/connectors` redirects → `/customize/connectors`.
2. Sidebar label `Claude in Chrome Beta` (href `/settings/browser-extension`, NOT `/settings/claude-in-chrome` which 404s).
3. `claude-design-app` new surface at `/design` (Figma-style; separate usage quota).
4. `mermaid-live-editor-preview` iframe inside artifact panel for Mermaid diagrams.
5. Code-class vs document-class download path distinction (already in v1.2.0 but worth bolding).
6. `project-add-text-content` modal flow (avoids native OS file picker).
7. No @-mention quick-invoke; closest analogue is composer "+" menu.
8. `composer-research-mode` and `composer-web-search-mode` are distinct affordances.
9. No conversation-level export — per-artifact only.

### Gemini
1. Scheduled actions URL is `/scheduled?hl=en` (NOT `/scheduled-actions` — 404).
2. `gems-launch` splits into `gems-launch-classic` (chat) and `gems-launch-gem-lab` (iframe app).
3. Code-execution sandbox returns source Python, not the artifact — recurring catalog ambiguity to address.
4. `canvas-export-share` button `button[aria-label="Share and export canvas"]` with 3-item menu.
5. Deep Research export menu trigger `button[data-test-id="export-menu-button"]` — stable selector.
6. `/library` auto-populates Canvas + Deep Research outputs.
7. Scheduled action templates (4): News digest / Explorations / What's for dinner? / Morning motivation.
8. Connected Apps confirmed new entries: OpenTable / SynthID / YouTube Music (Stream #3 captured; confirmed stable).

## 6. Consent-dialog catalog (what MCP tools must handle)

| Service | Dialog | Frequency | MCP handling |
|---|---|---|---|
| All | CLI sensitivity guard | Per-call for `Send`/`profile`/`download`-named selectors | Pass `--confirmed true` per call |
| ChatGPT | Study Mode promotion modal | Random / first-time | Click `button[aria-label='Close']` |
| ChatGPT | Temp-chat consent | Per upload in temp chats | Avoid temp chats; use regular |
| Claude | Network-error toast (artifact panel) | Intermittent | Escape×3, re-query Radix IDs |
| Gemini | First-use upload consent | Once per profile | Click `Got it` / `Agree` |
| Gemini | Stay-in-the-know email opt-in card | First /app visit | Click `Not now` |

## 7. Proposed MCP tool surface

The 3 lane reports collectively propose 19 service-specific tools. After
cross-cutting analysis I see **5 cross-service tools** and **14
service-specific tools**.

### 7.1 Cross-service tools (single tool, service param)

| Tool name | Inputs | Outputs | Coverage |
|---|---|---|---|
| `webai.send_prompt` | `service`, `profile`, `prompt`, `model?`, `tab_url_contains?`, `wait_for_completion?` | `conversationId`, `chatUrl`, `responseText`, `modelUsed`, `elapsedMs`, `errorCode` | All 3 services |
| `webai.upload_and_query` | `service`, `profile`, `files[]`, `prompt` | `responseText`, `attachmentNames[]`, `errorCode` | All 3 (≤3 files Claude/Gemini, multi-call ChatGPT) |
| `webai.generate_and_download_file` | `service`, `profile`, `prompt`, `artifact_class` (`code`/`document`), `expected_extension`, `download_dir` | `path`, `sha256`, `size_bytes`, `errorCode` | ChatGPT + Claude (Gemini code-class only) |
| `webai.generate_image_and_download` | `service`, `profile`, `prompt`, `download_dir` | `path`, `sha256`, `size_bytes`, `errorCode` | All 3 |
| `webai.read_settings_tab` | `service`, `profile`, `tab` | `widgets[]: [{ kind, label, currentState? }]`, `errorCode` | All 3 (per-service tab enums) |

### 7.2 Service-specific tools (where surface diverges)

ChatGPT:
- `webai.chatgpt.save_image_via_viewer` (separate from cross-service because the viewer→Save sequence is unique)
- `webai.chatgpt.list_custom_gpts` / `webai.chatgpt.invoke_custom_gpt`

Claude:
- `webai.claude.create_project_with_knowledge`
- `webai.claude.list_skills`
- `webai.claude.set_style_preset`

Gemini:
- `webai.gemini.generate_video` (Pro/Ultra; 3-5 min latency)
- `webai.gemini.canvas_to_docs` (alt path for csv/md/docx where direct download isn't available)
- `webai.gemini.deep_research_summary` (specialized — 7+ min runtime, Drive doc creation)

### 7.3 Recommended error-code additions to the consumer contract

Beyond the existing taxonomy (ELEMENT_NOT_FOUND, IFRAME_NOT_FOUND,
ARTIFACT_DOWNLOAD_TIMEOUT, MODE_UNCERTAIN, HUMAN_HANDOFF_REQUIRED,
INVALID_ARGS), Stream #4 surfaced needs for:

| New error code | When emitted |
|---|---|
| `SENSITIVE_GUARD_BLOCKED` | CLI sensitivity heuristic refused a click without `--confirmed` |
| `MODEL_PICKER_FLIPPED` | Selected model was auto-replaced (e.g. Thinking → Instant) |
| `INSUFFICIENT_PLAN` | Pro/Ultra/Max-only feature attempted on lower tier |
| `AUTO_PUBLISH_DETECTED` | Action would auto-publish (Gemini Share) without confirmation |
| `RESEARCH_TIMEOUT` | Deep Research / long-running mode exceeded time budget |
| `OAUTH_REQUIRED` | Connector / Drive / external auth needed |
| `ARTIFACT_MODE_UNSUPPORTED` | Service returns source code instead of requested artifact (Gemini csv/md case) |

## 8. MCP-tool stability tiers

Tier A (deterministic, ready for MCP today):
- `webai.send_prompt` (all 3)
- `webai.upload_and_query` (all 3)
- `webai.generate_image_and_download` (all 3)
- `webai.read_settings_tab` (all 3, scoped per-service)
- `webai.chatgpt.save_image_via_viewer`
- `webai.chatgpt.list_custom_gpts` + `invoke_custom_gpt`
- `webai.claude.create_project_with_knowledge`
- `webai.claude.list_skills`
- `webai.claude.set_style_preset`
- `webai.gemini.generate_video`
- `webai.gemini.canvas_to_docs`

Tier B (works but needs `--follow-up-*` chain or retry-with-Escape):
- `webai.claude.download_document_artifact` (chevron-menu, Radix-IDs rotate)
- `webai.gemini.deep_research_summary` (7+ min latency, multi-step export menu)
- `webai.chatgpt.export_data_analyst_chart` (role=dialog, button disambiguation)

Tier C (not yet ready — needs catalog research / different design):
- `webai.gemini.generate_csv_or_md` (Gemini sandbox returns source, not artifact)
- `webai.chatgpt.generate_pptx_export` (fullscreen viewer host)
- `webai.claude.deep_research_export` (selector sequence not yet captured)
- `webai.gemini.launch_gem_lab` (iframe app composer unreachable)
- `webai.*.audio_overview_download` (no file-export surface anywhere)

## 9. Phase 2b inputs

For the Phase 2b cross-model design debate, the open questions to put to claude/codex/gemini advisors:

1. **Tool granularity**: should `webai.send_prompt` be one tool with a `service` param, or 3 separate tools (`webai.chatgpt.send_prompt`, etc.)? The former is fewer tools for an LLM to choose from; the latter has stricter schemas and clearer error codes.
2. **Tier A vs Tier B**: should Tier B tools ship as `maturity: experimental` in the consumer contract, or wait until they're Tier A?
3. **Error code list**: which of the 7 proposed new codes are worth contract-bumping (1.3.0?) vs being added later?
4. **Privacy guardrails**: should `webai.gemini.send_prompt` automatically refuse any prompt that would touch `Share conversation`? Or rely on the orchestrator to know?
5. **Concurrency model**: how does the MCP server handle 2 concurrent calls to the same profile? Tab allocation should serialize per-profile; cross-profile is fine.
6. **Result caching**: Deep Research takes 7+ min; should the MCP tool return a task-id and let the caller poll, vs blocking the full duration?

## 10. Non-anti-slop self-check

- Every PASS in this report traces to a per-checkpoint `note.md` under one of the 3 lane run dirs, with `Status: PASS` and evidence path.
- Every artifact claim ties to an on-disk file with sha256.
- INCONCLUSIVE rows are not silently upgraded to PASS — the Claude finalizer caught and corrected 2 over-claims from the original Opus run.
- Tab leaks are noted, not hidden — the orchestrator freed 3 leaked Claude tabs during cleanup.
- Service limitations are surfaced (Gemini sandbox-source-only, ChatGPT model-flip, Claude chevron Radix-ID rotation) without proposing workaround code in this report — those decisions belong to Phase 2b design and Phase 2c implementation.
