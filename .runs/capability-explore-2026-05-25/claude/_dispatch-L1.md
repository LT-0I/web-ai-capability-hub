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

# Bucket L1 — Claude main-chat 基础 (4 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: claude, profile: claude-9224, cdp_port: 9224, native_port: 12307
- backend: **extension-assisted-cdp**（硬性）
- model: Sonnet 4.6（先 select-model 一次确认；不要 Opus）

## 任务流（4 caps，串一条 conversation）

### cap claude-send-basic-ext
```bash
node dist/src/cli.js webai:claude:send-prompt --profile claude-9224 --backend extension-assisted-cdp --prompt "say only the word OK" --response-timeout-ms 90000 --json
```
- 闭环: `response_text` 非空 + `completion_detected === true` + 记下 `chat_url`

### cap claude-select-model-sonnet-ext
```bash
node dist/src/cli.js webai:claude:select-model --profile claude-9224 --backend extension-assisted-cdp --model "Sonnet 4.6" --tab-url-contains <chat_url> --json
```
- 闭环: `ok === true` AND `model_used` 含 "Sonnet"

### cap claude-send-thinking-ext
```bash
node dist/src/cli.js webai:claude:send-prompt --profile claude-9224 --backend extension-assisted-cdp --thinking --reuse-conversation --tab-url-contains <chat_url> --prompt "Think step by step: 17 × 23 = ?" --response-timeout-ms 180000 --json
```
- 闭环: `response_text` 含 "391" + `completion_detected === true`

### cap claude-send-web-search-ext
```bash
node dist/src/cli.js webai:claude:send-prompt --profile claude-9224 --backend extension-assisted-cdp --web-search --reuse-conversation --tab-url-contains <chat_url> --prompt "What is today's date?" --response-timeout-ms 120000 --json
```
- 闭环: `response_text` 含日期格式（"2026" / "May" / "5月" 等）

## 通用 5 步
1. CLI + JSON
2. evidence → `.runs/capability-explore-2026-05-25/claude/<cap-id>.json`
3. capability-library features 追加（status: OK_EXT_BACKEND, mcp_tool: 对应 webai_claude_*, backend: extension-assisted-cdp, source: capability-explore-2026-05-25/L1, verified_by: codex-bucket-L1, completion_gate: <判据>）；如 status_enum 缺 OK_EXT_BACKEND/FAIL_CLOSED_EXT_BACKEND 先扩展
4. `examples/workflows/claude-<cap-id>.yaml`（mode: assisted）
5. 心跳: `<ISO> L1/<cap-id> <ok|fail-closed> <wall_ms> <evidence>` → heartbeat.log

## 失败处理
单 cap 2 次；仍败 → FAIL_CLOSED_EXT_BACKEND + errorCode + cause，继续。≥3 caps 失败 → L1-blocker.md exit 1。

## 兜底
不准 force push / 修 git config / 跳 hook / 改 src/ / 开新 chrome / 杀 chrome。

## 退出
4 caps 终态 → exit 0；blocker → exit 1；> 25 min → exit 2。
