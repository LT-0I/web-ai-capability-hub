# Task: 修 closure-r7 剩 6 红，让 closure-r8 至少再绿 4 个（≥32 green）

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Background

R-arc 已跑：r4(21/13) → r5(28/6) → r6(29/5) → r7(28/6)。 r5→r7 通过修了 evaluator + 部分源码把绿数推到 28。当前 6 红、根因已 triage 清楚（evidence in `.runs/capability-explore-2026-05-25/closure-r7/<service>/<id>.json`，必读 stdout_parsed + errorCode + elapsed_ms）：

| # | cap | 真根因（已确认）|
|---|---|---|
| A1 | `gemini-generate-image-ext` | vendor MCP server singleton bug：HTTP 500 `"Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection."` |
| A2 | `gemini-music-generate-ext` | 同 A1 |
| A3 | `gemini-veo-quota-error-mgr` | 同 A1（之前误判为 gate 问题，r7 evidence 显示就是 `CHROME_EXTENSION_NOT_CONNECTED`）|
| B1 | `gemini-conversation-reuse-mgr` | create_conversation 步在 6.4s 早死 `COMMAND_TIMEOUT`，wait_ms=524；同 cap 第 2 步 reuse_conversation 在 21s 成功 → SPA 完成检测器在第一个 send 上提前判空 |
| C1 | `claude-send-style-ext` | workflow 跑通了 2 步，但 send_concise 和 send_explanatory 返回**完全相同 response_text** → `--style` 在 extension-assisted-cdp backend 没真正生效（或 Claude UI 没 honor）|
| D1 | `claude-generate-file-py-ext` | workflow 生成 `hello.py` 28B 内容 `print('hello claude probe')`；evaluator 要 ≥32B + contains 'hello claude probe'。28<32 卡掉了；evaluator 太严，或 prompt 让 Claude 产物太短 |

## Buckets & 修法（按 ROI 排序）

### Bucket A — vendor MCP server singleton bug (3 cap 一起治)

**Root cause**: `vendor/mcp-chrome/app/native-server/src/mcp/mcp-server.ts:4-24` 把 `Server` 做成模块级单例，`server/index.ts:166`(SSE) 和 `:219`(StreamableHTTP) 都对同一 singleton 调 `connect(transport)`。第 2 个 HTTP session 必然抛 "Already connected"（MCP SDK Server 不允许复用 transport）。每个 native host 跑 ~25 个 cap 就坠机，r5→r7 复现。

**修法（首选 — per-session Server factory）**:
1. 改 `vendor/mcp-chrome/app/native-server/src/mcp/mcp-server.ts`：
   - 删 `mcpServer` 单例
   - `getMcpServer()` 改为 `createMcpServer()`：每次 new `Server(...)` + `setupTools(server)` 后 return
   - 保留 `getMcpServer` 兼容旧 import（内部直接 `createMcpServer()`），同时 export 新 `createMcpServer`
2. `vendor/mcp-chrome/app/native-server/src/server/index.ts:166`：`await createMcpServer().connect(transport);`
3. `vendor/mcp-chrome/app/native-server/src/server/index.ts:219`：同上
4. 检查 `setupTools` 是否有一次性副作用（注册全局事件 / start poller / etc.）；如果有，把副作用提到模块级、handler 自身保持 stateless

**Rebuild + reload**:
1. `cd vendor/mcp-chrome && pnpm install --frozen-lockfile=false` （如缺）
2. vendor 的 native host 是 `app/native-server`，build 命令在该子包 `package.json`；常见是 `pnpm -F native-server build` 或 `cd app/native-server && npm run build`。**先 `ls vendor/mcp-chrome/app/native-server/package.json` + 看 scripts 决定，不要瞎试**
3. 验证产物路径（chrome 真正 spawn 的 native host 二进制）— `cat /etc/opt/chrome/native-messaging-hosts/com.chrome_mcp.native_host.json 2>/dev/null || ls ~/.config/google-chrome/NativeMessagingHosts/ 2>/dev/null` 找 manifest，里面 `path` 字段指到真正的可执行
4. **不要重启 Chrome**：直接 `pkill -f "native-server"`（或 manifest path 对应的进程）；下次 webai 调用时 chrome SW 会重新 spawn 新 native host（stdio child，无 DISPLAY 需求）

