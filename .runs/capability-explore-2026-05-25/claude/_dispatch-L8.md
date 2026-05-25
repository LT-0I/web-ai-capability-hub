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

# Bucket L8 — Claude Design 呈现 (1 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: claude (Design 子产品), profile: claude-9224, cdp_port: 9224, native_port: 12307
- backend: managed-cdp

## 前置
- L7 已经成功且 project_id + fileName 写到了 `.runs/capability-explore-2026-05-25/claude/claude-design-generate-mgr.json`
- 如果 L7 未成功（evidence 缺失），跳过本桶并 fail-closed UNSUPPORTED_PREREQUISITE，退出 0

## cap claude-design-present-mgr
读 L7 evidence 拿 project_id + fileName，然后：
```bash
node dist/src/cli.js webai:claude:design:present --profile claude-9224 --project-id "<from-L7>" --file "<fileName-from-L7>" --json
```
- 闭环: 返回 `present_url` 非空 AND URL 含 `/serve/` 或 `?file=` AND URL 可 curl GET 拿到 200

可选: 用 curl 验证 present URL 返回 HTML：
```bash
curl -s -m 10 -o /dev/null -w "%{http_code}" "<present_url>"
```
- 200 → OK

## 通用 5 步
1-2. CLI + evidence
3. capability-library 追加（status: OK_MANAGED_CDP_ONLY, mcp_tool: webai_claude_design_present, backend: managed-cdp, source: L8, verified_by: codex-bucket-L8, artifact: {type: text/html, public_url: <present_url>}）
4. `examples/workflows/claude-design-present.yaml`
5. 心跳

## 失败 / 兜底 / 退出
失败 → L8-blocker.md exit 1。> 25 min exit 2。
