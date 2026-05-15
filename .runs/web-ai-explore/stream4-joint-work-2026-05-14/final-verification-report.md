---
title: Final Verification Report — 7-probe post-fix re-smoke
date: 2026-05-14
session: fv-smoke
operator: claude-sonnet-4-6 (general-purpose agent)
contract: consumer-contract-1.3.0
budget_used: ~22 min
---

# Final Verification Report

## Summary table

| Tool | Prior verdict (yellow-smoke) | New verdict | Change |
|---|---|---|---|
| 1. webai_chatgpt_upload_and_query | RED | RED | no change |
| 2. webai_chatgpt_generate_image | RED | RED | no change |
| 3. webai_claude_upload_and_query | RED | RED | no change |
| 4. webai_claude_generate_file | RED | GREEN | FIXED |
| 5. webai_gemini_upload_and_query | RED (not smoked) | RED | no change |
| 6. webai_gemini_generate_image | RED (not smoked) | RED | no change |
| 7. webai_gemini_canvas_to_docs | RED (not smoked) | HONEST-FAIL | fix working |

**Count: 1 GREEN / 5 RED / 1 HONEST-FAIL / 0 BLOCKED-LOGIN**
**Tab leak count: 0**
**Forbidden-field leaks: 0 (all 7 PASS)**
**Overall stability: RED (only 2/7 GREEN-or-honest-fail; threshold is ≥5/7)**

---

## Pre-conditions

- ChatGPT: profile `chatgpt`, port 9223 — `connected: true`, Chrome/148.0.7778.167
- Claude: profile `claude-9224`, port 9224 — `connected: true`, Chrome/148.0.7778.167
- Gemini: profile `gemini-9225`, port 9225 — `connected: true`, Chrome/148.0.7778.167
- Fixture: `/tmp/fv-fixtures/scores.csv` (name,score / ReAct,3 / JSON-schema,4 / constrained,5) — verified
- Artifacts dir: `.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts/` — pre-existing

---

## Tool 1 — webai_chatgpt_upload_and_query

**Command:**
```
node dist/src/cli.js webai:chatgpt:upload-and-query --profile chatgpt \
  --file /tmp/fv-fixtures/scores.csv \
  --prompt "Read this CSV and reply with ONLY the single highest-scoring name." \
  --response-timeout-ms 150000 --output-json
```

**JSON output (verbatim):**
```json
{
  "conversation_id": null,
  "attachment_names": ["scores.csv"],
  "response_text": "What are you working on?What are you working on?window.__oai_logHTML?window.__oai_logHTML():window.__oai_SSR_HTML=window.__oai_SSR_HTML||Date.now();requestAnimationFrame((function(){window.__oai_logTTI?window.__oai_logTTI():window.__oai_SSR_TTI=window.__oai_SSR_TTI||Date.now()}))Read this CSV and reply with ONLY the single highest-scoring name.Thinkingscores(1).csvSpreadsheet",
  "wait_ms": 2231,
  "completion_detected": true,
  "errorCode": null
}
```

**Verdict: RED**

**Reason:** `completion_detected` and `wait_ms` are now present (new schema fields from fix), confirming that part of Bug 1 landed. However `response_text` is still a garbled DOM dump from the ChatGPT homepage `main` element (inline JS, sidebar text, prompt echo) — not the AI reply. "constrained" absent. `conversation_id: null` confirms the tool navigated back to homepage before `responseText()` was captured. The `responseText()` read is still executing outside the active page scope / after context close.

**Forbidden-field leak:** PASS

---

## Tool 2 — webai_chatgpt_generate_image

**Command:**
```
node dist/src/cli.js webai:chatgpt:generate-image --profile chatgpt \
  --prompt "A single solid blue circle centered on white, minimal flat style." \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts \
  --output-json
```

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
  "expected_selector": "main img[alt], main img[src^=\"blob:\"], main img[src*=\"oaiusercontent\"], main img"
}
```

**Verdict: RED — error_code: ELEMENT_NOT_FOUND**

**Reason:** The fix updated the selector from `button[aria-label="Save"]` to a broader image selector (`main img[alt], main img[src^="blob:"]...`), but that selector is also not found at runtime. The codex fix changed the approach to look for a generated image element before triggering the download chain, but the selector is not matching the post-generation DOM. No image file landed in the artifacts dir (only pre-existing files). The fix is architecturally different from yellow-smoke but still fails at the same step.

**Forbidden-field leak:** PASS

---

## Tool 3 — webai_claude_upload_and_query

**Command:**
```
node dist/src/cli.js webai:claude:upload-and-query --profile claude-9224 \
  --file /tmp/fv-fixtures/scores.csv \
  --prompt "Read this CSV and reply with ONLY the single highest-scoring name." \
  --response-timeout-ms 150000 --output-json
