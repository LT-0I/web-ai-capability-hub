# claude-send-thinking-ext blocker / residual risk

Status: patched but not green in allowed smoke window.

Evidence:
- First smoke: `claude-send-thinking-ext.json` failed with `CHROME_EXTENSION_NOT_CONNECTED` and vendor XPath message-channel close while selecting Adaptive thinking.
- Retry smoke after XPath->CSS selector patch: `claude-send-thinking-ext.retry1.json` failed with `CHROME_EXTENSION_NOT_CONNECTED` / hidden send selector on `https://claude.ai/new`.

Follow-up patch applied after retry budget:
- Workflow now forces `--model "Sonnet 4.6"` before `--thinking` to avoid forbidden Opus state.
- `selectClaudeModelWithExtension` now uses CSS `:has-text()` candidates instead of XPath.
- Live UI was reset from Opus to Sonnet 4.6; evidence in `claude-reset-sonnet-playwright.json`.

Recommended manual二验:
1. Run fresh build.
2. Run `node dist/src/cli.js workflow:run examples/workflows/claude-claude-send-thinking-ext.yaml --json` once in a clean Claude `/new` tab.
3. Verify no Opus model appears and `response_text` contains `391`.
