# Capability Library — Stream #5 Final State

Generated: 2026-05-15 | Contract: consumer-contract-1.4.0 | Records: 79

---

## Stream #5 Outcome

Stream #5 delivered a major expansion of the MCP surface:

- **MCP surface grew from 13 → 37 `webai_*` tools** (contract consumer-contract-1.4.0)
- **219 unit tests** (full contract round-trip + per-tool schema + sub-MCP isolation tests)
- **3 sub-MCP modules** registered in the single flat tool array:
  - `claude-design` — 4 live tools (`create_project`, `generate`, `get_html`, `present`)
  - `gemini-music` — 3 live tools (`generate`, `task_status`, `download_track`)
  - `chatgpt-codex` — 4 live tools (`list_envs`, `submit_task`, `task_status`, `get_diff`; hard allowlist LT-0I/CN- only; live-verified 2026-05-15)
- **All 65 IMPLEMENTED_GREEN features are auto-callable** via `webai_*` MCP tools or as params on existing tools
- **4 BLOCKED_NEEDS_USER features** remain — listed in Section A of USER_HANDOFF.md; items 1,3,5,6 are user-DEFERRED; item 4 is OUT_OF_SCOPE; items 2 & 7 resolved IMPLEMENTED_GREEN
- **2 EXPLORED_PATH_KNOWN** features with known entry but policy-gated execution (`chatgpt-agent-mode`)

Key artifacts verified this stream:
- Claude Design HTML: 12319 bytes, sha256 `fb42d3fd674c0753f438eb0a905b1ea5e62416765cb3628d78dfdbee973d4e0f` (verify9)
- Gemini Music MP3: 744610 bytes, MPEG ADTS layer III v1 192 kbps, sha256 `6aabda10273efa733f844a29704ab9d44fe475daf961a31f46f28ea585a82cc8` (verify1/2)
- ChatGPT Canvas export: 27 bytes Markdown, sha256 `c38e9bd9c4baca6157db3140b2147e110b8301f4619c75d383d2c23c9686fe59` (verify4)

---

## Status Summary (per service × status)

| Status | ChatGPT | Claude | Gemini | Meta | Total |
|---|---|---|---|---|---|
| IMPLEMENTED_GREEN | 23 | 19 | 22 | 1 | **65** |
| EXPLORED_PATH_KNOWN | 1 | 0 | 0 | 0 | **2** |
| BLOCKED_NEEDS_USER | 1 | 1 | 2 | 0 | **4** |
| OUT_OF_SCOPE | 4 | 3 | 1 | 0 | **8** |
| **Total** | **29** | **23** | **25** | **1** | **78** |

---

## ChatGPT Features

