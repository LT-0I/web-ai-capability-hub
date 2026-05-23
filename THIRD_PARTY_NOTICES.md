# Third-Party Notices

This repository vendors third-party code under their original
licenses. Each vendored project preserves its original LICENSE
file inside its directory.

## hangwin/mcp-chrome

- Source: https://github.com/hangwin/mcp-chrome
- Imported SHA: 2e758621d51c2f9ce0060122ea21ab8afc608979
- Imported tag (if any): v1.0.0
- Import date: 2026-05-23
- License: MIT (see `vendor/mcp-chrome/LICENSE`)
- Imported subset: `app/chrome-extension/`, `app/native-server/`,
  `packages/shared/`, root build configs
- Purpose: serves as the substrate for this repo's
  extension-assisted CDP backend per
  `refector-ref/CHROME_EXTENSION_BACKEND_DESIGN.md` and
  `.omc/codex-out/chrome-extension-oss-reuse-r3.md`.
- Modifications: none in Phase 1 (intake only). Pruning happens
  in Phase 2.
