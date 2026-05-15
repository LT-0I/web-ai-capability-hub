---
title: Stream #4 — MCP Tool Surface Design (v1.3.0 plan)
run_date: 2026-05-14
inputs:
  - .runs/web-ai-explore/stream4-deep-test-report.md
  - .omc/artifacts/ask/codex-read-omc-codex-prompts-stream4-mcp-design-debate-md-in-this--2026-05-14T17-09-07-659Z.md
  - .omc/artifacts/ask/gemini-read-omc-codex-prompts-stream4-mcp-design-debate-md-in-this--2026-05-14T17-14-22-350Z.md
agent: claude-opus-orchestrator
advisor_consensus: codex + gemini (claude advisor failed CLI flag bug)
---

# Stream #4 — MCP Tool Surface Design (v1.3.0)

Synthesizes two advisor recommendations (Codex critic + Gemini production-MCP) with the Phase 2a deep-exploration evidence. Produces the concrete v1.3.0 implementation plan for Phase 2c codex dispatch.

## 1. Architecture decision: service-specific tools

**Decision**: ship 3 separate per-service tool namespaces (`webai.chatgpt.*`, `webai.claude.*`, `webai.gemini.*`).

**Both advisors agree.** Selectors, model semantics, upload paths, artifact behavior, latency, plan gates, and privacy hazards diverge sharply across services. A unified `service`-param tool would:
- Hide divergence behind runtime branching (worse error codes, vaguer schemas)
- Encourage LLM "hallucinated parameter" misuse (Claude-specific arg passed to Gemini)
- Break per-service telemetry boundaries

**Cost accepted**: 12 tools instead of 5. Per Codex: "Twelve precise tools are less dangerous than five vague ones whose valid inputs differ by service."

## 2. v1.3.0 Tier-A tool list (12 tools)

For each: name, 1-line description, key inputs/outputs, evidence anchor.

### Send prompt (3 tools)

1. **`webai.chatgpt.send_prompt`**
   - Inputs: `profile`, `prompt`, `model?` (Thinking/Instant/Auto), `tab_url_contains?`, `timeout_ms?`
   - Outputs: `conversation_id`, `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `errorCode`
   - Evidence: ChatGPT `core/send-receive/note.md`; selector `#prompt-textarea`
   - Notes: `?model=gpt-5-thinking` URL hint pins Thinking-tool path; emit `MODEL_SELECTION_DRIFT` if observed model ≠ requested

2. **`webai.claude.send_prompt`**
   - Inputs: `profile`, `prompt`, `tab_url_contains?`, `style?` (Normal/Concise/etc), `timeout_ms?`
   - Outputs: `conversation_id`, `chat_url`, `response_text`, `elapsed_ms`, `errorCode`
   - Evidence: Claude `core/send-receive/note.md`; selector `[contenteditable="true"]` or `#prompt-textarea`

3. **`webai.gemini.send_prompt`**
   - Inputs: `profile`, `prompt`, `model?` (Fast/Thinking/Pro), `tab_url_contains?`, `timeout_ms?`
   - Outputs: `chat_url`, `response_text`, `model_used`, `elapsed_ms`, `errorCode`
   - Evidence: Gemini `core/send-receive/response.txt`; selector `div[role="textbox"][aria-label="Enter a prompt for Gemini"]`

### Upload + query (3 tools)

4. **`webai.chatgpt.upload_and_query`**
   - Inputs: `profile`, `files[]`, `prompt`, `tab_url_contains?`
   - Outputs: `conversation_id`, `attachment_names[]`, `response_text`, `errorCode`
   - Evidence: `upload/multifile/note.md`; selector `input#upload-files`

5. **`webai.claude.upload_and_query`**
   - Inputs: `profile`, `files[]` (max 3), `prompt`, `tab_url_contains?`
   - Outputs: `files_uploaded_count`, `attachment_names[]`, `response_text`, `errorCode`
   - Evidence: Claude `upload/multifile/note.md`; selector `#chat-input-file-upload-onpage`

