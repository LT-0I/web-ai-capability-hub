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

# Bucket G5 — Gemini Music generate→轮询→下载 (3 chained cap)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: gemini-music (sub-mcp), profile: gemini-9225, cdp_port: 9225, native_port: 12308
- backend: **extension-assisted-cdp**（Phase 6 已加 opt-in for music_generate）

## 前置
mkdir -p /tmp/explore-2026-05-25/gemini

## cap gemini-music-generate-ext
```bash
node dist/src/cli.js webai:gemini:music:generate --profile gemini-9225 --backend extension-assisted-cdp --prompt "A short upbeat acoustic guitar loop, instrumental, 30 seconds" --json
```
- 闭环: 返回 `task_id` 非空（或 `track_url` 非空）

## cap gemini-music-task-status-ext
轮询直到 completed（最多 5 分钟）：
```bash
# 每 30s 轮询一次
for i in 1..10; do
  STATUS=$(node dist/src/cli.js webai:gemini:music:task-status --profile gemini-9225 --tab-url-contains "<track-url>" --json | jq -r '.status')
  echo "iter $i status=$STATUS"
  [ "$STATUS" = "completed" ] && break
  sleep 30
done
```
- 闭环: 最终 `status === "completed"` AND `track_url` 非空

## cap gemini-music-download-track-ext
```bash
node dist/src/cli.js webai:gemini:music:download-track --profile gemini-9225 --tab-url-contains "<track-url>" --format mp3 --download-dir /tmp/explore-2026-05-25/gemini --json
```
- 闭环: `path` 非空 + 文件存在 + 文件名 `.mp3` 结尾 + `size_bytes > 8192`

## 通用 5 步
3 caps 必须链式跑（task_id 在内存间传递）。每 cap 独立 evidence。
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/gemini/<cap-id>.json`
3. capability-library 追加（status: OK_EXT_BACKEND 或 OK_MANAGED_CDP_ONLY（task-status / download-track 还没 ext 支持，看实际表现）, mcp_tool: 对应 webai_gemini_music_*, backend: 对应, source: G5, verified_by: codex-bucket-G5, artifact: {type: audio/mpeg, relative_path: <file>}）
4. `examples/workflows/gemini-music-generate-chain.yaml`（chain 3 steps）
5. 心跳

## 失败 / 兜底 / 退出
配额耗尽 → FAIL_CLOSED_QUOTA。整链失败 → G5-blocker.md exit 1。> 25 min exit 2。
