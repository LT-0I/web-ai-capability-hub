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

# Bucket G1 — Gemini main-chat 基础 (4 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: gemini, profile: gemini-9225, cdp_port: 9225, native_port: 12308
- backend: managed-cdp（Gemini send_prompt 还未 extension-assisted-cdp opt-in）
- **硬性**: 所有 send-prompt 调用都加 `--reuse-conversation`（绕 fresh-tab hydration bug）
- model: 3.5-flash + thinking-level=standard

## 任务流（4 caps，串一条 conversation）

### 前置：先确保有一个 hydrated conversation tab
```bash
# 列出已存在的 gemini conversation URL
node -e "(async()=>{const{chromium}=require('playwright');const b=await chromium.connectOverCDP('http://127.0.0.1:9225');const ctx=b.contexts()[0];for(const p of ctx.pages()){const u=p.url();if(u.includes('gemini.google.com/app/'))console.log(u)}await b.close()})()"
```
拿到一个 `/app/<id>` URL 作为后续 `--tab-url-contains`。如果没有，先用 reuse 模式发一条任意 prompt 创建。

### cap gemini-send-basic-mgr
```bash
node dist/src/cli.js webai:gemini:send-prompt --profile gemini-9225 --reuse-conversation --tab-url-contains "<chat-id>" --prompt "say only the word OK" --response-timeout-ms 90000 --json
```
- 闭环: `response_text` 非空 + `completion_detected === true`

### cap gemini-select-model-flash-mgr
```bash
node dist/src/cli.js webai:gemini:select-model --profile gemini-9225 --model "3.5-flash" --thinking-level standard --tab-url-contains "<chat-id>" --json
```
- 闭环: `ok === true` AND `model_used` 含 "Flash"

### cap gemini-send-thinking-mgr
```bash
node dist/src/cli.js webai:gemini:send-prompt --profile gemini-9225 --reuse-conversation --tab-url-contains "<chat-id>" --thinking --prompt "Think step by step: 19 × 21 = ?" --response-timeout-ms 180000 --json
```
- 闭环: `response_text` 含 "399"

### cap gemini-send-web-search-mgr
```bash
node dist/src/cli.js webai:gemini:send-prompt --profile gemini-9225 --reuse-conversation --tab-url-contains "<chat-id>" --web-search --prompt "What is today's date in YYYY-MM-DD?" --response-timeout-ms 120000 --json
```
- 闭环: `response_text` 含 "2026-05" 或日期格式

## 通用 5 步
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/gemini/<cap-id>.json`
3. capability-library features 追加（status: OK_MANAGED_CDP_ONLY, mcp_tool: 对应 webai_gemini_*, backend: managed-cdp, source: capability-explore-2026-05-25/G1, verified_by: codex-bucket-G1, completion_gate: <判据>）；如 status_enum 缺 OK_MANAGED_CDP_ONLY/FAIL_CLOSED_MANAGED 先扩展
4. `examples/workflows/gemini-<cap-id>.yaml`
5. 心跳: `<ISO> G1/<cap-id> <ok|fail-closed> <wall_ms> <evidence>`

## 失败处理
单 cap 2 次；仍败 → FAIL_CLOSED + errorCode + cause，继续。≥3 caps 失败 → G1-blocker.md exit 1。

## 兜底 / 退出
不准 force push / 修 git config / 跳 hook / 改 src/ / 开新 chrome / 杀 chrome / 用 fresh tab。4 caps 终态 → exit 0；blocker → exit 1；> 25 min → exit 2。