6. **`webai.gemini.upload_and_query`**
   - Inputs: `profile`, `files[]`, `prompt`, `tab_url_contains?`
   - Outputs: `files_in_chip[]`, `response_text`, `chat_url`, `errorCode`
   - Evidence: Gemini `upload/multifile/response.txt`; 2-step upload menu

### Generate file (2 tools)

7. **`webai.chatgpt.generate_file`**
   - Inputs: `profile`, `prompt`, `expected_extension` (py/md/csv/docx/pdf/svg), `download_dir`, `model?`
   - Outputs: `path`, `sha256`, `size_bytes`, `suggested_filename`, `errorCode`
   - Evidence: 6 ChatGPT artifacts with sha256 (py 513 B / md 1405 B / csv 193 B / docx 37280 B / pdf 2298 B / svg 253 B)
   - Selector: `button.behavior-btn` via `browser:artifact-click`

8. **`webai.claude.generate_file`**
   - Inputs: `profile`, `prompt`, `artifact_class` (code/document), `expected_extension`, `download_dir`
   - Outputs: `path`, `sha256`, `size_bytes`, `artifact_name`, `errorCode`
   - Evidence: 9 Claude artifacts with sha256 (py 661 B / csv 172 B / svg 171 B / mmd 922 B / xlsx 5340 B / docx 10226 B / pdf 3029 B / pptx 67708 B / html 7712 B)
   - Selector routing: code-class → in-message `button[aria-label="Download <Name>"]`; document-class → panel-header icon `button[aria-label="Download"]`
   - **Critical**: Claude downloads route to `~/Downloads`, NOT `download_dir`. Tool must move file after capture.

### Generate image (2 tools)

9. **`webai.chatgpt.generate_image`**
   - Inputs: `profile`, `prompt`, `download_dir`, `tab_url_contains?`
   - Outputs: `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`
   - Evidence: yellow-circle-blue-bg.png sha `a5ddd39e...8426`, 1254×1254
   - Sequence (single internal call, semantic surface): `img → fullscreen viewer → button[aria-label='Save']`

10. **`webai.gemini.generate_image`**
    - Inputs: `profile`, `prompt`, `download_dir`, `size?` (1024×1024/etc)
    - Outputs: `path`, `sha256`, `size_bytes`, `dimensions`, `errorCode`
    - Evidence: PNG sha `c0dfaf57...7aa28`, 2048×2048 (4.2 MiB)
    - Selector: `button[aria-label="Download full size image"]`

### Gemini export + video (2 tools)

11. **`webai.gemini.canvas_to_docs`**
    - Inputs: `profile`, `prompt`, `title?`, `tab_url_contains?`
    - Outputs: `docs_url`, `docs_doc_id`, `title`, `errorCode`
    - Evidence: Gemini `generate/canvas-text/exported-doc-url.txt`
    - Purpose: the only reliable path to capture Gemini text-shaped artifacts (csv/md/docx) since the code sandbox returns source Python

12. **`webai.gemini.generate_video`** (async — see §5)
    - Inputs: `profile`, `prompt`, `download_dir`, `duration_seconds?` (2/4/8), `timeout_ms?`
    - Outputs: `task_id` (always), then on poll `status`, `path?`, `sha256?`, `size_bytes?`, `errorCode`
    - Evidence: MP4 sha `b275d515...e2ce`, 8s clip 750 KB, 3-5 min latency
    - Selector: `button[aria-label="Download video"]`

## 3. v1.3.0 Tier-A error codes

**Both advisors converged on these as required for v1.3.0:**