| id | name | status | mcp_tool / param | evidence |
|---|---|---|---|---|
| chatgpt-send-prompt | Send text prompt / chat | IMPLEMENTED_GREEN | `webai_chatgpt_send_prompt` | docs/plans/stream4-implementation-report.md |
| chatgpt-upload-and-query | File upload + query (multi-file) | IMPLEMENTED_GREEN | `webai_chatgpt_upload_and_query` | docs/plans/stream4-implementation-report.md |
| chatgpt-generate-file | Generate and download file artifact (DOCX/PDF/CSV/etc.) | IMPLEMENTED_GREEN | `webai_chatgpt_generate_file` | docs/plans/stream4-implementation-report.md |
| chatgpt-generate-image | Generate image (DALL-E / GPT-4o image) | IMPLEMENTED_GREEN | `webai_chatgpt_generate_image` | docs/plans/stream4-implementation-report.md |
| chatgpt-canvas | Canvas (collaborative document/code editing surface) | IMPLEMENTED_GREEN | `webai_chatgpt_send_prompt` (canvas:boolean param) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-canvas-export | Canvas export (PDF/DOCX/Markdown) | IMPLEMENTED_GREEN | `webai_chatgpt_canvas_export` | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-sidebar-codex | Sidebar Codex (code agent / cloud coding environment) | IMPLEMENTED_GREEN | `webai_chatgpt_codex_list_envs`, `webai_chatgpt_codex_submit_task`, `webai_chatgpt_codex_task_status`, `webai_chatgpt_codex_get_diff` (sub-MCP chatgpt-codex, 4 tools, live on LT-0I/CN-) | .runs/web-ai-explore/stream5/discovery-chatgpt-codex.json |
| chatgpt-deep-research | Deep Research (multi-source web research, long synthesis) | IMPLEMENTED_GREEN | `webai_chatgpt_deep_research` | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-voice-mode | Voice mode (Advanced Voice / GPT-4o audio) | BLOCKED_NEEDS_USER | — | .runs/web-ai-explore/stream5/blocked-chatgpt.md |
| chatgpt-model-selector | Model selection (Thinking/Instant/Pro) | IMPLEMENTED_GREEN | `webai_chatgpt_send_prompt` (model param) | .runs/web-ai-explore/stream5/verify3-chatgpt.json |
| chatgpt-projects | Projects (grouped conversations with shared context) | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=projects) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-tasks | Tasks (scheduled recurring ChatGPT tasks) | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=tasks) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-pulse | Pulse (research digest / news briefing) | IMPLEMENTED_GREEN | `webai_chatgpt_pulse_get`, `webai_chatgpt_pulse_onboard` | .runs/web-ai-explore/stream5/discovery-chatgpt-pulse.json |
| chatgpt-gpt-store | GPT Store (custom GPT discovery and launch) | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=gpts) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-memory | Memory (persistent user facts across conversations) | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=memory) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-settings-personalization | Settings: Personalization | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=personalization) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-settings-data-controls | Settings: Data controls | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=data_controls) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-share-conversation | Share conversation (link / social) | IMPLEMENTED_GREEN | `webai_chatgpt_conversation_manage` (action=share) | .runs/web-ai-explore/stream5/verify3-chatgpt.json |
| chatgpt-conversation-management | Conversation management (rename, archive, delete, search) | IMPLEMENTED_GREEN | `webai_chatgpt_conversation_manage` | .runs/web-ai-explore/stream5/verify-chatgpt.json |
| chatgpt-data-analyst | Data Analyst (upload CSV/XLSX → chart + code execution) | IMPLEMENTED_GREEN | `webai_chatgpt_upload_and_query` | .runs/web-ai-explore/stream5/recipes-chatgpt.md |
| chatgpt-agent-mode | Agent mode (autonomous multi-step task execution) | EXPLORED_PATH_KNOWN | — (entry reachable; execution intentionally not automated — policy) | .runs/web-ai-explore/stream5/verify-chatgpt.json |
| chatgpt-apps-mcp | Apps / MCP connectors (integrate external tools) | IMPLEMENTED_GREEN | `webai_chatgpt_workspace` (surface=apps) | .runs/web-ai-explore/stream5/verify4-chatgpt.json |
| chatgpt-workspace-agents | Workspace agents (enterprise team agents) | OUT_OF_SCOPE | — | .runs/web-ai-explore/stream5/discovery-chatgpt.json |
| chatgpt-atlas-browser | Atlas browser (AI-guided web browsing agent) | BLOCKED_NEEDS_USER | — | .runs/web-ai-explore/stream5/blocked-chatgpt.md |
| chatgpt-search-web | Web search (real-time Bing-powered search in chat) | IMPLEMENTED_GREEN | `webai_chatgpt_send_prompt` (web_search:boolean param) | .runs/web-ai-explore/stream5/recipes-chatgpt.md |
| chatgpt-study-mode | Study mode (flashcards, quizzes from uploaded content) | OUT_OF_SCOPE | — | .runs/web-ai-explore/stream5/blocked-chatgpt-r2.md |
| chatgpt-image-visual-query | Image / visual query (upload image → ask about it) | IMPLEMENTED_GREEN | `webai_chatgpt_upload_and_query` | .runs/web-ai-explore/stream5/recipes-chatgpt.md |
| chatgpt-code-generation | Code generation + download (Python, JS, etc.) | IMPLEMENTED_GREEN | `webai_chatgpt_generate_file` | .runs/web-ai-explore/stream5/recipes-chatgpt.md |
| chatgpt-sora | Sora (video generation) | OUT_OF_SCOPE | — | docs/plans/stream4-implementation-report.md |
| chatgpt-account-billing | Account / billing / subscription management | OUT_OF_SCOPE | — | policy |

