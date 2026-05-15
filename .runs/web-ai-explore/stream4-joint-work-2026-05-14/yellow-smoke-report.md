---
title: Yellow-smoke report — 4 NOT-SMOKED MCP tools
date: 2026-05-15
session: ys-smoke
operator: claude-sonnet-4-6 (general-purpose agent)
contract: consumer-contract-1.3.0
---

# Yellow-smoke report

## Summary

| Tool | Verdict | error_code |
|---|---|---|
| webai_chatgpt_upload_and_query | RED | response_text DOM-garble (no `completion_detected` in schema; "constrained" absent) |
| webai_chatgpt_generate_image | RED | ELEMENT_NOT_FOUND (`button[aria-label="Save"]`) |
| webai_claude_upload_and_query | RED | response_text DOM-garble (no `completion_detected` in schema; "constrained" absent) |
| webai_claude_generate_file | RED | ELEMENT_NOT_FOUND (`button[aria-label^="Download"]` on `/new`) |

**0 GREEN / 4 RED / 0 BLOCKED-LOGIN**

Tab leak count: 0 (all 4 ys- tabs freed and verified)

---

## Pre-conditions

- ChatGPT: profile `chatgpt`, port 9223 — `connected: true`
- Claude: profile `claude-9224`, port 9224 — `connected: true`
- Models confirmed from Phase 1 evidence: ChatGPT on Thinking, Claude on Sonnet 4.6 Adaptive (cheap-model policy met)
- Fixture: `/tmp/ys-fixtures/scores.csv` (name,score / ReAct,3 / JSON-schema,4 / constrained,5)
- Output dir: `.runs/web-ai-explore/stream4-joint-work-2026-05-14/` created

---

## Tool 1 — webai_chatgpt_upload_and_query

**Command:**
```
node dist/src/cli.js webai:chatgpt:upload-and-query \
  --profile chatgpt \
  --file /tmp/ys-fixtures/scores.csv \
  --prompt "Read this CSV and reply with ONLY the highest-scoring name." \
  --response-timeout-ms 120000 \
  --output-json
```

**JSON output (verbatim):**
```json
{
  "conversation_id": null,
  "attachment_names": ["scores.csv"],
  "response_text": "What's on the agenda today?What's on the agenda today?window.__oai_logHTML?window.__oai_logHTML():window.__oai_SSR_HTML=window.__oai_SSR_HTML||Date.now();requestAnimationFrame((function(){window.__oai_logTTI?window.__oai_logTTI():window.__oai_SSR_TTI=window.__oai_SSR_TTI||Date.now()}))Read this CSV and reply with ONLY the highest-scoring name.Thinkingscores.csvSpreadsheet",
  "errorCode": null
}
```

**Verdict: RED**

**Reason:** `errorCode` is null and `attachment_names` shows file was attached, but `response_text` is a garbled DOM dump from the ChatGPT homepage `main` element (includes inline JS, sidebar text, prompt echo) — not the AI's reply. The word "constrained" is absent. Root cause: `uploadAndQueryOnPage` schema omits `completion_detected`; `responseText()` falls back to reading `[data-message-author-role="assistant"], main` via `.last()`, but after the tool completed the tab navigated back to `https://chatgpt.com/` (confirmed via `browser:read` post-run showing homepage `visibleText`). The `.last()` locator matched the `main` element of the homepage, not the conversation. `conversation_id: null` confirms no conversation URL was captured.

**Forbidden-field leak:** PASS (no cdpEndpoint, webSocketDebuggerUrl, profileDir, cookies, tokens, dom, html, screenshot)

---

## Tool 2 — webai_chatgpt_generate_image

**Command:**
```
node dist/src/cli.js webai:chatgpt:generate-image \
  --profile chatgpt \
  --prompt "A single solid blue circle on white background, minimal." \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts \
  --output-json
```

Note: First invocation used relative path and returned `INVALID_ARGS: download_dir must be an absolute path` — correct guard behavior. Re-run used absolute path.

**JSON output (verbatim):**
```json
{
  "path": "",
  "sha256": "",
  "size_bytes": 0,
  "dimensions": null,
  "download_filename": "",
  "errorCode": "ELEMENT_NOT_FOUND",
  "error_code": "ELEMENT_NOT_FOUND",
  "expected_selector": "button[aria-label=\"Save\"]"
}
```

**Verdict: RED — error_code: ELEMENT_NOT_FOUND**

**Reason:** The tool attempted image generation and then looked for `button[aria-label="Save"]` to trigger the download. This selector was not found. No image file landed in the artifacts directory (pre-existing files only: `llm-tool-use-comparison-brief.docx`, `llm-tool-use-scores.csv`, `rerun-smoke.docx`). Root cause: ChatGPT's image-download UI does not expose a `button[aria-label="Save"]` at this point in the DOM — the download surface may have changed (similar to the Gemini image download DOM drift in Bug C). Phase 1 evidence showed image generation succeeded via `generate/image/note.md` (919 KB PNG), but that run used `browser:artifact-click` with the behavior-chip; the generate-image tool uses a different download trigger path that is now broken.

**Forbidden-field leak:** PASS (no forbidden fields)

---

## Tool 3 — webai_claude_upload_and_query

**Command:**
```
node dist/src/cli.js webai:claude:upload-and-query \
  --profile claude-9224 \
  --file /tmp/ys-fixtures/scores.csv \
  --prompt "Read this CSV and reply with ONLY the highest-scoring name." \
  --response-timeout-ms 120000 \
  --output-json
```

