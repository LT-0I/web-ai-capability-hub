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

# Bucket L7 — Claude Design 创建+生成 (2 capability)

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## Service / Backend / Profile
- service: claude (Design 子产品), profile: claude-9224, cdp_port: 9224, native_port: 12307
- backend: managed-cdp（Design sub-MCP 尚未加 extension-assisted-cdp opt-in）

## cap claude-design-create-project-mgr
```bash
node dist/src/cli.js webai:claude:design:create-project --profile claude-9224 --title "Capability Probe Design" --json
```
- 闭环: 返回 `project_id` 非空 AND `project_url` 非空 AND URL 可访问

## cap claude-design-generate-mgr
紧接上一步 project_id 链：
```bash
node dist/src/cli.js webai:claude:design:generate --profile claude-9224 --project-id "<from-create>" --prompt "Generate a single-page landing site for a coffee shop named 'Probe Cafe'. Use modern minimal style with hero image and 3-feature section." --response-timeout-ms 300000 --json
# 然后 get-html
node dist/src/cli.js webai:claude:design:get-html --profile claude-9224 --project-id "<id>" --file "<fileName from generate>" --json
```
- 闭环: generate 返回 `fileName` 非空 AND get-html 返回 `html` 字符串非空（> 200 字符）

## 通用 5 步
1-2. CLI + evidence → `.runs/capability-explore-2026-05-25/claude/<cap-id>.json`（必须包含 generate + get-html 两步输出）
3. capability-library 追加（status: OK_MANAGED_CDP_ONLY, mcp_tool: webai_claude_design_create_project / webai_claude_design_generate, backend: managed-cdp, source: L7, verified_by: codex-bucket-L7）
4. `examples/workflows/claude-design-create-generate.yaml`（多 step chain）
5. 心跳

## 失败 / 兜底 / 退出
两 cap 链式依赖；create 失败则 generate 直接 fail-closed UNSUPPORTED。全败 → L7-blocker.md exit 1。> 25 min exit 2。