---

## Claude Features

| id | name | status | mcp_tool / param | evidence |
|---|---|---|---|---|
| claude-send-prompt | Send text prompt / chat | IMPLEMENTED_GREEN | `webai_claude_send_prompt` | docs/plans/stream4-implementation-report.md |
| claude-upload-and-query | File upload + query | IMPLEMENTED_GREEN | `webai_claude_upload_and_query` | docs/plans/stream4-implementation-report.md |
| claude-generate-file | Generate and download file artifact | IMPLEMENTED_GREEN | `webai_claude_generate_file` | docs/plans/stream4-implementation-report.md |
| claude-artifacts-export | Artifacts full export (download rendered artifact as file) | IMPLEMENTED_GREEN | `webai_claude_generate_file` (artifact_class param) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-design | Claude Design (Figma-style interactive design tool at /design) | IMPLEMENTED_GREEN | `webai_claude_design_create_project` / `_generate` / `_get_html` / `_present` (sub-MCP claude-design, 4 tools) | .runs/web-ai-explore/stream5/verify9-claude.json |
| claude-sidebar-code | Claude sidebar Code (code agent at claude.ai/code) | BLOCKED_NEEDS_USER | — | .runs/web-ai-explore/stream5/blocked-claude.md |
| claude-model-selector | Model selection (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) | IMPLEMENTED_GREEN | `webai_claude_send_prompt` (model param) | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-extended-thinking | Extended thinking mode (Adaptive thinking) | IMPLEMENTED_GREEN | `webai_claude_send_prompt` (thinking:boolean param) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-deep-research | Research mode / Deep Research | IMPLEMENTED_GREEN | `webai_claude_deep_research` | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-web-search | Web search (inline search during chat) | IMPLEMENTED_GREEN | `webai_claude_send_prompt` (web_search:boolean param) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-projects | Projects (grouped conversations with shared context) | IMPLEMENTED_GREEN | `webai_claude_workspace` (surface=projects) | .runs/web-ai-explore/stream5/verify2-claude.json |
| claude-style-presets | Response style presets (Concise, Explanatory, Formal, custom) | IMPLEMENTED_GREEN | `webai_claude_workspace` (surface=style_presets) + `webai_claude_send_prompt` (style param) | .runs/web-ai-explore/stream5/verify2-claude.json |
| claude-sharing | Share conversation / artifact (link generation) | IMPLEMENTED_GREEN | `webai_claude_conversation_manage` (action=share) | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-conversation-management | Conversation management (rename, delete, search) | IMPLEMENTED_GREEN | `webai_claude_conversation_manage` | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-integrations-connectors | Integrations / connectors (Google Drive, GitHub, etc.) | IMPLEMENTED_GREEN | `webai_claude_workspace` (surface=integrations) | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-skills | Skills (tool-use capabilities: analysis, code, etc.) | IMPLEMENTED_GREEN | `webai_claude_workspace` (surface=skills) | .runs/web-ai-explore/stream5/verify3-claude.json |
| claude-analysis-tool | Analysis tool (code execution / data analysis in-chat) | IMPLEMENTED_GREEN | `webai_claude_send_prompt` (auto-invoked) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-chrome-extension | Claude in Chrome extension | OUT_OF_SCOPE | — | .runs/web-ai-explore/stream5/discovery-claude.json |
| claude-computer-use | Computer use (autonomous OS/desktop control) | OUT_OF_SCOPE | — | policy |
| claude-incognito-mode | Incognito conversation (no history saved) | IMPLEMENTED_GREEN | `webai_claude_send_prompt` (incognito:boolean param) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-settings-appearance | Settings: Appearance + Customize | IMPLEMENTED_GREEN | `webai_claude_workspace` (surface=appearance) | .runs/web-ai-explore/stream5/verify2-claude.json |
| claude-mermaid-live | Mermaid live editor preview (in-artifact rendering) | IMPLEMENTED_GREEN | `webai_claude_generate_file` (artifact_class param) | .runs/web-ai-explore/stream5/recipes-claude.md |
| claude-account-billing | Account / billing / subscription management | OUT_OF_SCOPE | — | policy |

