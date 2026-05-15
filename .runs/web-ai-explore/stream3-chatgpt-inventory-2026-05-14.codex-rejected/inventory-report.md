---
service: chatgpt
run_date: 2026-05-14
model_used: 5.5 Instant Thinking
chrome_version: Chrome/148.0.7778.167
total_checkpoints: 18
pass_count: 16
not_reachable_count: 1
inconclusive_count: 1
---

## Pre-conditions

- Chrome CDP `http://127.0.0.1:9223/json/version` returned a `Browser` field: `Chrome/148.0.7778.167` (`.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/chrome-version.json`).
- `node dist/src/cli.js browser:status --profile chatgpt --json` returned `connected: true` (`setup-health.txt`).
- Build artifact `dist/src/cli.js` exists (`setup-health.txt`).
- The header account identifier was captured to `evidence/user-identifier.txt` and is intentionally not quoted in this report.

## Part A — 9 canonical checkpoints

| id | status | evidence path |
|---|---|---|
| A1 header-identify | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/header-identify/stdout.json`; identifier saved at `evidence/user-identifier.txt` |
| A2 model-selector-cheap | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/model-selector-cheap/stdout.json`; selected `5.5 Instant Thinking` |
| A3 new-conversation | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/new-conversation/stdout.json`; resulting URL `https://chatgpt.com/` |
| A4 send-test-message | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/send-test-message/stdout.json` |
| A5 capture-response | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/evidence/response.txt` |
| A6 upload-text-file | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/upload-text-file/stdout.json`; DOM acknowledged `smoke-text.txt` as a document attachment |
| A7 request-downloadable-artifact | INCONCLUSIVE | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/request-downloadable-artifact/stdout.json`; UI exposed `Download hello_flask_app.py`, but `browser:artifact-click` timed out without a saved download |
| A8 share-export-menu | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/share-export-menu/stdout.json`; share dialog listed Copy link plus X/LinkedIn/Reddit |
| A9 inventory-skipped | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/inventory-skipped/stdout.json` |

## Part B — catalog gap verifications

| id | catalog_row_id | status | evidence path |
|---|---|---|---|
| B1 settings-custom-instructions | `settings-custom-instructions` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-settings-custom-instructions/stdout.json` |
| B2 settings-personality-presets | `settings-personality-presets` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-settings-personality-presets/stdout.json` |
| B3 memory-reference-chat-history | `memory-reference-chat-history` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-memory-reference-chat-history/stdout.json` |
| B4 pulse-toggle | `pulse-toggle` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-pulse-toggle/stdout.json` |
| B5 settings-improve-model-toggle | `settings-improve-model-toggle` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-settings-improve-model-toggle/stdout.json` |
| B6 memory-manage-memories | `memory-manage-memories` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-memory-manage-memories/stdout.json` |
| B7 memory-search-sort | `memory-search-sort` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-memory-search-sort/stdout.json` |
| B8 voice-start | `voice-start` | PASS | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-voice-start/stdout.json`; observed selector only, not clicked |
| B9 agent-entry-surface | `agent-visual-browser` | NOT-REACHABLE | `.runs/web-ai-explore/stream3-chatgpt-inventory-2026-05-14/b-agent-entry-surface/stdout.json`; agent entry visible, visual-browser task UI not launched |

## Catalog feedback

- PASS `settings-custom-instructions`: current UI path is Profile → Personalization; custom instruction fields are visible in the Personalization panel.
- PASS `settings-personality-presets`: personality/style controls are visible in Personalization as style/tone and trait presets.
- PASS `memory-reference-chat-history`: both saved-memory and chat-history reference controls are visible in Personalization.
- PASS `pulse-toggle`: Pulse controls are visible in Personalization for suggestions/new chats.
- PASS `settings-improve-model-toggle`: Data Controls exposes the improve-model setting and showed it off for this account.
- PASS `memory-manage-memories`: Manage memories is reachable; this account showed no saved memories.
- PASS `memory-search-sort`: Manage memories exposes a memory search input and sort button.
- PASS `voice-start`: desktop web composer exposes dictation and voice-launch buttons; microphone interaction remains out of scope.
- NOT-REACHABLE `agent-visual-browser`: suggested catalog edit: row `agent-visual-browser`: keep `automation_notes` as `unknown` or change to `entry-observed-only`; visual-browser internals require launching an autonomous agent task, which this lane skipped.
- A7 note: the downloadable-artifact UI appeared, but download capture did not complete; keep any automation note for generated file downloads as `MODE_UNCERTAIN` until another lane confirms the click/download event path.

## Selector drift

- Catalog row `model-gpt-55-thinking` web_ui_path says: "Model picker → Thinking, or tools menu for some tiers." Observed UI: composer pill labeled `进阶专业`, then a menu with `Thinking` and `Pro • 进阶`; selecting `Thinking` left the composer pill as `Thinking`.
- A8 expected export options to check included: "Copy link, Export as DOCX, Export as PDF, Export as Markdown." Observed share dialog listed `复制链接` plus social targets `X`, `LinkedIn`, and `Reddit`; DOCX/PDF/Markdown export options were not present in that dialog.
- Catalog row `pulse-toggle` web_ui_path says: "Settings → Personalization → Reference memories in Suggestions off, or Show Pulse in new chats off." Observed UI was localized Chinese text in the Personalization panel for Pulse suggestions/new-chat display.

## Handoff for next lane (Claude)

- No login page was encountered.
- No billing, subscription, API-key, or API-settings route was visited.
- No public publishing button was clicked.
- No audio/microphone surface was launched; only selectors were observed.
- A generated-file download button appeared, but no saved download was captured and `browser:downloads` showed no new in-flight download from this attempt.
- Before handoff, I pressed Escape twice, freed the temporary tab `stream3-chatgpt-inventory`, and saved `final-pages.json`; pre-existing ChatGPT tabs remain and no new logged-out tab was left open.