**Acceptance for Bucket A**:
- Fresh build + native host respawned
- 3 个 cap 单独跑 `node dist/src/cli.js workflow:run examples/workflows/<id>.yaml --json` 全部 `workflow_ok=true` + closure gate 通过
- 不要让原 mcp-chrome 的其他 ext / smoke 退化

### Bucket B — gemini-conversation-reuse 检测器早死 (1 cap)

第 1 步 `create_conversation` `webai:gemini:send-prompt` 在 6.4s 退出 `COMMAND_TIMEOUT`，wait_ms=524ms。明显 SPA 检测器还没看到 stream 就判空。

**修法**:
- 进 `src/mcp/tools.ts` 或对应 backend，找 Gemini send-prompt 的完成检测路径（`waitForGeminiStableCompletion` 或类似）
- 增加 **最小等待**（min response wait）至少到 5-8s 才允许判 "no response"；当前看起来是 sub-second 就判 empty
- 检测 ROUND 1：先在 src/ 加 min-wait 修；rebuild；单跑 workflow 验证 `create_conversation` ≥ 8s 才能返回，且 response_text 非空
- **不要 graceful fallback**；如果真没回复就抛 `COMMAND_TIMEOUT`，但门槛要拉高

**Acceptance**:
- workflow `gemini-conversation-reuse-mgr` `workflow_ok=true`
- 第 2 步 reuse_conversation `response_text` 含 "apple"

### Bucket C — claude-send-style style 没生效 (1 cap)

R7 evidence: 2 步 send 返回**字符完全相同**的 response_text。说明 `--style Concise` vs `--style Explanatory` 没有 propagate 到 Claude UI。

**调查路径**:
1. grep `--style` 在 src/cli 和 src/backends：确认 flag 被读 + 被传到 extension-assisted-cdp backend
2. grep `style` 在 vendor/mcp-chrome 的 ext 端 (content script / SW)：确认 ext 调 Claude UI 的 style picker
3. 如果 ext 端**没有** style 切换实现 → 不是 evaluator 问题，是 Phase 6 Claude lane 没 ship style。
   - 选项 a: 在 ext 端补 style picker 点击（Claude UI 上 style 在 "Styles" 下拉）
   - 选项 b: 如果 ext 端实现起来要新增 contract surface（→ 8-lock 会动），**改 workflow yaml** 让两步使用更强差异化的 prompt（比如 "用一句话" vs "用三段详细解释"），让 Claude 自然分化 response，evaluator unique-response gate 通过

如果可以**不改 contract**就用选项 b 解决：把 send_concise 的 prompt 改成 `"用一句话告诉我什么是机器学习"`，send_explanatory 改成 `"请用 3 段、每段 80 字以上、举具体例子，详细解释机器学习的原理、应用、和局限"`。然后保留 `--style` 不变（即便没生效，prompt 本身已经强制分化）。

**Acceptance**:
- 2 个 response_text 长度差异 ≥ 30%，且不完全相等
- evaluator unique-response gate 通过

### Bucket D — claude-generate-file-py evaluator/prompt 卡 28B vs 32B (1 cap)

R7 evidence: `hello.py` size=28B sha256=eefdd9c... `print('hello claude probe')` 字面 28 字符。
evaluator: `pathWithMin(parsed, 32, { contains: 'hello claude probe' })` 要求 ≥32B。

**修法（任选其一，挑现实的）**:
- 选 (i): 改 workflow yaml prompt 让 Claude 多产几行（保留 `'hello claude probe'`），比如 `"Write a Python script with a docstring + the line print('hello claude probe') + an if __name__ guard. Save as .py for download"`. 自然 ≥ 60B。
- 选 (ii): 改 evaluator 阈值到 24B（**风险**：closure-r7.mjs 已 committed-as-r5/6/7，改它需要再 fork 一个 run-closure-r8.mjs）。

**首选 (i)**：只改 yaml，零 contract 风险。

**Acceptance**:
- generated path 内容 ≥ 32B + contains `hello claude probe`

## Constraints (硬性，违反一项就停)