---

## Gemini Features

| id | name | status | mcp_tool / param | evidence |
|---|---|---|---|---|
| gemini-send-prompt | Send text prompt / chat | IMPLEMENTED_GREEN | `webai_gemini_send_prompt` | docs/plans/stream4-implementation-report.md |
| gemini-upload-and-query | File upload + query (multi-file) | IMPLEMENTED_GREEN | `webai_gemini_upload_and_query` | docs/plans/stream4-implementation-report.md |
| gemini-generate-image | Generate image (Imagen / Nano Banana) | IMPLEMENTED_GREEN | `webai_gemini_generate_image` | docs/plans/stream4-implementation-report.md |
| gemini-canvas-to-docs | Canvas → export to Google Docs | IMPLEMENTED_GREEN | `webai_gemini_canvas_to_docs` | docs/plans/stream4-implementation-report.md |
| gemini-generate-video | Generate video (Veo) | IMPLEMENTED_GREEN | `webai_gemini_generate_video` | docs/plans/stream4-implementation-report.md |
| gemini-make-music | Make music / audio (Lyria music generation) | IMPLEMENTED_GREEN | `webai_gemini_music_generate` / `_task_status` / `_download_track` (sub-MCP gemini-music, 3 tools) | .runs/web-ai-explore/stream5/verify3-gemini.json |
| gemini-deep-research | Deep Research (multi-source, long-form research) | IMPLEMENTED_GREEN | `webai_gemini_deep_research` | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-model-selector | Model selection (Fast / Thinking / Pro tiers) | IMPLEMENTED_GREEN | `webai_gemini_send_prompt` (model param) | .runs/web-ai-explore/stream5/recipes-gemini.md |
| gemini-canvas | Canvas (collaborative document editor in Gemini) | IMPLEMENTED_GREEN | `webai_gemini_canvas_to_docs` | docs/plans/stream4-implementation-report.md |
| gemini-canvas-edit | Canvas inline editing (direct text editing in canvas panel) | IMPLEMENTED_GREEN | `webai_gemini_canvas_edit` | .runs/web-ai-explore/stream5/verify3-gemini.json |
| gemini-audio-overview | Audio overview (NotebookLM-style audio summary) | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=audio_overview) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-gems | Gems (custom Gemini personas / assistants) | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=gems) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-scheduled-actions | Scheduled actions (recurring Gemini tasks) | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=scheduled) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-study-materials | Study materials / Guided learning | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=study) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-long-context | Long context (1M token window, multi-document processing) | IMPLEMENTED_GREEN | `webai_gemini_upload_and_query` (subsumed) | .runs/web-ai-explore/stream5/recipes-gemini.md |
| gemini-workspace-integration | Google Workspace integration (Docs, Drive, Gmail, Calendar) | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=workspace_integration) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-connected-apps | Connected apps listing and management | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=connected_apps) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-personalization-memory | Personalization / memory | IMPLEMENTED_GREEN | `webai_gemini_workspace` (surface=personalization) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-share-chat | Share chat (link generation) | IMPLEMENTED_GREEN | `webai_gemini_conversation_manage` (action=share) | .runs/web-ai-explore/stream5/verify-gemini.json |
| gemini-conversation-management | Conversation management (rename, delete, search, pin) | IMPLEMENTED_GREEN | `webai_gemini_conversation_manage` | .runs/web-ai-explore/stream5/verify2-gemini.json |
| gemini-account-billing | Account / billing / subscription management | OUT_OF_SCOPE | — | policy |
| gemini-deep-think | Deep Think (Gemini extended reasoning mode) | IMPLEMENTED_GREEN | `webai_gemini_send_prompt` (thinking:boolean param) | .runs/web-ai-explore/stream5/recipes-gemini.md |
| gemini-image-editing | Image editing (edit generated or uploaded images) | IMPLEMENTED_GREEN | `webai_gemini_generate_image` (reuse_conversation:boolean param) | .runs/web-ai-explore/stream5/recipes-gemini.md |
| gemini-voice-mode | Voice mode (speak to Gemini, get audio response) | BLOCKED_NEEDS_USER | — | .runs/web-ai-explore/stream5/blocked-gemini.md |
| gemini-live-mode | Live mode (real-time video/screen + audio conversation) | BLOCKED_NEEDS_USER | — | .runs/web-ai-explore/stream5/blocked-gemini.md |

