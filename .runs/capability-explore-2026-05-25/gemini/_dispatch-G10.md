# [PERSISTENCE 重要覆盖 — 优先于下文]

阅读以下规则后再读原 prompt。下文的"在 docs/capability-library.json features 追加"全部失效，改用此处规则。

## 1. capability 入库（替代 docs/capability-library.json 直写）
**不要直接修改 `docs/capability-library.json`。** 改成把要追加的 feature object 写成 JSON 单行追加到：
```
.runs/capability-explore-2026-05-25/<SERVICE>/library-additions.jsonl
```
其中 `<SERVICE>` 是 chatgpt / claude / gemini。

每行一个 JSON object（JSONL 格式），字段保留原 prompt 描述的所有 keys（id, service, name, ui_location, source, status, mcp_tool, backend, evidence, verified_by, completion_gate, last_update, artifact 等）。

orchestrator 会在 Stage 4 把所有 lane 的 jsonl 合并写入 `docs/capability-library.json`。

## 2. workflow recipe 仍直写
`examples/workflows/<service>-<cap-id>.yaml` 照常直接 git-tracked 路径写。文件名按 service 前缀，三 service 间无 path 冲突。

## 3. status_enum 扩展
**不要尝试修改 `docs/capability-library.json` 的 status_enum 字段**。如需新状态（OK_EXT_BACKEND / FAIL_CLOSED_EXT_BACKEND / OK_MANAGED_CDP_ONLY / FAIL_CLOSED_QUOTA / FAIL_CLOSED_UNSUPPORTED 等），直接在 jsonl entry 的 `status` 字段写出来；orchestrator 合并时统一扩展 enum。

## 4. CWD 仍是主 repo
所有 `node dist/src/cli.js ...` 调用从主 repo 工作目录调用（已经是 codex 的 PWD）。**不要 cd 到任何 worktree**（worktree 已废止）。

## 5. 心跳路径不变
heartbeat.log 路径继续是 `.runs/capability-explore-2026-05-25/<SERVICE>/heartbeat.log`。

## 6. evidence 路径不变
`.runs/capability-explore-2026-05-25/<SERVICE>/<cap-id>.json` 单 cap 单 evidence 文件。

## 7. 桶级 blocker / lane done
- 桶级 blocker: `.runs/capability-explore-2026-05-25/<SERVICE>/<BUCKET-ID>-blocker.md`
- lane runner 自动写 lane-done.marker，无需 codex 处理

---

# 以下是原 bucket prompt（按其内容执行，但 capability-library 写入路径以本 addendum 第 1 节为准）：

# Bucket G10 — Gemini conversation reuse + workspace + Veo quota 验证 (3 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: gemini, profile: gemini-9225, cdp_port: 9225, native_port: 12308
- backend: managed-cdp
- 硬性: `--reuse-conversation` for send-prompt

## cap gemini-conversation-reuse-mgr
```bash
# 先发一条创建 conversation
URL1=$(node dist/src/cli.js webai:gemini:send-prompt --profile gemini-9225 --prompt "First message about apples" --response-timeout-ms 60000 --json | jq -r '.chat_url')
# 再 reuse 续上
node dist/src/cli.js webai:gemini:send-prompt --profile gemini-9225 --reuse-conversation --tab-url-contains "$URL1" --prompt "What was my first message about?" --response-timeout-ms 60000 --json
```
- 闭环: 第二次 `response_text` 含 "apple"（说明上下文 reuse 成功）

## cap gemini-workspace-mgr
```bash
node dist/src/cli.js webai:gemini:workspace --profile gemini-9225 --action list --json
```
- 闭环: 返回 `workspaces` 数组或 `{ok:true, count:N}`

## cap gemini-veo-quota-error-mgr
（验证配额耗尽时 errorCode 形态是否合规）
- 先看 G4 结果；如果 G4 已经撞 quota 并 evidence 在 `.runs/.../gemini/gemini-generate-video-ext.json`，直接读那个 evidence 验证：
  - errorCode 必须是 `EXTERNAL_QUOTA_EXHAUSTED` 或 `LOGIN_REQUIRED` 等已知 contract code
  - 不能是 `COMMAND_TIMEOUT` / `UNKNOWN`（那是 bug）
- 如果 G4 成功了（说明账号还有配额），则用一个明显大量重复请求触发 quota：跳过本 cap，标 SKIP（status: `OK_DEFERRED`，cause: "configuration did not exhaust quota during probe"）

## 通用 5 步
1-2. CLI + evidence
3. capability-library 追加（status: 对应, mcp_tool: 对应, backend: managed-cdp, source: G10, verified_by: codex-bucket-G10）
4. `examples/workflows/gemini-<cap-id>.yaml`（quota cap 可不写 recipe，标 verify-only）
5. 心跳

## 失败 / 兜底 / 退出
3 caps 全败 → G10-blocker.md exit 1。> 25 min exit 2。
