# Pruned Vendor Surface

Phase 2 prunes the vendored `hangwin/mcp-chrome` v1.0.0 tree to the Chrome MV3 service-worker, native-messaging host, MCP registry, selector engine, and browser tools required by Chrome Extension #15. The removed code is UI, autonomous-agent, semantic-search, recording, GIF, userscript, bookmark/history, and locale surface that is not load-bearing for the extension-assisted CDP backend; retained protocol names and retained tool semantics are left intact, with registries narrowed to the remaining tools.

- Removed extension UI entrypoints: options, sidepanel, popup, welcome, builder, web-editor-v2, offscreen, shared UI assets, content UI bridges, quick-panel background, and web-editor background coordinator.
- Removed native autonomous-agent runtime and its HTTP route; retained native messaging, MCP, HTTP control-plane, CLI, scripts, trace analyzer, shims, types, constants, and utilities.
- Removed out-of-scope browser tools: record-replay, bookmarks, history, vector search, GIF recorder/auto-capture/rendering, and userscript registration.
- Removed semantic-search/model assets: ONNX runtime payload, workers, content indexer, vector database, model cache, SIMD math, text chunking, and offscreen manager.
- Removed in-page overlay scripts used only by deleted editor/recording/marker flows; retained helper scripts required by retained click/fill/keyboard/screenshot/read-page/web-fetcher/inject/element-picker tools.
- Removed non-English locales and kept `_locales/en` with manifest `default_locale: 'en'`.
- Trimmed manifest permissions and MCP/shared-tool registries so deleted tools and pages are not exposed.