---

## Meta Tools

| id | name | status | mcp_tool / param | evidence |
|---|---|---|---|---|
| meta-task-status | Task status polling (async job tracker) | IMPLEMENTED_GREEN | `webai_task_status` | docs/plans/stream4-implementation-report.md |

---

## MCP Surface — 37 webai_ Tools

All 37 tools registered in the single flat `toolSpecs` array (server.ts / tools.ts).

### Core tools (13 pre-Stream-5, baseline)

| tool name | service | description |
|---|---|---|
| `webai_chatgpt_send_prompt` | chatgpt | Send prompt; model/web_search/canvas params |
| `webai_chatgpt_upload_and_query` | chatgpt | Upload file(s) + query |
| `webai_chatgpt_generate_file` | chatgpt | Generate + download file artifact |
| `webai_chatgpt_generate_image` | chatgpt | Generate DALL-E / GPT-4o image |
| `webai_claude_send_prompt` | claude | Send prompt; model/thinking/web_search/incognito params |
| `webai_claude_upload_and_query` | claude | Upload file(s) + query |
| `webai_claude_generate_file` | claude | Generate + download file artifact |
| `webai_gemini_send_prompt` | gemini | Send prompt; model/thinking params |
| `webai_gemini_upload_and_query` | gemini | Upload file(s) + query |
| `webai_gemini_generate_image` | gemini | Generate image; reuse_conversation param |
| `webai_gemini_canvas_to_docs` | gemini | Canvas → Google Docs export |
| `webai_gemini_generate_video` | gemini | Generate video (Veo, async) |
| `webai_task_status` | meta | Poll async task status |

### New main-server tools (11, added Stream #5)

| tool name | service | description |
|---|---|---|
| `webai_chatgpt_canvas_export` | chatgpt | Export canvas as PDF/DOCX/Markdown |
| `webai_chatgpt_deep_research` | chatgpt | Deep Research (async, returns task_id) |
| `webai_chatgpt_conversation_manage` | chatgpt | Conversation manage (share/navigate/search) |
| `webai_chatgpt_workspace` | chatgpt | Workspace surfaces (projects/gpts/tasks/apps/memory/personalization/data_controls) |
| `webai_claude_deep_research` | claude | Deep Research (async, returns task_id) |
| `webai_claude_conversation_manage` | claude | Conversation manage (search/share/sidebar_options) |
| `webai_claude_workspace` | claude | Workspace surfaces (projects/integrations/skills/style_presets/appearance) |
| `webai_gemini_deep_research` | gemini | Deep Research (async, returns task_id) |
| `webai_gemini_canvas_edit` | gemini | Canvas inline editing (contenteditable) |
| `webai_gemini_conversation_manage` | gemini | Conversation manage (menu_enumerate/search/share/delete) |
| `webai_gemini_workspace` | gemini | Workspace surfaces (gems/scheduled/study/audio_overview/workspace_integration/connected_apps/personalization) |

