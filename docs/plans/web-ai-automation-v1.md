# Web-AI Automation — Solution Plan v1

Author: Claude orchestrator session, 2026-05-14
Source incident: 3-round push to export DOCX + generate PPTX from ChatGPT for a literature review revealed 5 systemic gaps.

## 1. Diagnosis — what the project has vs. what it needs

### What we have today
- **Static surface catalog** under `site_registry.json` / Claude + ChatGPT adapters: enumerated buttons, menus, model pickers, share dialogs.
- **Page-level Playwright primitives**: `browser:open`, `browser:click`, `browser:upload`, `browser:download`, `browser:hover`, `browser:select-text`, `browser:drag`.
- **CDP-aware browser launcher** (`browser_research_runner.py`) — connects to existing Chrome on a fixed port if alive, else spawns one.
- **Per-AI adapters** with name patterns in multiple languages.
- **A consumer contract** (`consumer-contract-1.0.0`) for triple-surface CLI/MCP/TS exports.

### What we don't have (the 5 gaps the user surfaced)

| # | Gap | Concrete failure mode this incident |
|---|---|---|
| 1 | No model of "modes within a site" | Deep Research isn't a distinct affordance set; the catalog can't say "in DR mode the report exposes an `aria-label=导出` button inside an `about:blank` iframe" |
| 2 | Page-level download primitive can't reach sandbox iframes | Round 1/2 `locator.click()` on the export button: click registered, no `download` event fired |
| 3 | Upload primitive doesn't wait for chat-attachment state | Round 1 Phase B: `set_input_files` returned, send button stayed disabled, no error — we silently fell back to paste-text |
| 4 | No browser lifecycle ownership | After 3 rounds, profile dirs grew, multiple Chrome processes leaked, no explicit teardown |
| 5 | No declarative workflow layer | Each round re-discovered the same step sequence inside ad-hoc Python; site_registry holds surface info, not flows |

### Symptom vs root cause
The pain in this incident wasn't "ChatGPT changed its UI" — it was **the project models surfaces, not workflows**. A workflow = a verified sequence of primitive ops with explicit pre/post conditions, recovery hooks, and a teardown contract. Without that layer, every run is a re-discovery.

## 2. New + extended primitives

### 2.1 `browser:download-iframe` (NEW — Tactic 1 from round 3)

CLI:
```
browser:download-iframe \
  --profile chatgpt \
  --conversation-url https://chatgpt.com/c/XYZ \
  --button-selector 'button[aria-label="导出"]' \
  --follow-up-selector 'div[role="menuitem"]:has-text("导出到 Word")' \
  --download-dir <abs-path> \
  --filename-pattern '*.docx' \
  --timeout 60000
```

Implementation contract:
1. Connect via CDP, pierce into iframes recursively, locate the target element (frame-rooted).
2. Issue `Browser.setDownloadBehavior` with `behavior=allowAndName`, `downloadPath=$dir`, `eventsEnabled=true` at the **browser** target (NOT the page).
3. Subscribe to `Browser.downloadWillBegin` + `Browser.downloadProgress`.
4. Resolve the element's absolute viewport bbox via `DOM.getBoxModel`.
5. Dispatch `Input.dispatchMouseEvent` x3 (`mouseMoved` → `mousePressed` → `mouseReleased`) at bbox center.
6. If follow-up selector specified, wait for it to render, repeat steps 4-5.
7. Wait for `state == "completed"`. Move/rename file. Return file path + sha256.

Exit codes: 0 ok, 11 element-not-found, 12 click-acked-no-download, 13 download-timeout.

### 2.2 `browser:upload-and-confirm` (NEW)

CLI:
```
browser:upload-and-confirm \
  --profile chatgpt \
  --url https://chatgpt.com/ \
  --file <abs-path> \
  --input-selector 'input[type=file]' \
  --confirm-selector '[data-testid="send-button"]:not([disabled])' \
  --timeout 30000
```

Wraps `set_input_files` + polls for the **enabled** send-button predicate. Returns success only when the AI is actually ready to receive the message. If timeout, returns a structured error indicating "upload accepted but send-blocked" so the caller can decide between retry, paste-text alternative, or abort.

### 2.3 `browser:close` + `browser:audit` (NEW)