1. `AUTO_PUBLISH_DETECTED` — emitted when an action would auto-create a public link without explicit confirmation (Gemini Share footgun). Cleanup-after-publication is too late; the contract must refuse.
2. `ARTIFACT_MODE_UNSUPPORTED` — emitted when a service returns the wrong artifact shape (Gemini csv/md/svg → source Python). Distinct from timeout or selector miss; tells caller to pivot path.
3. `MODEL_SELECTION_DRIFT` — renamed from `MODEL_PICKER_FLIPPED`; emitted when observed model ≠ requested (ChatGPT Thinking→Instant). "Flipped" is too narrow.
4. `PLAN_OR_QUOTA_REQUIRED` — renamed from `INSUFFICIENT_PLAN`; covers plan AND quota exhaustion (Gemini's quota-rotation pattern, Claude Design plan-gating).
5. `SAFE_OUTPUT_REDACTION_REQUIRED` — new (Codex proposal); emitted when a tool would return a field that's on the consumer-contract redaction list.
6. `PROFILE_LEASE_BUSY` — new (Codex proposal); emitted on same-profile concurrent mutation attempts.

**Deferred to 1.4.0+:**
- `OAUTH_REQUIRED` (no OAuth-gated tools shipping in 1.3.0)
- `ASYNC_POLL_EXPIRED` (need real polling infrastructure first)
- `RESEARCH_TIMEOUT` (no research tool shipping yet; use `COMMAND_TIMEOUT`)

**Rejected:**
- `SENSITIVE_GUARD_BLOCKED` — maps to existing `POLICY_APPROVAL_REQUIRED`; not a new code

## 4. Privacy guardrails

Codex was strict; Gemini was complementary; combining both:

1. **Hardcoded publish-class label deny list** (rejected at MCP layer before any DOM click): `Share conversation`, `Create public link`, `Create share link`, `Copy public link`, `Publish`, `Make public`, `Post to community`, `Submit listing`, `Share Canvas`. Tools that need them ship `risky` and only as v1.4.0+.
2. **Mandatory post-export `/sharing` scan** on Gemini after any export/share-adjacent flow. If a public link exists that wasn't there pre-flow, return `AUTO_PUBLISH_DETECTED` (not success) plus best-effort cleanup attempt.
3. **Schema-level redaction**: tool outputs MUST exclude — per `docs/CONSUMER_CONTRACT.md` — conversation URLs (unless explicitly necessary for the contract), account email, `profileDir`, `cdpEndpoint`, `webSocketDebuggerUrl`, `cookies`, `tokens`, screenshot bytes, raw DOM, `html` snapshots.
4. **Prompt-content refusal**: tools refuse prompts that ask to publish, share publicly, invite collaborators, enable new connectors, alter billing, create scheduled actions, or change account settings. Returns `POLICY_APPROVAL_REQUIRED` (not silent rejection).

## 5. Concurrency / latency

**Decision**: hybrid.

- **Sync** for tools with p95 ≤ 60 s: send_prompt × 3, upload_and_query × 3, generate_file × 2, generate_image × 2, canvas_to_docs (5 of 12).
- **Async task-id + poll** for tools with p95 > 60 s: `webai.gemini.generate_video` only. Implement `webai.task_status` as a sibling tool.

**Rationale**: Codex's strict view wins on the principle (don't block MCP for 3-7 minutes), but Gemini's pragmatism wins on scope (only 1 of 12 v1.3.0 tools actually needs async). Build the async framework once for video; reuse for Deep Research in v1.4.0+.

**Async tool shape**:
- `webai.gemini.generate_video(...) → { task_id, status: "queued"|"running", lease_id, started_at }`
- `webai.task_status(task_id) → { status: "running"|"complete"|"failed", progress_label?, result?: { path, sha256, ... }, errorCode? }`
- Tool internally serializes per-profile (acquires lease); cross-profile is parallel.
- Same-profile mutation while lease held → `PROFILE_LEASE_BUSY`.
- Optional `webai.task_cancel(task_id)` for graceful cleanup.

## 6. What we are NOT shipping in v1.3.0

