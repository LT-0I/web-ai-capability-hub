# 三大 AI 网页端能力探查 + 固化 + 端到端闭环验证（overnight 自治任务）

**计划生成**: 2026-05-25
**执行模式**: orchestrator 主控 + **3 service lane 在主仓库并行（lane 内 serial 串 8-10 个小 codex 桶）**+ 末尾 1 个闭环验证 codex。Worktree 方案在 Stage 2 抛弃（ProfilePool 绑 CWD，从 worktree 调命令找不到 main repo 启动的 Chrome；改用 per-service `library-additions.jsonl` 避免 capability-library.json 写竞争）。
**预计周期**: 8-12 小时（用户睡前启动 → 醒后查看结果）
**目标基座**: `bcf651c` extension-assisted-cdp backend (Phase 6 已 ship)
**前置假设**: 9223/9224/9225 三个 Chrome 实例已配置好（插件 + 账号已就位，用户已确认）

**粒度修订（2026-05-25 v2）**：不再用"每 service 一个大 codex 任务 18 capability 一起跑"的模式。改成**每 service 拆成 8-10 个小 codex 桶**（≤3 caps/桶），lane 内 serial 调度；单桶失败只折损 ≤3 caps，不污染同 lane 其它桶；总 codex 调度数 ~30 个。理由：单任务 context 小、xhigh 推理聚焦、爆炸半径小、checkpoint 粒度细。

---

## 0. 设计原则

1. **闭环优先**: 每个探查到的 capability 必须满足"prompt → 响应 → 产物可回收"完整链路。拿不回产物的 capability 不算 capability，标 `fail-closed` + 具体 errorCode。
2. **单条 backend**: 全程使用 `backend=extension-assisted-cdp`（最新一版基座，token 消耗+稳定性都优于 managed-cdp）。
3. **资源克制**: 每条 case 完成立即关闭 tab；超过 2 次尝试即放弃；不开发外发请求。
4. **不用 Pro 模型**:
   - ChatGPT: 用 thinking 类（如 `gpt-5-thinking` 或当前 thinking-tier），**禁用 GPT-5 Pro**
   - Claude: Sonnet 4.6 + Adaptive Thinking
   - Gemini: Gemini 3.5 Flash + thinking-level=fastest
5. **生图模型正确名**: ChatGPT 当前生图模型是 **image2**（不是 DALL-E 3），相关 capability 标签和 evidence 都用 image2。
6. **Gemini Veo 配额耗尽时的策略**: 标 `quota-limited` + errorCode `EXTERNAL_QUOTA_EXHAUSTED`，**不自治切换 profile**（风险太高），记录到 closure report，由用户白天手动二次确认。
7. **每 service 独立 worktree**: 仿 Phase 6 验证过的模式，三个 lane 并行执行，最后串行 cherry-pick 合并。
8. **Lane 内 serial 多桶调度**: 每 lane 内的 codex 必须 serial（同一 Chrome 不能两个 codex 并发驱动，会撞 tab 状态/conversation_manage 状态）；orchestrator 负责前一个桶 exit 后立即启下一个桶。单桶 ≤ 3 capability ≤ 15 分钟级。
9. **Gemini 探查必须 `reuse_conversation=true`**: fresh-tab hydration bug 已知（[[feedback_spa_hydration_canonical_reader]]），今晚 workaround，未来单独 issue 修。每个 Gemini 桶的 codex prompt 都要强制这条。

---

## 1. 探查范围 + 桶分组（每 service 8-10 桶）

每"桶"= 一次独立 codex 调度的最小单元。同桶 caps 必须共享 state（否则拆开）。lane 内 serial，桶之间不互相依赖。

### 1.1 ChatGPT lane — 10 桶 / 18 capability

| 桶# | 桶名 | 含 capability | 共享 state 理由 |
|---|---|---|---|
| C1 | main-chat 基础 | send_prompt + select_model + thinking + web_search | 同一 conversation 连测 4 种模式 |
| C2 | image2 生图 | generate_image(image2) → 下载 PNG | 单 cap |
| C3 | upload | 单文件 query + 多文件(2-3) query | 同一 conversation 续上传 |
| C4 | generate_file 文档类 | docx + pptx 下载 | 同 conversation 切产物格式 |
| C5 | generate_file 代码类 | py + md + csv 下载 | 同 conversation 切格式 |
| C6 | canvas | 创建 → canvas_export 下载 | 必同任务（canvas 必须先存在） |
| C7 | deep_research | 提交 → 等报告 → 下载 docx | 必同任务（task_id 在内存） |
| C8 | pulse | pulse_get + pulse_onboard | 关联（onboard 影响 get） |
| C9 | conversation + workspace | conversation_manage(rename/delete) + workspace 切换 | 同账号状态 |
| C10 | GPTs + codex 子模块 | 选 GPT 对话 + codex submit-task → get_diff | 子产品打包 |

