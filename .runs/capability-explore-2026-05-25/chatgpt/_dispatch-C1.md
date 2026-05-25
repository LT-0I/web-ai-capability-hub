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

# Bucket C1 — ChatGPT main-chat 基础 (4 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: chatgpt
- profile: chatgpt (cdp_port=9223, native_port=12306)
- backend: **extension-assisted-cdp** (硬性，禁 managed-cdp)
- model限制: thinking 系列（如 "Thinking"），**禁 GPT-5 Pro / 任何 Pro tier**

## 任务流（serial 4 caps，共享同一 conversation）

按顺序执行下列 4 个 cap，每个 cap 完成后立即写 heartbeat，然后开始下一个。所有 cap 共享同一个 conversation（先 send 一次拿到 conversation_id，后续 cap 用 `--reuse-conversation`+`--tab-url-contains <id>` 续聊）。

### cap chatgpt-send-basic-ext
```bash
node dist/src/cli.js webai:chatgpt:send-prompt --profile chatgpt --backend extension-assisted-cdp --prompt "say only the word OK" --response-timeout-ms 90000 --json
```
- 闭环判据: `response_text` 非空 AND `completion_detected === true` AND `conversation_id` 非空
- 记下返回的 `chat_url` 给后续 caps 用作 `--tab-url-contains`

### cap chatgpt-select-model-thinking-ext
```bash
node dist/src/cli.js webai:chatgpt:select-model --profile chatgpt --backend extension-assisted-cdp --model "Thinking" --tab-url-contains <chat_url> --json
```
- 闭环判据: `ok === true` AND `model_used` 含 "Thinking" / "thinking" / "GPT-5 Thinking"

### cap chatgpt-send-thinking-ext
紧接上一个，发一个需要推理的 prompt：
```bash
node dist/src/cli.js webai:chatgpt:send-prompt --profile chatgpt --backend extension-assisted-cdp --thinking --reuse-conversation --tab-url-contains <chat_url> --prompt "Think step by step: 13 x 27 = ?" --response-timeout-ms 120000 --json
```
- 闭环判据: `response_text` 含 "351" AND `completion_detected === true`

### cap chatgpt-send-web-search-ext
```bash
node dist/src/cli.js webai:chatgpt:send-prompt --profile chatgpt --backend extension-assisted-cdp --web-search --reuse-conversation --tab-url-contains <chat_url> --prompt "What's today's date?" --response-timeout-ms 120000 --json
```
- 闭环判据: `response_text` 含数字日期格式（如 "2026" / "May" / "5月" 等）AND `completion_detected === true`

## 每个 cap 5 步（必做）
1. 跑 CLI 命令，捕获 JSON 输出
2. evidence 写到 `.runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json`（包含完整 CLI 输出 + 闭环判据评估）
3. 闭环通过 → 在 `docs/capability-library.json` `features` 数组追加一条:
   ```json
   {"id": "<cap-id>", "service": "chatgpt", "name": "<人类可读名>", "ui_location": "<observed>", "source": "capability-explore-2026-05-25/C1", "status": "OK_EXT_BACKEND", "mcp_tool": "<对应 webai_ tool>", "backend": "extension-assisted-cdp", "evidence": ".runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json", "verified_by": "codex-bucket-C1", "completion_gate": "<闭环判据文字>", "last_update": "2026-05-25"}
   ```
   （如果 status_enum 还没有 OK_EXT_BACKEND，先把它加进去；FAIL_CLOSED_EXT_BACKEND 同）
4. 闭环通过 → 写一份 `examples/workflows/chatgpt-<cap-id>.yaml` 端到端 recipe（mode: assisted；steps 调用对应 CLI command）
5. 心跳：追加一行到 `.runs/capability-explore-2026-05-25/chatgpt/heartbeat.log`：
   ```
   <ISO-8601 UTC> C1/<cap-id> <ok|fail-closed> <wall_ms> <evidence_path>
   ```

## 失败处理
- 单 cap 最多 2 次尝试
- 仍失败 → status="FAIL_CLOSED_EXT_BACKEND"，记 `errorCode` + `cause` 入 library 该 cap 条目；**继续下一个 cap，不要终止桶**
- 桶级 blocker（连续 ≥3 cap 失败 / Cloudflare 拦截 / LOGIN_REQUIRED）→ 写 `.runs/capability-explore-2026-05-25/chatgpt/C1-blocker.md` 后退出

## 兜底硬性
- 不准 force push / 修 git config / 跳 hook
- 不准 ChatGPT Pro
- 不准开新 chrome / 杀已有 chrome
- 不准修 src/ 代码（只动 docs/capability-library.json + examples/workflows/）

## 退出条件
- 4 caps 全部到终态（ok 或 fail-closed）→ 正常 exit 0
- 桶级 blocker → exit 1
- 单桶耗时 > 25 分钟 → 写 timeout marker，exit 2