1. **8-lock contract** 不变：pkg `1.0.0` / contract `1.10.0` / 191 cmds / 39 error_codes / 40 webai_ / 121 research_ / 8 wah_ / golden snapshot
2. `npm test` 必须 674/674 通过
3. **NO** 改 `tests/consumerContract.test.ts`
4. **NO** 直接改 `dist/`；统一 `rm -rf dist && npm run build`
5. **NO** `--no-verify` / `--no-gpg-sign` / 跳 hook
6. **NO** 重启 Chrome（无 DISPLAY/XAUTH 会被 Cloudflare 挡）— **可以 pkill 单独 native host**（stdio child，Chrome SW 自动 respawn）
7. **NO** graceful fallback；UI drift / extension drift 必须 surface contract 错误码（`CHROME_EXTENSION_NOT_CONNECTED` / `ELEMENT_NOT_FOUND` / `COMMAND_TIMEOUT` / 等）
8. **NO** CAPTCHA bypass / stealth / Pro / Opus-for-test
9. **Fresh-only smoke evidence**：每个 cap 单跑前 `rm -rf dist && npm run build`；evidence json 的 mtime 必须 newer than `dist/src/mcp/tools.js`（`stat -c '%y'` 验证）
10. **每 cap 至多 1 次 retry**，不要死循环

## 工作流（每 bucket）

```bash
# 1. 读 evidence
cat .runs/capability-explore-2026-05-25/closure-r7/<service>/<id>.json | python3 -c "import sys,json; d=json.load(sys.stdin); ..."

# 2. patch
# (edit src/ or vendor/ or examples/workflows/<id>.yaml)

# 3. rebuild
rm -rf dist && npm run build 2>&1 | tail -3

# 4. for vendor changes: rebuild + respawn native host
cd vendor/mcp-chrome && (look at package.json scripts) && cd -
pkill -f "native-server" && sleep 1  # Chrome SW auto-respawns on next ext call

# 5. single smoke
node dist/src/cli.js workflow:run examples/workflows/<id>.yaml --json | tee /tmp/<id>.r8.json

# 6. verify fresh
stat -c '%y' /tmp/<id>.r8.json dist/src/mcp/tools.js  # smoke must be newer

# 7. 写 evidence to .runs/capability-explore-2026-05-25/closure-r8-fixes/<id>.json
```

## 优先级

- 先 Bucket D（只改 yaml 最快 — 1 cap，10 min）
- 再 Bucket C 选项 b（只改 yaml — 1 cap，10 min）
- 再 Bucket B（src 改 min-wait — 1 cap，30 min）
- 最后 Bucket A（vendor 改 + rebuild + respawn — 3 cap 一起治，最大杠杆但也最高风险，60-90 min）

## 兜底

- 任一 bucket 卡 60 min 不动 → 写 `.runs/capability-explore-2026-05-25/closure-r8-fixes/<bucket>-blocker.md`（cause + 当前 evidence + 推荐人工二验路径），skip 接下一个
- 总时长上限 3 小时
- 完成后 `rm -rf dist && npm run build && npm test 2>&1 | tail -5`（必须 674/674 通过）
- 跑新的 closure：
  ```bash
  cp .runs/capability-explore-2026-05-25/closure/run-closure-r7.mjs \
     .runs/capability-explore-2026-05-25/closure/run-closure-r8.mjs
  sed -i 's|closure-r7|closure-r8|g' .runs/capability-explore-2026-05-25/closure/run-closure-r8.mjs
  # 如果 Bucket D 选 (ii) 改 evaluator，在 r8.mjs 里改 pathWithMin 阈值
  WAH_BROWSER_EXECUTABLE=/bin/false node .runs/capability-explore-2026-05-25/closure/run-closure-r8.mjs
  ```

## 退出条件

- closure-r8 final green ≥ 32（至少再修绿 4 个），OR
- 3 小时 budget 到，OR
- 任意硬约束被破坏（contract 缩水 / test failing / 8-lock 改变 / dist 被直接改）

## 最终交付

`.omc/codex-out/closure-fix-r8.md` 必须含：
- 每 cap 的 fix/skip/blocker 状态 + 改了哪些文件
- 8-lock 验证结果（cmds/errs/webai_/research_/wah_/golden/pkg/contract 7 项实测数）
- `npm test` 结果
- closure-r8 final green/red 数（must ≥32 green）
- 残留 red 列表 + 各自 root cause 推断 + 后续推荐路径
- vendor 改了什么文件 / rebuild 用的什么命令（如果动了 Bucket A）

如果到 budget 还有 red：报清单 + 各自 blocker，不要硬修破契约。