```

**JSON output (verbatim):**
```json
{
  "files_uploaded_count": 1,
  "attachment_names": ["scores.csv"],
  "response_text": "Good evening, Bbscores.csvcsvRead this CSV and reply with ONLY the single highest-scoring name.Sonnet 4.6Adaptive",
  "wait_ms": 1264,
  "completion_detected": true,
  "errorCode": null
}
```

**Verdict: RED**

**Reason:** `completion_detected: true` and `wait_ms: 1264` are now present (new fields from fix). File uploaded (`files_uploaded_count: 1`). However `response_text` is still garbled — greeting ("Good evening, Bb"), file chip ("scores.csv csv"), prompt echo, model badge ("Sonnet 4.6 Adaptive") — no AI reply content, "constrained" absent. `wait_ms: 1264` is suspiciously fast (1.26 s), suggesting `completion_detected` fired immediately (false positive) before the assistant had time to respond, and `responseText()` captured the composer/greeting area rather than the assistant message. Same root cause as Tool 1: response capture still outside active page context or completion detection fires too early.

**Note:** No LOGIN_REQUIRED — Claude session active on claude-9224.

**Forbidden-field leak:** PASS

---

## Tool 4 — webai_claude_generate_file

**Command:**
```
node dist/src/cli.js webai:claude:generate-file --profile claude-9224 \
  --prompt "Output a CSV with header a,b and two data rows. Make it downloadable." \
  --expected-extension csv \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts \
  --output-json
```

**JSON output (verbatim):**
```json
{
  "path": "<home>/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts/data.csv",
  "sha256": "b9485148546419a0f6a85e8d708c923557c15d7f3c7d078ef1fa7f7c0f57d5a5",
  "size_bytes": 12,
  "download_filename": "data.csv",
  "artifact_name": "data.csv",
  "errorCode": null
}
```

**Verdict: GREEN**

**Reason:** `errorCode: null`, `download_filename: "data.csv"` (ends `.csv` ✓), `sha256` populated ✓, `size_bytes: 12` (non-empty ✓). File confirmed on disk as `CSV ASCII text` (12 B). The fix (passing captured conversation URL to `artifactClickRunner`) resolved the `/new` page-context race. Note: success path JSON does not include `evidence.pageUrl` field — the fix evidently removed it from the success schema, which is acceptable since the download succeeded. `path` uses `<home>` token (trace redaction ON — correct). **No `evidence.pageUrl` field in the success path; `errorCode: null` + file on disk = GREEN.**

**Forbidden-field leak:** PASS

---

## Tool 5 — webai_gemini_upload_and_query

**Command:**
```
node dist/src/cli.js webai:gemini:upload-and-query --profile gemini-9225 \
  --file /tmp/fv-fixtures/scores.csv \
  --prompt "Read this CSV and reply with ONLY the single highest-scoring name." \
  --response-timeout-ms 150000 --output-json
```

**JSON output (verbatim):**
```json
{
  "files_in_chip": ["scores.csv"],
  "chat_url": "https://gemini.google.com/app?hl=en",
  "response_text": " Gemini PRONew chat My stuff  Notebooks  New notebook  Gems  Chats  Find Highest Scoring Name  Generate a simple solid green square image.  Bar Chart Generation: LLM Tool Comparison  A Simple Affirmation  Reading CSV Column Names  Simple Confirmation Response  Model Name and Simple Math  AI Automation Reliability: Challenges and Solutions  Red Ball Bounces on White Floor  File Summary and Paragraph Count  SVG: Yellow Circle on Blue Square  Model Comparison Research Plan  Web AI Automation Stability Brief  Creating Downloadable Capital Cities CSV  Conversation with Gemini  Hi Shark  Where should we start?  🖼️ Create image  🎸 Create music  Write anything  Help me learn  Boost my day  Create video A simple solid green square, flat color, no text.ToolsFast",
  "wait_ms": 44672,
  "completion_detected": true,
  "errorCode": null
}
```

**Verdict: RED**

**Reason:** `completion_detected: true` and `wait_ms: 44672` are new fields (fix landed). File chip present (`files_in_chip: ["scores.csv"]`). However `response_text` is the Gemini sidebar/chat history DOM (chat history list, navigation items, homepage prompts) — not the AI reply. "constrained" absent. `chat_url` is still `gemini.google.com/app?hl=en` (homepage URL, not a conversation URL), confirming the tool either (a) didn't navigate to a conversation after upload, or (b) captured `responseText` from the wrong page context. Same root cause as Tools 1 and 3: response capture still reads the wrong page element after context closes.

**Forbidden-field leak:** PASS

---

## Tool 6 — webai_gemini_generate_image

**Command:**
```
node dist/src/cli.js webai:gemini:generate-image --profile gemini-9225 \
  --prompt "A simple solid green square, flat color, no text." \
  --download-dir /home/l1u/workspace/noeticmind/web-ai-capability-hub/.runs/web-ai-explore/stream4-joint-work-2026-05-14/artifacts \
  --output-json
```

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
  "expected_selector": "button[data-test-id=\"more-menu-button\"]"
}
```

**Verdict: RED — error_code: ELEMENT_NOT_FOUND**

