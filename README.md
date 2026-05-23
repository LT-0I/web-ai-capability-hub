<div align="center">

# web-ai-research-automation-hub

**本地优先的 Web-AI 与科研数据库浏览器自动化中枢**

通过可见、用户授权的浏览器会话,编目、查询并执行 Web-AI 界面工作流与受权科研数据库自动化。

[![version](https://img.shields.io/badge/version-0.9.0-blue)](#)
[![contract](https://img.shields.io/badge/consumer--contract-1.7.0-blueviolet)](docs/CONSUMER_CONTRACT.md)
[![tests](https://img.shields.io/badge/tests-370%2F370%20passing-success)](#)
[![node](https://img.shields.io/badge/node-%E2%89%A520-339933)](#)
[![license](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)

**简体中文** ｜ [English](README.en.md)

</div>

---

> **状态 — `v0.9.0`(首个稳定、功能较为健全的版本)。** 公共面 `consumer-contract-1.7.0`,包版本 `0.9.0`。清洁构建通过,完整测试套件 **370/370 全过**。Apache-2.0,Node ≥ 20。

本项目面向个人/本地开发与受权科研工作流。它**不**绕过登录、付费墙、CAPTCHA、机器人检测、速率限制、许可限制或服务条款。用户在正常可见浏览器 profile 中**手动登录**,本项目经 Chrome DevTools Protocol(CDP)复用该会话,**不导出 cookie 或凭据**。当 UI/访问路径漂移或遇墙时,返回**稳定合约错误码**——绝无静默兜底,绝无合成工件。

## 目录

- [这是什么](#这是什么)
- [核心特性](#核心特性)
- [公共面(消费者合约)](#公共面消费者合约)
- [快速开始](#快速开始)
- [作为标准 MCP 服务调用](#作为标准-mcp-服务调用)
- [NoeticBraid v3.2 一期范围](#noeticbraid-v32-一期范围)
- [架构](#架构)
- [项目结构](#项目结构)
- [CLI 命令](#cli-命令)
- [MCP 工具与资源](#mcp-工具与资源)
- [能力目录](#能力目录)
- [安装与配置](#安装与配置)
- [开发](#开发)
- [安全与数据处理](#安全与数据处理)
- [贡献](#贡献)
- [许可证](#许可证)

## 这是什么

`web-ai-research-automation-hub` 是一个 TypeScript 包,它:

- 经 CDP 浏览器自动化**编目** Web-AI 界面能力(Gemini、ChatGPT、Claude)。
- 用 SQLite 存储能力元数据形成可查询知识库,提供无依赖 JSON 回退与 JSON 导入/导出。
- 提供 **MCP 服务器**(stdio),供 AI 智能体查询能力并驱动浏览器工作流。
- 支持并行命名标签编排,实现多任务自动化。
- 暴露一个版本化、受合约锁定的公共面,分为两个相互独立的工具族:
  - **37 个 `webai_` 工具** —— ChatGPT / Claude / Gemini 自动化。
  - **120 个 per-DB `research_*` 工具** —— 跨 40 个学术研究数据库的**独立科研数据库子 MCP**。

## 核心特性

- 🧭 **观察优先,绝不合成** —— 每个数据库均经交互式 observe-first 映射,遇墙以诚实错误码失败,不伪造结果。
- 🔒 **契约化公共面** —— 全部 CLI/MCP/TS 表面经 `configs/consumer-contract.json` 版本化并回环测试;合约升级是审慎行为。
- 🧱 **安全消费者脱敏** —— 23 个禁止字段(`cdpEndpoint`、`cookies`、`profileDir`…)永不下发;默认开启 trace 脱敏。
- 🖱️ **可信手势自动化** —— 对反自动化 SPA 用 CDP `Input.dispatchMouseEvent` 真实手势 + 只读 `connectOverCDP` 观察器,合成点击失效处自动改用。
- 🗂️ **40 库科研覆盖** —— AIAA、IEEE、ACM、Web of Science、Springer、ScienceDirect、IncoPat、万方等,每库提供 检索/筛选/导出。
- ✅ **可复现** —— 清洁构建 + 370/370 测试 + 合约零孤儿 + 锁全守恒。

## 公共面(消费者合约)

完整 CLI / MCP / TS 公共面经 `configs/consumer-contract.json`、`docs/CONSUMER_CONTRACT.md`、`tests/consumerContract.test.ts` 版本化并三方回环。合约升级是审慎行为;同一 minor 内的增量式 per-DB 扩张**不**升版。

当前锁(`consumer-contract-1.7.0`,`package 0.9.0`):

| 表面 | 数量 |
| --- | --- |
| `webai_` 工具(ChatGPT / Claude / Gemini) | **37** |
| per-DB `research_*` 工具(40 库 × 检索/筛选/导出) | **120** |
| `research_inventory_import`(种子导入器) | 1(合计 121 个 `research_` 前缀行) |
| 子 MCP 工具 | **11** |
| 稳定错误码 | **32** |
| 对安全消费者脱敏的 `forbidden_output_fields` | **23** |

### Web-AI 工具(37)

- **ChatGPT(14)** —— 发送提示、上传问答、深度研究、Canvas 导出、图像/文件生成、Pulse(获取/onboard)、会话与工作区管理、Codex 集成(提交任务/状态/diff/列环境)。
- **Claude(10)** —— 发送提示、上传问答、深度研究、文件生成、会话与工作区管理、Design(建项目/生成/取 HTML/演示)。
- **Gemini(12)** —— 发送提示、上传问答、深度研究、图像/视频生成、Canvas(编辑/转 Docs)、音乐(生成/状态/下载)、会话与工作区管理。
- 外加 `webai_task_status`。

三个服务运行于独立受管 profile 与独立 CDP 端口(ChatGPT `9223`、Claude `claude-9224` 于 `9224`、Gemini `9225`)。浏览器启动串行化(共享 singleton-lock),宿主机需 `DISPLAY` + `XAUTHORITY`。

### 科研数据库子 MCP(40 库 / 120 工具)

与 webai 工具**相互独立**的数据库表面(非 `webai_`,非子 MCP 条目)。每库暴露 `research_<db>_search`、`research_<db>_filter`、`research_<db>_export`。已接线数据库:

```
aiaa  wos  acm  ieee  acs  asme  rsc  wiley  asce  iop
tandf sae  sciencedirect aps emerald cambridge springer nature iet aip
mdpi  optica proquest frontiers arxiv siam degruyter worldsci royalsoc scoap3
dblp  scielo inspirehep pubscholar opticsjournal crc cellpress iest
incopat wanfang
```

每库均经 observe-first 交互映射(Opus-effort=max,无合成),固化为自包含模块(`src/mcp/researchdb/<db>/{flow,tools}.ts` + 单元测试),再经一次合并合约回环接线。per-DB 范围仅限内置高级检索、筛选/refine、引文/文件导出。对反自动化 SPA 采用可信 CDP 手势 + 只读 `connectOverCDP` 观察器。处于登录/配额/授权墙后的库返回稳定合约错误码(`HUMAN_HANDOFF_REQUIRED`、`LOGIN_REQUIRED`、`PLAN_OR_QUOTA_REQUIRED`、`MODE_UNCERTAIN`…),绝无静默兜底或伪造工件。

## 快速开始

```bash
git clone https://github.com/<username>/web-ai-capability-hub.git
cd web-ai-capability-hub
npm install
npx playwright install chromium
npm run build
npm test                       # 370/370 通过

# 启动可见 profile 并手动完成登录
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini \
  --url https://gemini.google.com/app --cdp-port 9225 --json

# 作为 MCP 服务器运行
node dist/src/cli.js mcp
```

## 作为标准 MCP 服务调用

GitHub Release 会附带 `web-ai-research-automation-hub-0.7.0.tgz`。消费者可直接安装并把 MCP 客户端指向专用 stdio 二进制：

```bash
npm i -g ./web-ai-research-automation-hub-0.7.0.tgz
web-ai-research-automation-hub-mcp
```

也可不全局安装：

```bash
npx -y --package ./web-ai-research-automation-hub-0.7.0.tgz web-ai-research-automation-hub-mcp
```

通用 `mcpServers` 配置（Claude Desktop 的 `claude_desktop_config.json` 也使用同一形状）：

```json
{
  "mcpServers": {
    "web-ai-research-automation-hub": {
      "command": "web-ai-research-automation-hub-mcp",
      "args": []
    }
  }
}
```

该服务器通过 stdio 暴露既有 `webai_`、`research_`、子 MCP 工具与资源；服务名和版本从 `package.json` 读取。详见 [`docs/MCP_SERVER.md`](docs/MCP_SERVER.md)。

## NoeticBraid v3.2 一期范围

> （2026-05-12 记录,δ demo day-0,Part 2.C #7 —— 这是刻意保留的范围记录,非陈旧内容）

按 NoeticBraid 一期 MUP(`PROJECT_DEFINITION_v3.2.md` §5.2 / §10.4 与 Codex II 审计 Part 2.C #7 + Part 5 #4),本中枢仅一项能力在一期范围内:

- ✅ **四端基础健康检查**:Claude Code CLI / Codex CLI / Gemini CLI / Gemini Web(SDD-D2-03 能力真实健康检查所消费的参考实现 —— 提交 `f06b044`)。

一期范围**外**(暂停 / 推迟至二期+):

- ❌ 机构科研数据库 —— 违反 v3.2 §4“External Reference Pool 仅存 AI 元知识,不存领域知识”(110-112 行)。
- ❌ 工作流执行器 / 定时任务 —— 一期仅允许手动触发(v3.2 §10.4 cron 推迟)。
- ❌ ChatGPT Web / Claude Web 适配器 —— 一期 MVP 端集合仅 Claude Code CLI / Codex CLI / Gemini CLI / Gemini Web(v3.2 §5.2)。
- ❌ `WAH_AUTO_CONFIRM` 自动确认开关 —— 一期对任何 发送/下载/导出/删除/分享/发布/支付/账户变更 强制手动确认(v3.2 §7.2 用户主体红线)。

上述特性留在本仓库供参考与未来阶段,但**不得**接入 NoeticBraid 一期代码路径。

## 架构

**能力数据库** —— SQLite(装有 `better-sqlite3` 时)位于 `data/capability-hub.sqlite`,带无依赖 JSON 回退。存储服务目标、浏览器 profile、页面捕获、UI 元素、能力及版本、工作流定义/运行、运行事件、工件、站点注册项、定时任务、策略事件;维护可搜索能力文本;支持 JSON 导入/导出。

**CDP 浏览器自动化** —— Playwright 经 CDP 连接可见 Chrome/Chromium/Edge,在 `data/browser-profiles/<profile>` 启动或复用持久 profile。页面读取为结构化快照(文本、元素、表单、表格、列表、iframe、选择器候选、可选截图/无障碍)。标签经注册表跟踪以并行作业。

**Lite 快照模式** —— `browser:read`、`browser:screenshot`、`capability:update` 与快照路径接受可选 `--mode lite`,丢弃非交互文本、无障碍树、空字段与截图负载(典型落地页减约 76% 字节,不丢交互元素标签)。默认模式不变。

**MCP 服务器** —— stdio 运行(`node dist/src/cli.js mcp` / `npm run mcp`),暴露浏览器、能力、工作流、站点注册、维护工具,以及 37 个 `webai_` 与 120 个 `research_*` 工具,外加 JSON 资源。

**工作流编译器与执行器** —— 将 YAML/JSON 工作流定义编译为具体浏览器动作计划,将抽象能力引用解析为能力库中的选择器。支持 dry-run、工作流测试与审批门;高危动作(发送、下载/导出、删除、发布/分享、购买、账户变更、批量)需显式审批。

**下载管理与工件** —— 在 `data/downloads/` 捕获浏览器原生下载,在能力库记录工件元数据,二进制/运行时目录排除出 git。

**健康检查系统** —— 对照当前 UI 选择器校验能力新鲜度,报告 `ok`/`missing`/`ambiguous`/`blocked`/`needs_review`,可选 `--apply` 回写状态。

## 项目结构

```text
src/                    TypeScript 源码
  actions/              浏览器动作执行与确认策略
  adapters/             Web-AI 适配器与科研库导入器
  artifacts/            工件元数据助手
  browser/              受管 CDP 启动器、profile、标签、会话、下载
  capabilities/         SQLite/JSON 库、schema、迁移、提取器、更新器
  maintenance/          站点图捕获/diff/探测
  mcp/                  MCP 服务器、工具、资源、schema
    researchdb/         40 个 per-DB 科研模块({flow,tools}.ts)
  observe/              快照助手、脱敏、IP 登录检测
  reader/               DOM/无障碍/截图/页面快照提取
  recipes/              YAML recipe 加载器与引擎
  safety/               策略/脱敏助手
  shared/               共享 TypeScript 类型
  utils/                路径、schema、YAML、日志、可选导入
  workflows/            工作流 schema、编译器、执行器、安全策略
configs/                profile/目标/刷新/适配器/recipe/合约 配置
scripts/                目录导入与选择器回填脚本
tests/                  Node test-runner 测试
data/                   精选目录 + 被忽略的运行时数据/库/工件
dist/                   编译输出(git 忽略)
docs/                   消费者合约、集成与工作流说明
examples/               示例工作流
fixtures/               Mock Web-AI/科研页面与样例注册表
```

## CLI 命令

从源码运行前先构建:

```bash
npm run build
node dist/src/cli.js --help
```

- **浏览器** —— `browser:launch` / `browser:status` / `browser:open` / `browser:read` / `browser:screenshot` / `browser:click` / `browser:type` / `browser:select` / `browser:press` / `browser:hover` / `browser:drag` / `browser:wait` / `browser:upload` / `browser:download-url` / `browser:artifact-click` / `browser:tab:alloc|free|list` / `browser:close --mode disconnect|close-process|leave-open`。请用 `browser:launch --profile <name> --cdp-port <port>`(勿用遗留的 `browser:start`)。
- **能力** —— `capability:init-db` / `capability:update` / `capability:query` / `capability:import` / `capability:export` / `capability:health-check`。
- **工作流** —— `workflow:list` / `workflow:compile` / `workflow:test` / `workflow:run [--dry-run]`。
- **科研库** —— 40 个已接线库各自的 `research:<db>:search|filter|export`(`export` 需 `--confirmed`)。
- **MCP / 注册** —— `mcp` / `mcp:tools` / `mcp:resources` / `site:registry:import` / `site:capture-map` / `adapter:list` / `web-ai:adapters` / `recipe:list` / `snapshot:capture|diff` / `consumer:health` / `verify:docx-min`。

所有命令支持 `--json`。Web 自动化默认标签选择需显式 `--tab-url-contains` 或 `--url`;工具拒绝静默选取 `pages()[0]`。

## MCP 工具与资源

代表性工具:`browser_launch`、`browser_status`、`browser_pages`、`browser_open`、`browser_read`、`browser_screenshot`、各浏览器动作工具、`capability_update`、`capability_query`、`capability_export`、`workflow_compile`、`workflow_run`、`consumer_health`,以及 37 个 `webai_*` 与 120 个 `research_*_{search,filter,export}` 工具。

资源:`capabilities://targets`、`capabilities://target/{targetId}`、`capabilities://target/{targetId}/latest`、`workflows://definitions`、`workflows://runs`、`browser-profiles://list`、`site-registry://sites`。

## 能力目录

为 Gemini / Claude / ChatGPT 迁移与查询工作流预编目,作为项目交付物与可复现锚点。

- **Gemini** —— 612 项能力(603 项跨 canvas、图像、视频、音频、Deep Research、引导学习、Gems、个性化、分享/导出 手动探索;9 项 DOM 发现的选择器记录)。
- **Claude & ChatGPT** —— 同一交付模式,locale 配对 JSON。Claude 基础 `*.json` 为英文捕获,ChatGPT 基础 `*.json` 为中文 locale 捕获;均保留 `*.en.json` 变体。

跟踪目录文件:`data/gemini_*.json`、`data/claude_*.json`、`data/chatgpt_*.json`、`data/locale_diff_report.json`、`data/t30_article.txt`。运行时/再生文件(SQLite、profile、截图、下载、日志、站点图、标签状态、`.runs/` 证据、`dist-*` 构建 outDir)均 git 忽略。

## 安装与配置

**前置**:Node.js ≥ 20、`npm install`、`npx playwright install chromium`、启用远程调试的 Chrome/Chromium。

**受管浏览器启动**(经项目 profile/CDP 管理器):

```bash
DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  node dist/src/cli.js browser:launch --profile gemini \
  --url https://gemini.google.com/app --cdp-port 9225 --json
```

远程宿主机上 `DISPLAY` + `XAUTHORITY` 为**必需**——否则 Chrome 进入 headless 被 Cloudflare 拦截。多次启动需串行化。

**环境变量**:

```bash
export WAH_CDP_ENDPOINT=http://localhost:9222
export WAH_CONNECT_CDP=true
export WAH_SQLITE_PATH=data/capability-hub.sqlite
# 可选:
export WAH_DEFAULT_PROFILE=gemini
export WAH_DATA_DIR=data
```

## 开发

```bash
npm run build        # npm run clean && tsc -p tsconfig.json
npm test             # npm run build && node --test dist/tests/*.test.js
node dist/src/cli.js --help
node dist/src/cli.js mcp:tools --json
```

重型实现(科研库模块、深度重构、验证扫描)经 `omx exec` 派发给 Codex,prompt 文件留痕于 `.omc/codex-prompts/`;仓内会话负责编排、把关、保持文档/合约同步。详见 `CLAUDE.md` 与 `docs/WORKFLOW_OMC_OMX_INTEGRATION.md`。

## 安全与数据处理

- 不绕 CAPTCHA、不用隐身工具、不输凭据、不做 IP/代理伪装、不改账单/账户、自动化期间不公开发布。
- 浏览器 profile、下载、截图、本地 SQLite、标签注册表、日志、站点图、`.runs/` 证据均排除出 git。绝不提交 `.env`、cookie、凭据或导出的 profile 数据。
- 遇登录墙、CAPTCHA、访问拒绝、条款提示、异常下载警告或许可敏感工作流即停止,并返回稳定合约错误码。无静默兜底,无本地合成工件。
- 优先 fixture 测试与 dry-run。高危动作需显式确认。

## 贡献

本项目采用**编排者派发**模型:仓内会话负责规划、写派发 prompt、把关证据、保持文档/合约同步;`src/`、`tests/`、`configs/` 的重型实现经 Codex(`omx exec`)派发并独立验收。任何新 CLI/MCP/TS 表面必须在同一派发中经 `configs/consumer-contract.json` + `docs/CONSUMER_CONTRACT.md` + `tests/consumerContract.test.ts` 三方回环。详见 `CLAUDE.md`。提交务必:清洁构建=0、`npm test` 全过、锁守恒、`git diff --stat` 范围最小。

## 许可证

[Apache-2.0](LICENSE)。