**闭环判据**（每 cap）：
- 文字 → `response_text` 非空
- 图 → PNG 落盘 + sha256 + size_bytes > 0
- 文档 → 文件落盘 + size_bytes > 0
- 状态变更 → 操作后回读匹配预期

### 1.2 Claude lane — 9 桶 / 16 capability

| 桶# | 桶名 | 含 capability | 共享 state 理由 |
|---|---|---|---|
| L1 | main-chat 基础 | send_prompt + select_model + Adaptive thinking + web_search | 同 conversation 连测 |
| L2 | incognito + style | incognito send + style 选择 send | 同账号两次独立 chat |
| L3 | upload | 单文件 query + 多文件(≤3) query | 同 conversation 续上传 |
| L4 | generate_file 文档类 | docx + pptx 下载 | 同 conversation 切格式 |
| L5 | generate_file 代码类 | py + md + csv 下载 | 同 conversation 切格式 |
| L6 | deep_research | 提交 → 等报告 → 下载 | 必同任务 |
| L7 | Claude Design 创建+生成 | design create_project → generate → get_html | 必同任务（project_id 链） |
| L8 | Claude Design 呈现 | design present (live URL) + 截图 | 接上 L7 的 project_id |
| L9 | conversation + workspace | conversation_manage + workspace | 状态打包 |

### 1.3 Gemini lane — 10 桶 / 18 capability（全 `reuse_conversation=true` 绕 hydration bug）

| 桶# | 桶名 | 含 capability | 共享 state 理由 |
|---|---|---|---|
| G1 | main-chat 基础 | send_prompt + select_model + thinking-level + web_search | 同 conversation |
| G2 | upload + 多模态 | upload_and_query 单文件 + 文字+图多模态 prompt | 同 conversation |
| G3 | generate_image | PNG 下载 | 单 cap |
| G4 | generate_video (Veo) | MP4 下载（**配额耗尽即标 quota-limited 不重试**） | 单 cap |
| G5 | music generate+轮询+下载 | music_generate → task_status 轮询 → download_track 下载 MP3 | 必同任务（task_id 链） |
| G6 | canvas_edit | canvas_html 修改回读 | 单 cap |
| G7 | canvas_to_docs | Docs URL 推送 + 可访问验证 | 单 cap |
| G8 | deep_research | docx 下载 | 必同任务 |
| G9 | Gems 子产品 | 选 gem → 对话 → 响应 | 子产品 |
| G10 | conversation reuse + workspace | reuse_conversation 续聊 + workspace 切换 + Veo 配额耗尽 errorCode 验证 | 状态打包 |

---

## 2. Per-bucket codex prompt 模板

不再写 per-service 大 prompt。改成**一份通用模板 + 每桶一份 spec 文件**。

### 2.1 通用模板（适用于所有 30 个桶）

写到 `.omc/codex-prompts/_explore-bucket-template.md`：