| Tool | Reason | Earliest |
|---|---|---|
| `webai.read_settings_tab` | Includes account email / session / org data — needs per-service redaction schema first | 1.4.0+ after redaction layer |
| `webai.claude.create_project_with_knowledge` | Creates durable account state; needs `risky` classification + explicit naming | 1.4.0+ as `risky` |
| `webai.claude.list_skills` | Useful but low-impact; defer | 1.4.0+ |
| `webai.claude.set_style_preset` | Useful but low-impact; defer | 1.4.0+ |
| `webai.chatgpt.list_custom_gpts` / `invoke_custom_gpt` | Useful; defer with skills/style preset | 1.4.0+ |
| `webai.gemini.deep_research_summary` | 7+ min runtime; needs async + Drive cleanup semantics proven first via Veo | 1.4.0+ |
| `webai.chatgpt.save_image_via_viewer` | Folded into `webai.chatgpt.generate_image` as implementation detail | — |
| `webai.generate_and_download_file` (cross-service) | Gemini coverage overclaimed; per-service tools are honest | rejected |
| `webai.gemini.generate_csv/md/svg` | Sandbox returns Python source, not artifact; pivot to canvas_to_docs | rejected |
| `webai.chatgpt.generate_pptx_export` | Fullscreen viewer host; needs `--follow-up-selector` chain | 1.4.0+ |
| `webai.chatgpt.export_data_analyst_chart` | role=dialog with duplicate buttons; needs disambiguation | 1.4.0+ |
| `webai.gemini.launch_gem_lab` | iframe app composer unreachable from outer frame | rejected until upstream stabilizes |

## 7. Implementation order for Phase 2c (4 batches)

Each batch is independently mergeable; partial completion still ships a coherent contract slice.

**Batch 1 — Core chat (3 tools)**
- `webai.chatgpt.send_prompt`
- `webai.claude.send_prompt`
- `webai.gemini.send_prompt`
- Plus: profile-lease serialization, `MODEL_SELECTION_DRIFT` emission, `PROFILE_LEASE_BUSY` emission
- Tests: 3 round-trip tests (CLI → MCP → response shape) + sensitive-field-redaction assertion

**Batch 2 — Uploads (3 tools)**
- `webai.chatgpt.upload_and_query`
- `webai.claude.upload_and_query`
- `webai.gemini.upload_and_query`
- Plus: file-count caps per service (Claude max 3, Gemini sequential), consent-dialog auto-dismiss for upload first-use only
- Tests: 3 round-trip + multi-file (txt + csv + image) end-to-end smoke

**Batch 3 — Artifact downloads (4 tools)**
- `webai.chatgpt.generate_file`
- `webai.claude.generate_file`
- `webai.chatgpt.generate_image`
- `webai.gemini.generate_image`
- Plus: sha256 verification on download, extension validation, `ARTIFACT_MODE_UNSUPPORTED` emission for Gemini csv/md/svg attempts (refuse early), Claude `~/Downloads`-to-`download_dir` mv post-capture
- Tests: 4 round-trip + at least 2 round-trip smokes that exercise an actual download path

**Batch 4 — Gemini export + async (3 tools)**
- `webai.gemini.canvas_to_docs` (sync)
- `webai.task_status` (sibling tool; async framework)
- `webai.gemini.generate_video` (async)
- Plus: hardcoded publish-deny list enforcement, mandatory `/sharing` post-export scan, `AUTO_PUBLISH_DETECTED` emission
- Tests: 1 canvas-to-docs round-trip + 1 async-task lifecycle (start → poll-running → poll-complete) + privacy guardrail unit tests

**Total**: 12 main tools + 1 sibling (`webai.task_status`) = **13 new MCP commands**. Consumer contract version bump: `1.2.0` → `1.3.0`.

## 8. Phase 2c dispatch readiness

Per CLAUDE.md hard rule 2.1, the actual implementation must dispatch via `omx exec` to a codex worker. The next step writes `.omc/codex-prompts/stream4-mcp-implementation.md` containing:

1. The full 12-tool spec from §2 with input/output JSON schemas
2. The 6 new error codes from §3 with consumer-contract.json diff
3. The privacy guardrails from §4 as code-level requirements
4. The hybrid sync/async model from §5 with `webai.task_status` signature
5. Per-batch acceptance criteria from §7
6. Round-trip test requirements for `tests/consumerContract.test.ts`
7. Forbidden actions and stop conditions

The codex dispatch will be foreground (per CLAUDE.md §2.1 standard incantation) writing to `.omc/codex-out/stream4-mcp-implementation.md`, with parallel verification via `npm run build && npm test`.
