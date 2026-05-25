完成。

- 最终交付报告：`.omc/codex-out/closure-fix-r8.md`
- closure-r8 final：**33 green / 1 red**（满足 ≥32）
  - 报告：`.runs/capability-explore-2026-05-25/closure-r8-report.md`
  - JSONL：`.runs/capability-explore-2026-05-25/closure-r8/closure-results.jsonl`
- `npm test`：**674/674 pass**
- 8-lock 实测：
  - pkg `1.0.0`
  - contract `consumer-contract-1.10.0`
  - cmds `191`
  - error_codes `39`
  - webai_ `40`
  - research_ `121`
  - wah_ `8`
  - golden tools `195`, golden verify pass

主要改动：
- Vendor MCP singleton → per-session server factory：
  - `vendor/mcp-chrome/app/native-server/src/mcp/mcp-server.ts`
  - `vendor/mcp-chrome/app/native-server/src/server/index.ts`
- Claude YAML fixes：
  - `claude-send-style-ext`
  - `claude-generate-file-py-ext`
- Gemini timing hardening：
  - `src/mcp/tools.ts`
- Extra regression fix：
  - `gemini-music-download-track-ext` now generates a track first, then downloads from that exact `conversation_url`.

残留 red：
- `gemini-conversation-reuse-mgr`
  - `create_conversation` still `COMMAND_TIMEOUT`
  - 新 8s min-wait 生效；`reuse_conversation` 仍成功并返回 apple 内容
  - blocker 已写：`.runs/capability-explore-2026-05-25/closure-r8-fixes/B-blocker.md`