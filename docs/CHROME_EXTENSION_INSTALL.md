# Chrome Extension Native Host Install

## 1. Prerequisites

- Google Chrome or Chromium is installed for the local user.
- `pnpm` is available for building the vendored extension.
- The vendored extension has already been built:
  ```bash
  pnpm -C vendor/mcp-chrome/app/chrome-extension build
  ```
- The native server file exists at:
  `vendor/mcp-chrome/app/native-server/dist/native-messaging-host.js`
- The extension must have a pinned ID. If the built extension manifest does not
  contain an ID/key, pass `--extension-id <id>` to the installer.

## 2. Install flow

Build this package first so the operator script can load the compiled installer:

```bash
npm run build
node scripts/extension-host.js install --extension-id <chrome-extension-id>
```

Useful flags:

```bash
node scripts/extension-host.js install \
  --chrome-profile-dir "$HOME/.config/google-chrome" \
  --host-name com.chromemcp.nativehost \
  --native-server-path "$PWD/vendor/mcp-chrome/app/native-server/dist/native-messaging-host.js" \
  --extension-id <chrome-extension-id>
```

Dry run:

```bash
node scripts/extension-host.js install --dry-run --extension-id <chrome-extension-id>
```

If the script cannot find Chrome's profile dir, manually create only the native
host manifest under an existing Chrome profile root:

```text
<chrome-profile-dir>/NativeMessagingHosts/com.chromemcp.nativehost.json
```

Manifest template:

```json
{
  "name": "com.chromemcp.nativehost",
  "description": "Chrome MCP native messaging host",
  "path": "/absolute/path/to/vendor/mcp-chrome/app/native-server/dist/native-messaging-host.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<chrome-extension-id>/"]
}
```

The installer refuses to create a missing Chrome profile dir because that usually
means Chrome is not installed for the current user.

## 3. Verify flow

```bash
node scripts/extension-host.js verify
```

With explicit paths:

```bash
node scripts/extension-host.js verify \
  --chrome-profile-dir "$HOME/.config/google-chrome" \
  --host-name com.chromemcp.nativehost
```

Verification checks that the manifest exists, parses as JSON, references an
existing native-server path, and that the native-server path is executable.

## 4. Launch Chrome with the extension

Launch a dedicated profile for manual/live testing:

```bash
chrome \
  --load-extension="$PWD/vendor/mcp-chrome/app/chrome-extension/.output/chrome-mv3" \
  --disable-extensions-except="$PWD/vendor/mcp-chrome/app/chrome-extension/.output/chrome-mv3" \
  --user-data-dir="/tmp/wah-extension-profile"
```

If your Chrome binary is named differently, replace `chrome` with
`google-chrome`, `chromium`, or the full path to the browser.

## 5. Uninstall flow

```bash
node scripts/extension-host.js uninstall
```

With an explicit profile dir:

```bash
node scripts/extension-host.js uninstall \
  --chrome-profile-dir "$HOME/.config/google-chrome" \
  --host-name com.chromemcp.nativehost
```

Uninstall deletes only the Native Messaging host manifest file. It does not
delete the Chrome profile, extension build, or native-server files.

## 6. Troubleshooting

### Extension not loaded

Open `chrome://extensions`, enable Developer Mode, and confirm the unpacked
extension appears. If it is missing, re-run the launch command with the absolute
path to `vendor/mcp-chrome/app/chrome-extension/.output/chrome-mv3`.

### Native host disconnected

Run:

```bash
node scripts/extension-host.js verify
```

Then check:

- the manifest path reported by verify,
- the manifest `path` points to the native-server file,
- the native-server file exists,
- the native-server file is executable.

### Debugger not available

Close DevTools on the target tab and stop any other debugger client attached to
that tab, then retry the extension-assisted operation.

## 7. Security note

The extension requests `chrome.debugger`, which is a powerful Chrome extension
permission. The operator grants that permission only by accepting Chrome's
extension install prompt for the unpacked extension. Do not install or enable the
extension for profiles where that permission is not appropriate.
