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

# Bucket C5 — ChatGPT generate_file 代码类 (3 capability: py + md + csv)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: chatgpt, profile: chatgpt, cdp_port: 9223, native_port: 12306
- backend: **extension-assisted-cdp**
- model: Thinking

## 前置
mkdir -p /tmp/explore-2026-05-25/chatgpt

## cap chatgpt-generate-file-py-ext
```bash
node dist/src/cli.js webai:chatgpt:generate-file --profile chatgpt --backend extension-assisted-cdp --prompt "Write a Python script that prints 'hello capability probe'. Provide as a downloadable .py file." --expected-extension py --download-dir /tmp/explore-2026-05-25/chatgpt --artifact-class code --json
```
- 闭环: `path` 非空 + 文件存在 + size>32 + 内容含 'hello capability probe'

## cap chatgpt-generate-file-md-ext
```bash
node dist/src/cli.js webai:chatgpt:generate-file --profile chatgpt --backend extension-assisted-cdp --prompt "Write a markdown README explaining a fictional project 'CapProbe'. Provide as .md file." --expected-extension md --download-dir /tmp/explore-2026-05-25/chatgpt --artifact-class code --json
```
- 闭环: `path` 非空 + 文件存在 + size>64 + 内容含 'CapProbe'

## cap chatgpt-generate-file-csv-ext
```bash
node dist/src/cli.js webai:chatgpt:generate-file --profile chatgpt --backend extension-assisted-cdp --prompt "Generate a small CSV with header 'name,score' and 3 data rows. Provide as .csv file." --expected-extension csv --download-dir /tmp/explore-2026-05-25/chatgpt --artifact-class code --json
```
- 闭环: `path` 非空 + 文件存在 + size>32 + 内容含 'name,score'

## 通用 5 步
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json`
3. capability-library features 追加（status: OK_EXT_BACKEND, mcp_tool: webai_chatgpt_generate_file, backend: extension-assisted-cdp, source: capability-explore-2026-05-25/C5, verified_by: codex-bucket-C5, artifact: {type: text/<x>, relative_path: <file>}）
4. `examples/workflows/chatgpt-<cap-id>.yaml`
5. 心跳：`<ISO> C5/<cap-id> <ok|fail-closed> <wall_ms> <evidence>`

## 失败 / 兜底 / 退出
同 C4。3 caps 全败 → C5-blocker.md exit 1。