**Reason:** The fix correctly wired the two-step `more-menu-button` → `image-download-button` path from the Gemini DOM evidence (Bug C fix). The `expected_selector` confirms the new selector is active. However `button[data-test-id="more-menu-button"]` was not found at runtime. Likely causes: (a) image generation did not complete before the selector search ran, (b) the generated image response wasn't in view / on a conversation page when the selector was tried, or (c) the tool didn't wait for the image to render before looking for the more-menu. No image file in artifacts. The selector itself is correct per DOM evidence; the timing/sequencing is still broken.

**Forbidden-field leak:** PASS

---

## Tool 7 — webai_gemini_canvas_to_docs

**Command:**
```
node dist/src/cli.js webai:gemini:canvas-to-docs --profile gemini-9225 \
  --prompt "Write a 60-word overview of code review best practices." \
  --title "fv-canvas" --output-json
```

**JSON output (verbatim):**
```json
{
  "docs_url": "https://gemini.google.com/app/1e27abe175683654?hl=en",
  "docs_doc_id": null,
  "title": "fv-canvas",
  "errorCode": "ARTIFACT_VERIFICATION_FAILED",
  "error_code": "ARTIFACT_VERIFICATION_FAILED"
}
```

**Verdict: HONEST-FAIL (fix working)**

**Reason:** The tool now surfaces `ARTIFACT_VERIFICATION_FAILED` instead of silently returning `errorCode: null` with a wrong URL (yellow-smoke behavior). `docs_url` is a Gemini conversation URL (not a `docs.google.com/document/d/` URL), and `docs_doc_id: null`. The no-silent-fallback fix is working correctly — the tool correctly detects that no verified Google Docs URL was obtained and fails with the contract error code. This is the expected behavior per spec: "If it returns ARTIFACT_VERIFICATION_FAILED, that's CORRECT-FAIL (the no-silent-fallback fix working)."

**Forbidden-field leak:** PASS

---

## Forbidden-field summary

All 7 JSON outputs passed forbidden-field check. None contain: `cdpEndpoint`, `webSocketDebuggerUrl`, `profileDir`, `cookies`, `tokens`, `dom`, `html`, `screenshot`.

---

## Tab tear-down

| Tab ID | Profile | Freed |
|---|---|---|
| fv-cg-up | chatgpt | true |
| fv-cg-img | chatgpt | true |
| fv-cl-up | claude-9224 | true |
| fv-cl-gf | claude-9224 | true |
| fv-gm-up | gemini-9225 | true |
| fv-gm-img | gemini-9225 | true |
| fv-gm-canvas | gemini-9225 | true |

Post-teardown `browser:tab:list` on all 3 profiles: **zero fv- tabs remaining.** Tab leak count: **0**.

---

## Root cause summary for next dispatch

### upload-and-query (Tools 1, 3, 5) — shared bug PERSISTS

The codex fix added `completion_detected` and `wait_ms` to the schema (confirmed in output) but did not fix the core issue: `responseText()` is still reading the wrong page after the managed context closes. Evidence:
- Tool 1 (ChatGPT): `wait_ms: 2231` — fired after only 2.2 s, too fast for a real Thinking response; captured homepage DOM
- Tool 3 (Claude): `wait_ms: 1264` — fired after only 1.26 s, impossibly fast; captured composer area
- Tool 5 (Gemini): `wait_ms: 44672` — more realistic wait (44 s) but still captured sidebar/history DOM; `chat_url` still homepage

The fix must move `responseText()` capture **inside** `withManagedPage` before context close, AND anchor to the conversation URL (not the homepage). The `completion_detected` signal is firing but the subsequent text-read is still on a stale/wrong page reference.

### generate-image Tools 2 (ChatGPT) and 6 (Gemini) — different bugs, both PERSIST

**ChatGPT (Tool 2):** Selector updated from `button[aria-label="Save"]` to broader `main img[...]` pattern, still not found. Fix needs to target the actual post-generation image download UI more precisely — inspect live DOM after generation completes.

**Gemini (Tool 6):** Selector `button[data-test-id="more-menu-button"]` is correct per DOM evidence but not found at runtime. Likely a timing issue: the tool tries to click the more-menu before image generation is complete or before the response is scrolled into view. Fix: add explicit wait for image render completion (e.g., wait for `img[alt="AI generated"]` to appear) before attempting the more-menu click.

### generate-file Tool 4 (Claude) — FIXED

Conversation URL capture + pass to `artifactClickRunner` resolved the `/new` page-context race. No further action needed.

### canvas-to-docs Tool 7 (Gemini) — HONEST-FAIL (fix working correctly)

The no-silent-fallback fix is confirmed working. The underlying canvas-to-docs export flow itself may be broken (Gemini may not be opening a Google Doc from the Canvas feature in the current session state), but the tool now correctly refuses to return a fake success. This is the correct behavior per contract.

---

## Overall stability assessment

**RED** — 2/7 GREEN-or-honest-fail (Tool 4 GREEN + Tool 7 HONEST-FAIL). Threshold is ≥5/7. Three upload-and-query tools (1, 3, 5) share a persistent `responseText()` scope bug that the fix did not fully address. Two generate-image tools (2, 6) remain broken with different root causes. Zero garbled-DOM regressions introduced (the garble was pre-existing, not new).
