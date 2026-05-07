# Managed CDP browser

The managed browser subsystem launches a visible Chrome/Edge process with a project-managed user data directory and a CDP debugging port.

## Commands

```bash
node dist/src/cli.js browser:launch --profile chatgpt --url https://chatgpt.com --json
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
node dist/src/cli.js browser:status --profile gemini --json
node dist/src/cli.js browser:pages --profile gemini --json
node dist/src/cli.js browser:close --profile gemini --mode disconnect --json
```

## Executable discovery

Discovery checks `WAH_BROWSER_EXECUTABLE`, common Windows Chrome/Edge install paths, macOS `.app` paths, and Linux PATH commands such as `google-chrome`, `chromium`, and `microsoft-edge`.

## Profile policy

Use one dedicated profile per service: `chatgpt`, `claude`, `gemini`, and `research-default`. Do not copy cookies between profiles. Do not import/export raw cookies. The user logs in manually in the visible browser.

## CDP lifecycle

`browser:launch` waits for `/json/version` and returns endpoint and page metadata. `browser:pages` reads `/json/list`. `browser:close --mode disconnect` disconnects automation clients while preserving profile state. `--mode close-process` attempts to terminate the package-launched process.
