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

# Bucket C10 — ChatGPT GPTs + Codex 子模块 (2 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: chatgpt, profile: chatgpt, cdp_port: 9223, native_port: 12306
- backend: managed-cdp（GPTs / Codex sub-mcp 尚未加 extension-assisted-cdp opt-in）

## cap chatgpt-gpts-converse-ext-fallback
通过 URL 直接进入一个公开 GPT，然后 send-prompt：
- 先用 `--tab-url-contains "/g/g-"` 寻找已打开的 GPT tab 或选择一个 stable 公开 GPT URL（如 GPT4-with-Canvas 等通用 GPT），用 `--url` 指定
- 调用：
```bash
node dist/src/cli.js webai:chatgpt:send-prompt --profile chatgpt --url "https://chatgpt.com/g/g-pmuQfob8d-image-generator" --prompt "Say only OK" --response-timeout-ms 90000 --json
```
- 闭环判据: `response_text` 非空 AND `completion_detected === true` AND `chat_url` 含 `/g/g-`

如果该 URL 无法访问/账号未启用 → 试任一已在 sidebar 中的 GPT，或 fail-closed 标 UNSUPPORTED_FEATURE。

## cap chatgpt-codex-submit-task-ext-fallback
Codex 子模块（LT-0I 允许，CLAUDE.md 已备）：
```bash
# 先 list-envs 看可用环境
node dist/src/cli.js webai:chatgpt:codex:list-envs --profile chatgpt --json
# 用第一个 env，submit-task with confirmed=true
node dist/src/cli.js webai:chatgpt:codex:submit-task --profile chatgpt --env-name "<first-env>" --prompt "Add a one-line comment to README.md" --confirmed --json
# 立即 task-status 拿状态
```
- 闭环判据: submit-task 返回 `task_id` 非空 AND task-status `ok === true`

如果 env 列表为空（账号无 codex 接入），→ fail-closed UNSUPPORTED_FEATURE。

## 通用 5 步
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json`
3. capability-library 追加（status: OK_MANAGED_CDP_ONLY 或 FAIL_CLOSED_UNSUPPORTED, backend: managed-cdp, source: C10, verified_by: codex-bucket-C10）
4. `examples/workflows/chatgpt-<cap-id>.yaml`
5. 心跳

## 失败 / 兜底 / 退出
两 cap 全败 → C10-blocker.md exit 1。> 25 min exit 2。