```
# Task: 探查并固化 <SERVICE> 的 <BUCKET-NAME> 桶（≤3 capability）

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## 桶 spec
读取 `.omc/codex-prompts/explore-spec-<BUCKET-ID>.json`，包含：
  - capabilities: [{ id, cli_command, args, expected_output_keys, closure_criterion }]
  - profile, cdp_port, native_port, backend
  - service-specific 约束（如 Gemini reuse_conversation=true）

## Backend 硬性
- backend = spec 里的值（默认 extension-assisted-cdp；Gemini send_prompt 退化到 managed-cdp + reuse_conversation=true）

## Model 限制
- ChatGPT: 限定 thinking 系列，禁用 GPT-5 Pro
- Claude: Sonnet 4.6 + Adaptive Thinking
- Gemini: Flash 3.5 + thinking-level=fastest

## 对每个 capability 做 5 步
1. 调用 spec 里的 cli_command + args（用 `node dist/src/cli.js ... --json` 拿结构化输出）
2. 捕获 evidence → `.runs/capability-explore-2026-05-25/<SERVICE>/<CAPABILITY-ID>.json`
3. 验证 closure_criterion 满足（response_text 非空 / 文件落盘 + size > 0 / state 回读匹配等）
4. 满足 → 把这个 capability 追加进 `docs/capability-library.json`（status=`ok`），写 recipe `examples/workflows/<SERVICE>-<CAPABILITY>.yaml`
5. 关闭刚打开的 tab（conversation_manage delete 或调用 page.close 等价手段）

## 失败处理
- 单 cap 最多 2 次尝试
- 仍失败 → capability-library 状态 `fail-closed` + errorCode + cause；继续下一个 cap，**不要因为一个 cap 失败而终止桶**
- 桶里 ≤3 caps 全失败 → 写桶级 blocker `.runs/.../<SERVICE>/<BUCKET-ID>-blocker.md` 后退出

## 心跳
每完成一个 cap 立即写一行到 `.runs/capability-explore-2026-05-25/<SERVICE>/heartbeat.log`：
  格式：`<ISO> <BUCKET-ID>/<CAPABILITY-ID> <ok|fail-closed> <wall_ms> <evidence_path>`

## 退出条件
- 桶内所有 caps 都到终态 (ok/fail-closed)
- 或桶级 blocker 触发
- 或单桶耗时超过 25 分钟（写 timeout marker，退出）

## 兜底硬性
- 不准 force push / 修 git config / 跳 hook
- 不准 ChatGPT Pro
- Gemini 撞 Veo 配额 → 标 quota-limited，跳；不切 profile
- Cloudflare 拦截 → 桶级 blocker + 退出
- 同一时刻只允许一个 codex 占用同一个 Chrome profile（不能 spawn 兄弟 codex）
```

### 2.2 桶 spec 文件（每桶一份 JSON，orchestrator 生成）

写到 `.omc/codex-prompts/explore-spec-<BUCKET-ID>.json`，示例（C1 ChatGPT main-chat 基础）：

```json
{
  "bucket_id": "C1",
  "service": "chatgpt",
  "profile": "chatgpt",
  "cdp_port": 9223,
  "native_port": 12306,
  "backend": "extension-assisted-cdp",
  "capabilities": [
    {
      "id": "chatgpt-send-basic",
      "cli_command": "webai:chatgpt:send-prompt",
      "args": { "prompt": "say only OK", "response_timeout_ms": 60000 },
      "expected_output_keys": ["response_text", "model_used", "chat_url", "completion_detected"],
      "closure_criterion": "response_text non-empty AND completion_detected===true"
    },
    {
      "id": "chatgpt-select-model",
      "cli_command": "webai:chatgpt:select-model",
      "args": { "model": "<from-bucket-context>" },
      "expected_output_keys": ["ok", "model_used"],
      "closure_criterion": "ok===true AND model_used matches request"
    },
    {
      "id": "chatgpt-send-thinking",
      "cli_command": "webai:chatgpt:send-prompt",
      "args": { "prompt": "Think step by step: 13 x 27 = ?", "thinking": true, "response_timeout_ms": 90000 },
      "expected_output_keys": ["response_text"],
      "closure_criterion": "response_text contains a thinking pattern (step / reasoning trace)"
    },
    {
      "id": "chatgpt-send-web-search",
      "cli_command": "webai:chatgpt:send-prompt",
      "args": { "prompt": "Today's headline from BBC, in one line", "web_search": true, "response_timeout_ms": 120000 },
      "expected_output_keys": ["response_text"],
      "closure_criterion": "response_text non-empty"
    }
  ]
}
```

Orchestrator 在 Stage 1 把全部 29 个 spec 文件生成出来（C1-C10 + L1-L9 + G1-G10）。

---

## 3. 阶段化执行（orchestrator 主控）

### Stage 0 — 环境就绪（同步，≤15 min）

- [ ] 串行启动 3 个 Chrome（间隔 ≥ 3 秒避 SingletonLock 竞争）
  - `DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority`
  - chatgpt 9223 / claude-9224 9224 / gemini-9225 9225