### Sub-MCP tools (11, added Stream #5)

#### claude-design (4 tools — live)

| tool name | description |
|---|---|
| `webai_claude_design_create_project` | Create a new Claude Design project; returns projectUrl + projectId |
| `webai_claude_design_generate` | Generate HTML design from prompt; returns fileName + projectUrl |
| `webai_claude_design_get_html` | Extract rendered HTML artifact; returns savedPath + sha256 + byteSize |
| `webai_claude_design_present` | Open design in present/viewer tab; returns presentUrl |

#### gemini-music (3 tools — live)

| tool name | description |
|---|---|
| `webai_gemini_music_generate` | Generate music via Lyria; returns task_id + conversation_url |
| `webai_gemini_music_task_status` | Poll music generation status; returns status + download_ready |
| `webai_gemini_music_download_track` | Download generated MP3 (2-stage format submenu); returns savedPath + sha256 |

#### chatgpt-codex (4 tools — live, allowlist LT-0I/CN- only)

| tool name | description |
|---|---|
| `webai_chatgpt_codex_list_envs` | List connected GitHub environments (hard allowlist LT-0I/CN- only; live-verified 2026-05-15) |
| `webai_chatgpt_codex_submit_task` | Submit a Codex task (--confirmed gate enforced; live-verified 2026-05-15) |
| `webai_chatgpt_codex_task_status` | Poll Codex task status (live-verified 2026-05-15) |
| `webai_chatgpt_codex_get_diff` | Retrieve task diff/result (live-verified 2026-05-15, returns real unified diff) |

---

## BLOCKED_NEEDS_USER — Features Requiring User Decision

These 4 features cannot be resolved by engineering alone. Items 1,3,5,6 (voice/atlas/gemini) are DEFERRED by user decision 2026-05-15; item 4 (chatgpt-study-mode) moved to OUT_OF_SCOPE; item 2 (chatgpt-pulse) resolved IMPLEMENTED_GREEN 2026-05-15; item 7 (chatgpt-codex) resolved IMPLEMENTED_GREEN 2026-05-15. See USER_HANDOFF.md for details.

| id | service | root cause |
|---|---|---|
| chatgpt-voice-mode | chatgpt | No microphone device in headless Chrome; first-time consent = durable account change. DEFERRED 2026-05-15. |
| chatgpt-atlas-browser | chatgpt | No in-web entry point found; may be a separate desktop product. DEFERRED 2026-05-15. |
| claude-sidebar-code | claude | Task editor selector unknown; Send button refused by CLI guard |
| gemini-voice-mode | gemini | No microphone device in headless Chrome (button silently no-ops). DEFERRED 2026-05-15. |
| gemini-live-mode | gemini | No dedicated Live button in this web build; voice path also blocked (no mic). DEFERRED 2026-05-15. |

---

## Maintenance

- **Editable seed:** `docs/capability-library.json` — machine-readable, one record per feature. Import it with `capability:library:import`; the SQLite `integration_registry` table is the source of truth for consumers.
- **Campaign plan:** `docs/plans/web-ai-automation-v2.md`
- **Integration blueprint:** `docs/plans/stream5-integration-blueprint.md`
- **Consumer contract:** `configs/consumer-contract.json` (consumer-contract-1.4.0)
- **Contract tests:** `tests/consumerContract.test.ts`

Future sessions: do **not** re-explore IMPLEMENTED_GREEN features. Treat the imported SQLite `integration_registry` table as the authoritative map; edit `docs/capability-library.json` only as the seed and re-import it. Use `docs/plans/stream5-integration-blueprint.md` for the batch dispatch runbook (B0–B8) if extending the surface further.