```
browser:close --profile chatgpt [--release-profile]
browser:audit                                  # list orphan Chrome PIDs per profile dir
```

`close` kills the Chrome processes for that profile, waits up to 10s for graceful exit, then cleans `SingletonLock` / `SingletonSocket` files. `audit` reports any chrome procs whose `--user-data-dir` matches a known profile but isn't tracked.

### 2.4 `browser:mode-switch` (NEW)

```
browser:mode-switch --profile chatgpt --mode pro \
  --thinking-depth extended \
  --research-mode off
```

One CLI call to: open model picker → select model → adjust thinking depth → toggle DR/canvas/voice off. Idempotent (no-op if already in target mode). Returns the resolved mode descriptor.

### 2.5 `browser:wait-for` (NEW)

```
browser:wait-for --profile chatgpt --selector '...' --state visible|enabled|stable \
  --content-regex '...' --timeout 60000 --poll-interval 1000
```

Universal predicate-poll primitive used by workflows. Returns when predicate satisfied; structured error on timeout including last-observed DOM context for debugging.

## 3. Workflow registry + executor (NEW layer)

### 3.1 Schema — `workflow_registry.json`

```json
{
  "workflows": [
    {
      "id": "chatgpt_deep_research_to_docx",
      "version": "1.0.0",
      "site": "chatgpt",
      "modes_required": ["pro_or_thinking", "deep_research"],
      "inputs": {"topic": "string", "sources_hint": "string?", "output_dir": "path"},
      "outputs": {"docx_path": "path", "chat_url": "url"},
      "steps": [
        {"id": "ensure-browser", "primitive": "browser:open", "args": {"profile": "chatgpt", "url": "https://chatgpt.com/"}},
        {"id": "new-chat", "primitive": "browser:click", "args": {"selector": "...new chat..."}},
        {"id": "switch-mode", "primitive": "browser:mode-switch", "args": {"mode": "pro", "research_mode": "on"}},
        {"id": "submit-prompt", "primitive": "browser:type+send", "args": {"composer_selector": "...", "text": "{{topic}}..."}},
        {"id": "approve-plan", "primitive": "browser:wait-for+click", "args": {"prompt_selector": "...approve plan...", "click_selector": "..."}},
        {"id": "await-research-complete", "primitive": "browser:wait-for", "args": {"selector": "...the report-card root...", "state": "stable", "timeout": 1800000}},
        {"id": "export-docx", "primitive": "browser:download-iframe", "args": {"button_selector": "button[aria-label='导出']", "follow_up_selector": "div[role='menuitem']:has-text('导出到 Word')", "filename_pattern": "*.docx", "download_dir": "{{output_dir}}"}},
        {"id": "verify", "primitive": "verify:docx-min", "args": {"path": "{{steps.export-docx.outputs.path}}", "min_paragraphs": 50, "min_chars": 5000}}
      ],
      "teardown": [
        {"primitive": "browser:close", "args": {"profile": "chatgpt"}, "always": true}
      ],
      "recovery": {
        "submit-prompt:cf_challenge_detected": [{"primitive": "browser:human-handoff"}],
        "export-docx:click-acked-no-download": [{"retry": 2, "delay": 5000}]
      }
    }
  ]
}
```

### 3.2 `workflow:run` CLI

```
workflow:run chatgpt_deep_research_to_docx \
  --topic "强化学习在反无人机系统中的应用" \
  --output-dir ./out \
  --dry-run    # parse + validate, don't execute
  --trace      # write step-by-step trace artifacts
```

### 3.3 Three reference workflows for v1

1. **`chatgpt_deep_research_to_docx`** — what this incident actually needed.
2. **`chatgpt_pro_normal_to_pptx`** — Pro in default mode, code-interpreter generates a downloadable file card.
3. **`claude_project_long_doc_review`** — upload a docx to a Claude project, get a structured review back as a markdown export.

Each ships with:
- A `.trace.json` from a reference green run, checked in.
- A regression test that replays the trace against a recorded HAR (`tests/workflows/`).

## 4. Mode model — fix the Deep Research definition gap

Extend each site adapter with explicit modes:

```yaml
chatgpt:
  modes:
    default:
      activation: []
      detection_signals: [{type: not_present, selector: '[data-testid="deep-research-badge"]'}]
      capabilities: [chat, code_interpreter, file_attach, model_switch]
    deep_research:
      activation: [{primitive: browser:click, args: {selector: '[data-testid="deep-research-toggle"]'}}]
      detection_signals: [{type: present, selector: '[data-testid="deep-research-badge"]'}]
      output_form: {type: iframe_sandbox, root_selector: 'iframe[src*="connector_openai_deep_research"]', report_container: '[data-testid="dr-report-card"]'}
      capabilities: [research_plan, citations, export_docx, export_pdf, export_markdown]
      tear_down: [{primitive: browser:click, args: {selector: '[data-testid="deep-research-toggle"]'}}]
    pro_normal:
      activation: [{primitive: browser:mode-switch, args: {model: pro, research_mode: off}}]
      capabilities: [code_interpreter_pptx, code_interpreter_docx, thinking_depth_adjust]
```

This gives workflows a stable contract: "I need ChatGPT in `deep_research` mode" → executor handles activation, detection, teardown.

## 5. Implementation phases

| Phase | Duration | Deliverables |
|---|---|---|
| **P1: primitives** | 1-2 days | `browser:download-iframe`, `browser:upload-and-confirm`, `browser:close`, `browser:audit`, `browser:mode-switch`, `browser:wait-for` — added to TS CLI surface + manifest + tests + consumer-contract bump to 1.1.0 |
| **P2: workflow engine** | 2-3 days | `workflow_registry.json` schema + JSON-schema validation, `workflow:run` CLI, step interpreter, recovery handler, trace writer |
| **P3: 3 reference workflows** | 3-5 days | The three workflows from §3.3, each with a green trace + a recorded-HAR regression test |
| **P4: hardening** | 2-3 days | Cloudflare-challenge detector, session-cookie-expiry handler, Playwright tracing for replay debugging, observability dashboard for workflow runs |

Total: ~2 weeks one-engineer-equivalent.

## 6. Open design questions (for codex critique)

1. **Default download path** — should `browser:download-iframe` replace `browser:download` for ChatGPT/Claude entirely (i.e., become the default when target site is an AI chat), or stay as an explicit alternative?
2. **Profile-per-task vs profile-per-service** — currently we have one Chrome profile per AI service. Should we adopt profile-per-task to make teardown trivial, accepting login-state setup cost per run?
3. **Where does the workflow engine live** — extend the TS CLI runner, or add a Python sidecar (`ip-literature-patent-research/.venv` already exists; the Round-3 winning script is Python+CDP)? Python is closer to Playwright's CDP surface in our codebase; TS is closer to the existing CLI primitives.
4. **Cloudflare / TLS-fingerprint handling** — what's the threshold above which we hand off to a human? Should we detect via `cf-chl-` cookie? Or by sentinel DOM text?
5. **Mode-detection vs mode-declaration** — should workflows declare required modes and the executor verifies + activates, or should each step do its own pre-check (more robust, more boilerplate)?
6. **Trace replay regression** — recorded HAR replay works for static sites; for LLM outputs the body is non-deterministic. What's the right contract? Pin selectors only, ignore response bodies?
7. **Backwards compatibility** — the existing consumer-contract is at 1.0.0. Adding primitives = minor bump (1.1.0). Renaming or removing any = major. The plan adds-only, but should we deprecate `browser:download` for AI sites in 1.1.0 or 2.0.0?
8. **Failure mode taxonomy** — current `INVALID_ARGS` / `INVALID_JSON` / etc. error codes were designed for static site automation. Should workflow steps get their own error taxonomy (e.g., `MODE_ACTIVATION_FAILED`, `ATTACHMENT_NOT_READY`, `IFRAME_NOT_FOUND`)?

## 7. What this plan deliberately does NOT include

- ChatGPT account / billing automation.
- Multi-account / multi-session workflows.
- Proxy rotation or anti-detection plumbing.
- Voice / image-generation modes (out of scope until base text/file flows are solid).
- A GUI / dashboard (CLI + trace JSON is enough for v1).

## 8. Acceptance criteria for v1

A new contributor, given only `workflow:run chatgpt_deep_research_to_docx --topic ... --output-dir ...` and a primed Chrome profile, can reproduce the round-3 deliverable WITHOUT writing any code. If they can, the gap is closed.