- [ ] 验证 3 个 native host `/ping`（curl 127.0.0.1:12306/12307/12308/ping，全 200 才通过）
- [ ] 校对 `chrome.storage.local.nativeServerPort` per profile（如果缺，用 evaluate 注入）
- [ ] 跑 3 个 smoke：每 service 一条 `send_prompt --backend extension-assisted-cdp` "ping" 短测
- [ ] **smoke 不过即停**，写 `.runs/capability-explore-2026-05-25/_stage0-blocker.md`

### Stage 1 — 撰写 spec 文件 + 通用模板（同步，≤20 min）

- [ ] 写通用模板 `.omc/codex-prompts/_explore-bucket-template.md`（§2.1）
- [ ] 生成 29 个 spec JSON：`.omc/codex-prompts/explore-spec-<BUCKET-ID>.json`
  - 10 个 ChatGPT：C1-C10
  - 9 个 Claude：L1-L9
  - 10 个 Gemini：G1-G10
- [ ] 写 lane runner 脚本 `.omc/skills/_explore-lane-runner.sh`（per-lane serial 串桶的 bash 调度器，见 §2.3）

### Stage 2 — 创建 3 个 worktree + 启动 3 个 lane runner（≤5 min）

- [ ] `git worktree add ../wahub-explore-chatgpt -b explore-chatgpt`
- [ ] `git worktree add ../wahub-explore-claude -b explore-claude`
- [ ] `git worktree add ../wahub-explore-gemini -b explore-gemini`
- [ ] 三个 lane runner 后台启动（nohup）：
  - `/tmp/explore-lane-chatgpt.sh` → `nohup bash _explore-lane-runner.sh chatgpt C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 > /tmp/explore-lane-chatgpt.log 2>&1 &`
  - `/tmp/explore-lane-claude.sh`  → `nohup bash _explore-lane-runner.sh claude  L1 L2 L3 L4 L5 L6 L7 L8 L9 > /tmp/explore-lane-claude.log 2>&1 &`
  - `/tmp/explore-lane-gemini.sh`  → `nohup bash _explore-lane-runner.sh gemini  G1 G2 G3 G4 G5 G6 G7 G8 G9 G10 > /tmp/explore-lane-gemini.log 2>&1 &`

**Lane runner 调度逻辑**（关键，写到 `_explore-lane-runner.sh`）：

```bash
#!/usr/bin/env bash
set -uo pipefail
SERVICE=$1; shift
WORKTREE="../wahub-explore-${SERVICE}"
for BUCKET in "$@"; do
  echo "[$(date -Iseconds)] dispatch $SERVICE/$BUCKET"
  cd "$WORKTREE"
  # 串行 dispatch，前一个 exit 后才启下一个
  omx exec -C "$PWD" --skip-git-repo-check \
    --dangerously-bypass-approvals-and-sandbox \
    -c model_reasoning_effort="xhigh" \
    -o ".omc/codex-out/explore-${BUCKET}.md" \
    --env BUCKET_ID="$BUCKET" --env BUCKET_SPEC=".omc/codex-prompts/explore-spec-${BUCKET}.json" \
    - < .omc/codex-prompts/_explore-bucket-template.md \
    || echo "[$(date -Iseconds)] bucket $BUCKET exited non-zero, continuing"
  # 每桶之间 sleep 10s 让 Chrome 喘口气
  sleep 10
done
echo "[$(date -Iseconds)] lane $SERVICE all buckets done"
touch ".runs/capability-explore-2026-05-25/${SERVICE}/_lane-done.marker"
```

### Stage 3 — 监控（持续 4-6 小时；orchestrator 每 20-30 min 醒一次）

**多重兜底监控**（粒度细到 per-bucket）：

1. **心跳监控**: 读 `.runs/.../<service>/heartbeat.log` 最后一行（每 cap 一行）
   - 如果 timestamp 与现在差 >15 min → 当前桶疑似卡死
2. **Lane runner 进程监控**: `pgrep -af "_explore-lane-runner.sh ${service}"` 应该一直在
3. **当前桶 codex 进程监控**: `pgrep -af "omx exec.*explore-${BUCKET}"` 看当前桶
4. **Lane log tail**: 读 `/tmp/explore-lane-<service>.log` 最后 30 行（看 dispatch 行进度）
5. **Bucket-level done marker**: 每桶 codex 出 → `.omc/codex-out/explore-<BUCKET>.md` 大小固定 + lane log 出现下一桶 dispatch 行
6. **Evidence 文件计数**: `ls .runs/.../<service>/*.json | wc -l` 应单调递增（最终对到 16-18 个 cap）
7. **TaskCreate Monitor**: 对 heartbeat.log 起 persistent Monitor，新 cap 完成时通知

