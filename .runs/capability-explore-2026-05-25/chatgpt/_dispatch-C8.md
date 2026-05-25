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

# Bucket C8 — ChatGPT Pulse (2 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: chatgpt, profile: chatgpt, cdp_port: 9223, native_port: 12306
- backend: managed-cdp（Pulse 尚未在 Phase 6 加 extension-assisted-cdp opt-in；用 default backend）

## cap chatgpt-pulse-get-ext-fallback
```bash
node dist/src/cli.js webai:chatgpt:pulse:get --profile chatgpt --response-timeout-ms 120000 --json
```
- 闭环判据: `ok === true` AND 返回结构化 pulse data（cards / items 等非空）

## cap chatgpt-pulse-onboard-ext-fallback
```bash
node dist/src/cli.js webai:chatgpt:pulse:onboard --profile chatgpt --response-timeout-ms 120000 --json
```
- 闭环判据: `ok === true` AND 返回 onboard 状态字段

注意 backend 字段在 capability-library 写 "managed-cdp"（这两 cap 还没 extension-assisted-cdp 支持），source 仍 C8。

## 通用 5 步
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json`
3. capability-library 追加（status: OK_EXT_BACKEND_PENDING 或 OK_MANAGED_CDP_ONLY，mcp_tool: webai_chatgpt_pulse_get / webai_chatgpt_pulse_onboard, backend: managed-cdp, source: capability-explore-2026-05-25/C8, verified_by: codex-bucket-C8）
   - 如 status_enum 没有 OK_MANAGED_CDP_ONLY，先扩展
4. `examples/workflows/chatgpt-<cap-id>.yaml`
5. 心跳

## 失败 / 兜底 / 退出
Pulse 可能因账号 Plus/Pro 限制不可用 → 标 FAIL_CLOSED + UNSUPPORTED_FEATURE 或 LOGIN_REQUIRED，继续。2 caps 全败 → C8-blocker.md exit 1。> 25 min exit 2。
