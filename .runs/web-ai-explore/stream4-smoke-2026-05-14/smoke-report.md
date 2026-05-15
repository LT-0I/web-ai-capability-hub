# Phase 2d Live Smoke Report — v1.3.0 MCP Surface

**Timestamp:** 2026-05-14T17:34:12Z  
**Contract version:** consumer-contract-1.3.0  
**Git HEAD:** 5065576  

---

## Summary

| Lane | Verdict | Forbidden-field leak |
|------|---------|----------------------|
| ChatGPT | INCONCLUSIVE | PASS |
| Claude | INCONCLUSIVE | PASS |
| Gemini | INCONCLUSIVE | PASS |
| `webai:task-status` | PASS | PASS |

**PASS lanes: 1 / 4**  
**Tabs allocated by this run: 3 (smoke-chatgpt, smoke-claude, smoke-gemini) — all freed.**  
**Tabs leaked: 0**

---

## Profile registry at run start

| Profile | Port | `lastStatus` | Action taken |
|---------|------|-------------|--------------|
| chatgpt | 9223 | connected | None needed |
| claude | 9222 | disconnected | `browser:start --profile claude` run; reconnected |
| gemini-9225 | 9225 | connected | None needed |

---

## Lane 1 — ChatGPT

**Profile:** `chatgpt` (CDP port 9223)  
**Tab allocated:** `smoke-chatgpt` → pageId `3E314118562A97EA4421A0174820146E` (https://chatgpt.com/)  
**Tab freed:** Yes (`freed: true`)

**Model check:**  
The `response_text` ends with `"深度研究应用站点ProChatGPT 也可能会犯错"` — the UI rendered "Pro" tier text and the page landed on a prior Deep Research conversation (`/c/6a04a213-5648-83e8-b9d0-6134aef56831`). `model_used` field is `null` (the CLI does not independently read the model selector). Model tier cannot be confirmed as cheap — the page context suggests a Pro/Deep-Research UI was active. Per constraint, this is an **unconfirmed model** situation.

**Command run:**
```
node dist/src/cli.js webai:chatgpt:send-prompt \
  --profile chatgpt \
  --prompt "In one English sentence, name your model and say what 2 plus 2 equals." \
  --output-json
```

**JSON response (verbatim):**
```json
{
  "response_text": "你说：master_records.bib文件...（prior deep-research conversation history）...你说：In one English sentence, name your model and say what 2 plus 2 equals.展开收起ChatGPT 说：window.__oai_logHTML?...深度研究应用站点ProChatGPT 也可能会犯错。请核查重要信息。查看 你的隐私选择。⁠",
  "elapsed_ms": 3968,
  "errorCode": null,
  "conversation_id": "6a04a213-5648-83e8-b9d0-6134aef56831",
  "model_used": null,
  "chat_url": "https://chatgpt.com/c/<conversation-id>"
}
```

**Analysis:**
- Exit code: 0 (command succeeded at CLI level)
- The prompt WAS sent (visible at end of `response_text`: `"你说：In one English sentence..."`)
- ChatGPT's actual reply was NOT captured — `activeManagedPage` landed on an existing Deep Research conversation; the 3-second post-send wait expired before the model responded; `response_text` is stale page content, not the answer to "2+2"
- `model_used: null` — model selector not read programmatically; "Pro" tier text visible in page content
- `conversation_id` is a pre-existing conversation, not a fresh one

**Forbidden-field leak check:** PASS — no `cdpEndpoint`, `webSocketDebuggerUrl`, `profileDir`, `cookies`, `tokens`, `dom`, `html`, `screenshot` in output.

**Verdict: INCONCLUSIVE**  
Reason: The response captured is stale conversation history, not an answer to the smoke prompt. The model could not be confirmed as a Thinking-class (non-Pro) model — the page context showed "Pro" UI indicators. The send succeeded but response capture missed the reply window (3s wait insufficient for Deep Research page).

---

## Lane 2 — Claude

**Profile:** `claude` (CDP port 9222, reconnected from disconnected)  
**Tab allocated:** `smoke-claude` → pageId `C6F1FCF62F1345246446A14CBFA0B7E8` (https://claude.ai/new — redirected to login)  
**Tab freed:** Yes (`freed: true`)

**Model check:** N/A — profile session was logged out.

**Command run:**
```
node dist/src/cli.js webai:claude:send-prompt \
  --profile claude \
  --prompt "In one English sentence, name your model and say what 2 plus 2 equals." \
  --output-json
```

**JSON response (verbatim):**
```json
{"ok":false,"error":"locator.waitFor: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator('[contenteditable=\"true\"], #prompt-textarea').first() to be visible\n"}
```

**Analysis:**
- Exit code: non-zero (error path)
- The `claude` profile session was logged out — the tab redirected to `https://claude.ai/login?from=logout`
- The contenteditable prompt box is not present on the login page, hence timeout
- The error is a raw Playwright exception, not a structured `ConsumerErrorCode` — expected code would be `LOGIN_REQUIRED` but the CLI surfaced the raw timeout instead
- `{"ok":false}` shape is present but `error_code` field is absent

**Forbidden-field leak check:** PASS — no forbidden fields in output.

**Verdict: INCONCLUSIVE**  
Reason: Claude session is logged out (`LOGIN_REQUIRED` condition). The command did not return a structured `LOGIN_REQUIRED` error code — it surfaces a raw Playwright timeout. This is a secondary bug: the CLI should detect the login page and return `{"ok":false,"error_code":"LOGIN_REQUIRED"}` rather than a raw locator timeout.

---

## Lane 3 — Gemini

**Profile:** `gemini-9225` (CDP port 9225)  
**Tab allocated:** `smoke-gemini` → pageId `A603561D82EC210E32F5DA491B597DE1` (https://gemini.google.com/)  
**Tab freed:** Yes (`freed: true`)

**Model check:**  
The `response_text` ends with `"ToolsPro Gemini is AI and can make mistakes."` — "Pro" is visible in the page text adjacent to the "Tools" menu. This indicates Gemini Pro (not Flash/default) may be active. `model_used: null` (not read programmatically). Per constraint, model cannot be confirmed as cheap.

**Command run:**
```
node dist/src/cli.js webai:gemini:send-prompt \
  --profile gemini-9225 \
  --prompt "In one English sentence, name your model and say what 2 plus 2 equals." \
  --output-json
```

**JSON response (verbatim):**
```json
{
  "response_text": " Gemini PRO New chat  My stuff  Notebooks  New notebook  Gems  Chats  Red Ball Bounces on White Floor  ...  You said  In one English sentence, name your model and say what 2 plus 2 equals. ToolsPro Gemini is AI and can make mistakes. ",
  "elapsed_ms": 3662,
  "errorCode": null,
  "model_used": null,
  "chat_url": "https://gemini.google.com/app"
}
```

**Analysis:**
- Exit code: 0 (command succeeded at CLI level)
- The prompt WAS sent (visible: `"You said  In one English sentence, name your model and say what 2 plus 2 equals."`)
- Gemini's actual reply was NOT captured — the `response_text` is the sidebar + header content, not the model's answer to "2+2". The 3-second post-send wait expired before Gemini responded; `page.locator('main, [data-message-author-role="assistant"]').last()` did not find Gemini's reply selector in time
- `"Gemini PRO"` appears in header text — model is likely Gemini Pro, not Flash/default, which violates the cheap-model constraint
- `chat_url` stayed at `https://gemini.google.com/app` (did not navigate to a new conversation URL)

**Forbidden-field leak check:** PASS — no forbidden fields in output.

**Verdict: INCONCLUSIVE**  
Reason: The response captured is sidebar/header content, not an answer to the smoke prompt. Additionally, "Gemini PRO" is visible in page text, indicating the active model may violate the cheap-model constraint (should be Flash/default, not Pro). Per constraint, this triggers a MODEL_SELECTION_DRIFT concern. Response capture timing (3s) is insufficient for Gemini's generation latency.

---

## `webai:task-status` — Error Code Propagation

**Command run:**
```
node dist/src/cli.js webai:task-status --task-id invalid_does_not_exist_xyz --output-json
```

**JSON response (verbatim):**
```json
{
  "status": "failed",
  "errorCode": "INVALID_ARGS"
}
```

**Analysis:**
- Exit code: 0 (non-zero not used here; the error is embedded in the JSON payload)
- `errorCode: "INVALID_ARGS"` is a valid code from `src/consumer/errorCodes.ts`
- The command correctly rejects an unknown task ID with a stable, typed error code
- No forbidden fields in output

**Forbidden-field leak check:** PASS

**Verdict: PASS**  
Reason: Unknown task ID returns `INVALID_ARGS` as a stable typed error code from the consumer contract taxonomy. No silent success, no exception leak.

---

## Bugs / Issues Found

### Bug 1 — Response capture timing too short (ChatGPT, Gemini)
`sendPromptOnPage` waits only `Math.min(3000, timeout)` ms (hardcoded 3s) before reading the response. For both ChatGPT (Deep Research page) and Gemini, 3s is insufficient — the page renders stale content or sidebar. The response selector `'main, [data-message-author-role="assistant"]'` did not find the reply in time.

### Bug 2 — Page reuse lands on stale conversation (ChatGPT)
`activeManagedPage` found the existing Deep Research conversation page (`/c/6a04a213-...`) which matched `https://chatgpt.com/` as the "best usable page". It did not navigate to a clean new chat. The prompt was injected into a pre-existing conversation context. For smoke testing, a fresh chat URL (e.g. `https://chatgpt.com/`) with an actual navigation to the home/new page would be safer.

### Bug 3 — Claude LOGIN_REQUIRED not surfaced as structured error code
When the claude.ai session is logged out, the command times out with a raw Playwright `locator.waitFor` exception rather than returning `{"ok":false,"error_code":"LOGIN_REQUIRED"}`. The login page should be detected (e.g. URL contains `/login`) and mapped to the `LOGIN_REQUIRED` error code.

### Bug 4 — Gemini model appears to be Pro, not Flash/default (MODEL_SELECTION_DRIFT concern)
The Gemini UI shows "Gemini PRO" in the header. Per cheap-model constraint, Gemini should be on Flash or default tier. The CLI does not verify or enforce model selection before sending. If Pro is confirmed, this violates the cheap-model rule and the lane should have been aborted with `MODEL_SELECTION_DRIFT`.

### Bug 5 — `chat_url` field redacts conversation ID for ChatGPT
`chat_url` outputs `https://chatgpt.com/c/<conversation-id>` (the conversation ID is replaced with a literal `<conversation-id>` placeholder string). This appears to be a redaction behavior — but it makes the `chat_url` field unusable. This may be intentional safe-output redaction or a string-replacement bug.

---

## Bottom summary

- **PASS lanes:** 1 (`webai:task-status`)
- **INCONCLUSIVE lanes:** 3 (ChatGPT, Claude, Gemini)
- **FAIL lanes:** 0
- **Tabs allocated:** 3 (smoke-chatgpt, smoke-claude, smoke-gemini)
- **Tabs leaked:** 0 — all freed, verified with `browser:tab:list`
- **Forbidden field leaks:** None across all 4 commands
- **Auth issues:** Claude profile session is logged out; must be re-authenticated before Claude lane can pass
- **Top blocker:** Response capture window (3s) is too short — ChatGPT and Gemini both sent the prompt but the reply wasn't captured before the read. Secondary blockers: stale page reuse (ChatGPT), login wall (Claude), unconfirmed Pro model (Gemini).
- **Model constraint status:** ChatGPT model unconfirmed (Pro UI indicators visible); Gemini shows "PRO" in header (likely violates cheap-model constraint); Claude not reached.