**deep-probe 触发条件**（满足任一）：
- 当前桶 heartbeat 停 >15 min 但 codex 进程在 → 卡死
- 当前桶 codex 进程消失但 lane log 没出现下一桶 dispatch → lane runner 卡
- Lane runner 进程消失但 `_lane-done.marker` 不在 → 异常退出

**deep-probe 行动**：
- 读最近 5 行 codex 输出（codex-out/explore-<BUCKET>.md）
- 检查对应 service 的 Chrome 是否还在（curl /json/version）
- 检查 native host 是否 alive（curl /ping）
- 必要时：
  - kill 卡住的 codex（pkill -f "omx exec.*explore-<BUCKET>"）
  - lane runner 会因为这次 omx exec exit 非零而继续到下一桶（不卡 lane）
  - 在 capability-library 标当前桶 caps 为 `crashed`

### Stage 4 — 三 lane 合并（≤30 min）

- [ ] 等三个 lane 都到达终态（complete / blocker）
- [ ] 串行 cherry-pick onto main（Phase 6 模式）
  - 顺序：claude → chatgpt → gemini（claude 改动最少先来）
  - 冲突走 **UNION 策略**（如 capability-library.json 都加新条目）
- [ ] 跑 5 gates：build / npm test / verify:contract-version / verify:golden / verify:no-launcher
- [ ] 8-lock check：pkg / contract / cmds / errs / webai_ / research_ / wah_ / golden tools 数
  - 如果命令数增加（新 capability 暴露为新 tool），contract 1.10.0 → 1.11.0
  - 如果只是 capability-library + workflow yaml 增加（不动 src/），contract 不动

### Stage 5 — 自闭环验证（再起 1 个 codex worktree，≤2 小时）

**目的**：用刚固化的 `examples/workflows/*.yaml` + `docs/capability-library.json`，独立 codex 跑一遍端到端，证明"我们自己能闭环"。

写 prompt 到 `.omc/codex-prompts/closure-validate-2026-05-25.md`：

```
# Task: 用 Stage 4 固化的 workflow yaml 跑端到端验证

## Repo
/home/l1u/workspace/noeticmind/web-ai-capability-hub

## 任务
1. 读 docs/capability-library.json，列出所有 status=`ok` 的 capability（约 40-50 条）
2. 对每条 ok capability，找到对应的 examples/workflows/<service>-<capability>.yaml
3. 调用 `node dist/src/cli.js workflow:run <yaml-path> --json` 端到端跑一遍
4. 收集 evidence 到 .runs/capability-explore-2026-05-25/closure/<service>/<capability>.json
5. 对比 evidence 与 capability-library 声明的 schema/output_shape
6. 标记每条 capability：
   - `green`: workflow:run 成功 + evidence 与声明一致
   - `red`: workflow:run 失败 OR evidence 不一致
   - `red` 的 capability 在 capability-library 状态回写为 `unstable`
7. 输出闭环总结到 .runs/capability-explore-2026-05-25/closure-report.md：
   - 总数 / green / red / fail-closed
   - red 列表 + 各自的 errorCode + cause
   - 建议人工二次确认列表

## 退出条件
- 所有 ok capability 都跑过一遍（green/red 终态）
- 输出 closure-report.md
- 耗时 > 2 小时即停

## 兜底硬性约束
- 不准 force push / 修 git config
- workflow:run 失败不准 retry 死循环（最多 1 次重试）
```

### Stage 6 — Commit + Push + Stop（≤10 min）

- [ ] 单 commit："webai: capability inventory + workflow recipes (3-service explore + self-closure verification)"
- [ ] 无 auto-close 关键字
- [ ] `git push origin main`
- [ ] 把 closure-report.md 路径 + green/red 数量贴回 conversation summary
- [ ] Loop 自然终止（不再 ScheduleWakeup）

---

## 4. Overnight 无人值守自决规则总表（per-bucket 粒度）

