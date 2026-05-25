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

# Bucket C2 — ChatGPT image2 生图 (1 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: chatgpt, profile: chatgpt, cdp_port: 9223, native_port: 12306
- backend: **extension-assisted-cdp**
- model: image2（ChatGPT 当前生图模型，**不是 DALL-E**）；如果需要切模型，先用 select-model

## cap chatgpt-generate-image-ext
```bash
node dist/src/cli.js webai:chatgpt:generate-image --profile chatgpt --backend extension-assisted-cdp --prompt "A clean futuristic laboratory notebook icon, blue and white, transparent background" --download-dir /tmp/explore-2026-05-25/chatgpt --json
```
- 闭环判据: 返回 `path` 非空 AND 文件存在 AND `size_bytes > 1024` AND `sha256` 非空

## 通用 5 步（每 cap 必做）
1. 跑 CLI，捕获 JSON 输出
2. evidence → `.runs/capability-explore-2026-05-25/chatgpt/<cap-id>.json`
3. 闭环 → 在 `docs/capability-library.json` features 追加：`{"id":"<cap-id>","service":"chatgpt","name":"...","ui_location":"...","source":"capability-explore-2026-05-25/C2","status":"OK_EXT_BACKEND","mcp_tool":"webai_chatgpt_generate_image","backend":"extension-assisted-cdp","evidence":"<evidence-path>","verified_by":"codex-bucket-C2","completion_gate":"<判据文字>","last_update":"2026-05-25","artifact":{"type":"image/png","relative_path":"<file>"}}`
   - 如果 status_enum 没有 OK_EXT_BACKEND/FAIL_CLOSED_EXT_BACKEND，先扩展 enum
4. 闭环 → 写 `examples/workflows/chatgpt-generate-image-ext.yaml`（mode: assisted；steps 调对应 CLI）
5. 心跳：`.runs/capability-explore-2026-05-25/chatgpt/heartbeat.log` 追加一行 `<ISO> C2/<cap-id> <ok|fail-closed> <wall_ms> <evidence_path>`

## 失败处理
- 单 cap 最多 2 次尝试；仍失败 → status="FAIL_CLOSED_EXT_BACKEND" + errorCode + cause，继续
- 配额耗尽 → 标 `quota-limited` + `EXTERNAL_QUOTA_EXHAUSTED`
- Cloudflare / LOGIN_REQUIRED → 写 `.runs/capability-explore-2026-05-25/chatgpt/C2-blocker.md` exit 1

## 兜底
- 不准 force push / 修 git config / 跳 hook / ChatGPT Pro / 改 src/
- 不准开新 chrome / 杀已有 chrome
- 单桶 > 25 min 即 timeout exit 2

## 退出
- 1 cap 终态 → exit 0
- blocker → exit 1
- timeout → exit 2

确保 download-dir 在调用前 mkdir -p。