**JSON output (verbatim):**
```json
{
  "files_uploaded_count": 1,
  "attachment_names": ["scores.csv"],
  "response_text": "Good evening, Bbscores.csvcsvRead this CSV and reply with ONLY the highest-scoring name.Sonnet 4.6Adaptive",
  "errorCode": null
}
```

**Verdict: RED**

**Reason:** `errorCode` is null and `files_uploaded_count: 1` confirms the file was uploaded. However `response_text` is garbled — it contains the greeting ("Good evening, Bb"), the file chip ("scores.csv csv"), the prompt echo, and the model badge ("Sonnet 4.6 Adaptive") — but NO AI reply content, and "constrained" is absent. Root cause: same structural issue as ChatGPT — `responseText()` reads `[data-message-author-role="assistant"], main` via `.last()`. On Claude, after the tool completed, the tab was at `https://claude.ai/new` (confirmed via `browser:read`), meaning either the tab reset between completion-detection and `responseText()` read, or `completion_detected` fired too early (before the assistant's text bubble was rendered), so `.last()` captured the composer/greeting area instead of the assistant message. No `completion_detected` field in the returned schema confirms the tool does not surface this signal to the caller.

Note: No LOGIN_REQUIRED error — Claude was logged in correctly on `claude-9224`.

**Forbidden-field leak:** PASS (no forbidden fields)

---

## Tool 4 — webai_claude_generate_file

**Command:**
```
node dist/src/cli.js webai:claude:generate-file \
  --profile claude-9224 \
  --prompt "Write a 40-word note titled ys-smoke and output it as a downloadable CSV with columns a,b." \
  --expected-extension csv \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts \
  --output-json
```

Note: First invocation used relative path — `INVALID_ARGS: download_dir must be an absolute path` (correct guard). Re-run used absolute path.

**JSON output (verbatim):**
```json
{
  "ok": false,
  "errorCode": "ELEMENT_NOT_FOUND",
  "error": "No element matched --button-selector",
  "evidence": {
    "selector": "button[aria-label^=\"Download\"]",
    "pageUrl": "https://claude.ai/new",
    "frameCount": 4,
    "triedFrames": [
      {"url": "https://claude.ai/new", "hadSelectorMatch": false},
      {"url": "about:blank", "hadSelectorMatch": false},
      {"url": "https://a.claude.ai/isolated-segment.html?v=49e8070c61", "hadSelectorMatch": false},
      {"url": "about:blank", "hadSelectorMatch": false}
    ]
  }
}
```

**Verdict: RED — error_code: ELEMENT_NOT_FOUND**

**Reason:** `pageUrl` in the evidence is `https://claude.ai/new` — the tool's `artifactClickRunner` looked for the Download button on the `/new` composer page, not on a conversation page. This means `sendPromptOnPage` either (a) sent the prompt on a page that immediately navigated away or (b) the `withManagedPage` resolved to the ys-cl-gf tab which was on `/new` and the tool lost the conversation URL between the `sendPromptOnPage` and `artifactClickRunner` calls. The `generateFileOnPage` function calls `sendPromptOnPage` (which internally uses `withManagedPage`) and then separately calls `artifactClickRunner` with `tabUrlContains: "claude.ai"` — but after `sendPromptOnPage` returns, the managed page context is closed and `artifactClickRunner` picks up whatever Claude tab matches `claude.ai`, which may be `/new` rather than the fresh conversation. No CSV file on disk.

**Forbidden-field leak:** PASS (no forbidden fields)

---

## Forbidden-field summary

All 4 JSON outputs passed forbidden-field check. None contain: `cdpEndpoint`, `webSocketDebuggerUrl`, `profileDir`, `cookies`, `tokens`, `dom`, `html`, `screenshot`.

---

## Tab tear-down

| Tab ID | Profile | freed |
|---|---|---|
| ys-cg-up | chatgpt | true |
| ys-cg-img | chatgpt | true |
| ys-cl-up | claude-9224 | true |
| ys-cl-gf | claude-9224 | true |

Post-teardown `browser:tab:list` on both profiles: zero `ys-` tabs remaining. **Tab leak count: 0.**

---

## Root cause summary for next dispatch

### Upload-and-query (tools 1 + 3) — shared bug

`responseText()` reads the entire `main` or last `[data-message-author-role="assistant"]` element **after** the managed page context has closed. By that time the tab has navigated back to the homepage/new-chat page. Fix: capture `responseText` **inside** `withManagedPage` before the context closes, or retain the page reference through conversation URL stabilization. Also: expose `completion_detected` in the returned schema so callers can gate on it.

### generate-image (tool 2) — selector drift

`button[aria-label="Save"]` not found on the ChatGPT image generation result page. Likely the same class of DOM drift as Gemini Bug C. Next step: trigger a ChatGPT image generation manually in the live browser, inspect the post-render download UI, and update the `expectedSelector` constant in `generateImageOnPage`.

### generate-file (tool 4) — page-context race

`artifactClickRunner` is called outside `withManagedPage` and resolves to the wrong tab (the `/new` composer rather than the conversation with the generated artifact). Fix: either (a) run `artifactClickRunner` inside the same `withManagedPage` context, or (b) capture the conversation URL from `sendPromptOnPage` and pass it as `tabUrlContains` to `artifactClickRunner`.