| 触发 | 行动 |
|---|---|
| Gemini Veo quota 耗尽 | 该 cap 标 `quota-limited`，记 `EXTERNAL_QUOTA_EXHAUSTED`，**桶内继续下一个 cap，不切 profile** |
| ChatGPT image2 配额耗尽 | 同上 |
| Cloudflare challenge 弹窗 | 当前桶级 blocker（不是 lane 级）；lane runner 继续下一桶 |
| 登录态丢失（LOGIN_REQUIRED） | 当前桶级 blocker；lane runner 继续下一桶 |
| 单桶 codex 心跳停 >15 min | deep-probe；必要时 kill 该桶 codex（lane runner 自动跳到下一桶） |
| 整 lane runner 进程消失但无 done marker | 重启该 lane runner，跳过已完成桶继续 |
| Chrome 实例死掉 | 重启该 service 的 chrome + native host；当前桶 codex 大概率失败，lane runner 继续下一桶 |
| Cherry-pick 冲突 | UNION 策略（Phase 6 已验证） |
| 5 gates 中任一失败 | 排根因 → 修 → 再跑；2 次失败即 STOP 写 blocker |
| 单桶 ≤3 caps 全 fail-closed | 写桶级 blocker，标 capability-library 全 fail-closed，lane 继续 |
| 同 service 累计 >50% caps fail-closed | lane runner 完成剩余桶后写 lane 级 blocker（用户白天手动处理） |
| 任何 unauthorized 动作（force push / 删表 / 越权） | 即 STOP |
| 总耗时超过 12 小时 | STOP，写当前进度报告，让用户白天手动处理剩余部分 |

---

## 5. 输出物清单（供用户睡醒后查看）

**主要交付**：
1. `docs/capability-library.json` — 三 service capability 清单（含 status / errorCode / output_shape / tool_mapping）
2. `examples/workflows/<service>-<capability>.yaml` — 每条 ok capability 一份端到端 recipe
3. `.runs/capability-explore-2026-05-25/closure-report.md` — 闭环验证总结
4. 一个 commit 落到 origin/main

**evidence/log**：
5. `.runs/capability-explore-2026-05-25/<service>/<capability>.json` — 每次探查的原始结构化 evidence（约 50 个）
6. `.runs/capability-explore-2026-05-25/<service>/heartbeat.log` — 心跳（每 cap 一行）
7. `.omc/codex-out/explore-<BUCKET-ID>.md` — 每桶一份 codex stdout（约 29 个：C1-C10/L1-L9/G1-G10）
8. `.omc/codex-out/closure-validate.md` — 闭环验证 codex stdout
9. `/tmp/explore-lane-<service>.log` — 三个 lane runner 调度 log
10. `.runs/capability-explore-2026-05-25/<service>/_lane-done.marker` — lane 完成 marker

**blocker report**（如有）：
11. `.runs/capability-explore-2026-05-25/<service>/<BUCKET-ID>-blocker.md` — 桶级 blocker（阻塞原因 + 当前 evidence + 恢复建议）
12. `.runs/capability-explore-2026-05-25/<service>/_lane-blocker.md` — lane 级 blocker（>50% caps fail-closed 时）

---

## 6. 启动前 checklist（给用户）

启动 goal 模式前请确认：
- [ ] 3 个 Chrome 实例已经 unpacked extension 加载
- [ ] 3 个 chrome profile 都已经登录账号（chatgpt / claude / gemini）
- [ ] `DISPLAY=:0` 屏幕可用（不能黑屏锁屏，否则 chrome 会被 X server 拒）
- [ ] 磁盘空间 > 5 GB（视频/文档/图片产物会落盘）
- [ ] 不会有人物理使用这台设备（避免 chrome 窗口被关闭、Cloudflare 弹窗未处理）

启动指令例：
```
/oh-my-claudecode:autopilot 按 docs/plans/web-ai-capability-explore-overnight-2026-05-25.md 跑到 Stage 6 完成停止
```

---

## 7. 已知风险（向用户透明）

- **Cloudflare bot 风险**: 频繁自动化操作可能触发 challenge；防御策略是每 capability 后 sleep 5-10 秒，但不保证 100% 不被拦
- **Gemini Veo 配额**: 单账号有日配额上限，撞墙后 fail-closed 是预期行为
- **Codex xhigh token 开销**: 3-4 个 worktree 并行 xhigh 4-8 小时，token 总量较大；用户已表态使用最新基座（更省 token）
- **Push 授权**: 用户已显式确认（"A+"）Stage 6 自动 push 到 origin/main 是被授权的，延续 Phase 6 的 push 先例。

启动后，所有自治判断遵循 §4 表格。任何超出表格的情况一律 STOP 写 blocker。
