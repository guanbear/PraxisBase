# Requirements Document

## Introduction

本项目旨在构建一个 **同时面向人和 AI 的、可自我更新的知识库工具**，参考 Karpathy 的 LLM Wiki 模式（[gist v1](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)、[v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)），并吸收 Anthropic 工程师 Thariq Shihipar 的 *The Unreasonable Effectiveness of HTML* 中"HTML 作为 AI 输出/呈现介质"的观点。

核心设计采用 **Hybrid 存储策略**：Markdown 作为源文件（LLM 读写、Git diff、嵌入索引友好），HTML 作为构建产物（人读、可交互、可分享、可作为 agent 的"experience object"），并在 HTML 中以 `<script type="application/markdown">` 内嵌 MD 原文，使 agent 在只拿到 HTML 时也能 round-trip 出原始知识。

工具以一个跨平台 **TypeScript CLI**（`kb-cli`）为核心 single source of truth，三种调度形态共享同一份核心代码：

- **GitLab CI Runner**（企业默认）：基于 GitLab Scheduled Pipelines 定时触发，更新走 MR 评审，HTML 站点用 GitLab Pages 部署
- **Local Runner**（开发/调试）：本地 cron 或手动触发
- **Hermes Runner**（Phase 2，个人/小团队 VPS）：作为可选的自托管自我学习 agent 后端

数据源以国内企业场景为主（飞书聊天、飞书文档、内部日志系统），并扩展本地文件、网页抓取、Git 仓库等基础 connector。LLM 以 OpenAI API 兼容协议为主接口，支持代理网关与国内 coding plan，Anthropic 原生作为兜底。

Agent 集成采用 **CLI + Skill** 模式：`kb-cli` 提供面向 agent 的子命令（`search`、`read`、`edit`），OpenClaw / Hermes 飞书机器人通过各自的 Skill 文件（纯 Markdown 指令）教 agent 调用这些 CLI 命令，实现在飞书群内直接查询和修改知识库。MVP 不做 MCP Server，Phase 3 按需升级。

参考开源项目：[VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB)、[atomicstrata/llm-wiki-compiler](https://github.com/atomicstrata/llm-wiki-compiler)（及 [ussumant/llm-wiki-compiler](https://github.com/ussumant/llm-wiki-compiler)）、[nashsu/llm_wiki](https://github.com/nashsu/llm_wiki)、[OpenHuman-ai/OpenHuman](https://github.com/OpenHuman-ai/OpenHuman)、[Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything)、[Hermes Agent](https://hermes-agent.nousresearch.com/)、[OpenClaw](https://github.com/openclaw/openclaw)。

## Alignment with Project Vision

> 本仓库为新建项目，无既有 vision 文档。本 spec 即为 v0 vision 锚点。

核心信念：

1. **MD 是 LLM 的"母语"，HTML 是给人和 agent 的"交付物"。** 两者不是替代关系，而是分工。
2. **知识库本身要是版本化的工程产物**：每次更新 = 一个 commit / MR，可审、可回滚、可 diff。
3. **采集器、抽取器、构建器都是"可换零件"。** Runner 抽象层让我们不被任一 agent 框架（Hermes / OpenClaw / Claude Code / 自有脚本）绑死。
4. **国内企业场景优先**：飞书、内部日志、私有 GitLab、合规与 PII 脱敏在 MVP 就考虑。

## Requirements

### Requirement 1: Hybrid 存储与构建管线（MD 源 → HTML 出）

**User Story:** 作为知识库的维护者，我希望源文件以 Markdown + frontmatter 形式存放在 Git 仓库中，并由 CLI 一键构建出可独立运行的静态 HTML 站点，使 LLM 摄入与 Git 评审走低 token、清晰 diff 的 MD，而最终读者获得交互友好的 HTML 体验。

#### Acceptance Criteria

1. WHEN 用户运行 `kb-cli build` THEN 系统 SHALL 读取 `kb/notes/**/*.md` 中的所有源文件，并在 `dist/` 目录产出对应的静态 HTML 站点。
2. 每个源 `.md` 文件 SHALL 包含 YAML frontmatter，至少含 `id`、`title`、`updated_at`、`sources[]`（每条 source 含 `uri`、`fetched_at`、`hash`）、`tags[]`、`links[]` 字段。
3. WHEN 构建 HTML 时 THEN 每个产出的 `.html` 文件 SHALL 在 `<head>` 中嵌入 `<script type="application/markdown" id="kb-source">` 节点，包含该页对应的原始 MD 全文（含 frontmatter）。
4. 产出的 HTML 站点 SHALL 是纯静态资源（HTML + CSS + 客户端 JS），不依赖任何后端服务即可在 `file://` 协议或任何静态服务器上运行。
5. 站点 SHALL 至少包含：首页 `index.html`（全局索引 + 最近更新）、按标签的索引页、每篇笔记页（含 backlinks、source 引用、最后更新时间、关联笔记）。
6. WHEN 一篇笔记的 `links[]` 引用了另一篇笔记 ID THEN 构建产物 SHALL 在两侧自动建立双向链接（forward link + backlink）。
7. 系统 SHALL 在 `dist/` 同时输出一份 `llms.txt`（[规范见 llmstxt.org](https://llmstxt.org/)）和 `kb-index.json`（机读全量索引），方便外部 agent 直接消费。

### Requirement 2: 数据源采集（MVP Connector 集合）

**User Story:** 作为企业内部知识库的运维者，我希望工具能定时从我配置的数据源拉取原始内容，使我无需手动复制粘贴即可让知识库保持新鲜。

#### Acceptance Criteria

1. 系统 SHALL 提供统一的 `Connector` 接口，至少含 `list()`（列出可拉取的资源）、`fetch(resource)`（拉单条原文）、`incrementalSince(timestamp)`（增量拉取）三个方法。
2. MVP 阶段 SHALL 内置以下 connector：
   - **local-fs**：扫描本地目录的 `.md`、`.txt`、`.pdf`、`.docx`
   - **http-fetch**：抓取指定 URL 列表（含简单的 readability 抽取）
   - **git-repo**：克隆/拉取 Git 仓库，扫描指定 glob 路径
   - **feishu-chat**：通过飞书 Open API 拉取指定 `chat_id` 的群聊记录（chat_id 由用户在配置中显式指定）
   - **feishu-doc**：通过飞书 Open API 拉取指定 wiki_space / docx 文档
   - **internal-log**：从约定的 JSONL 文件或 HTTP endpoint 拉取结构化日志（必须含 `timestamp` 字段以支持增量）
3. 配置 SHALL 通过 `kb.config.ts`（或 `.json` / `.yaml`）声明数据源列表，每个数据源含 `id`、`type`、`schedule`（cron 表达式）、`params`、`enabled` 字段。
4. WHEN connector 拉取到原始内容 THEN 系统 SHALL 把原文落地到 `kb/sources/<connector_id>/<resource_id>.<ext>`，并记录元数据（fetched_at、content hash、source URI）。
5. WHEN 同一资源的 hash 与上次拉取一致 THEN 系统 SHALL 跳过后续抽取流程（短路），避免重复消耗 LLM token。
6. **飞书 connector** SHALL 支持：白名单 `chat_id`、按 `update_time` 增量拉取、对消息内容默认做 PII 脱敏（手机号、邮箱、身份证号正则替换）、严格遵循飞书 API 限速并自动退避。
7. 当 connector 的认证凭据缺失或失效时，系统 SHALL 在日志中明确报错并跳过该 source，不阻塞其他 source 的执行。
8. **Phase 2 connector**（后续迭代，spec 中需保留扩展位但不强制实现）：RSS/Atom、Notion、Obsidian Vault、GitLab Issues+MR、Confluence。

### Requirement 3: LLM 抽取与笔记合并（Karpathy Wiki Loop）

**User Story:** 作为知识库的维护者，我希望系统能让 LLM 阅读新拉取的原文，并以 Karpathy LLM Wiki 的方式增量地写入 / 更新 / 合并笔记，使知识库随时间累积而不是简单堆砌。

#### Acceptance Criteria

1. 系统 SHALL 在 `kb-cli ingest` 命令中实现完整的"采集 → 抽取 → 合并"流程：
   1. 调用所有启用的 connector 拉取新原文到 `kb/sources/`
   2. 对未处理过的 source 调用 LLM 抽取出候选事实/笔记片段（topic、claim、citation）
   3. 调用 LLM 对每个候选片段决策：**新建笔记** / **追加到已有笔记** / **修改已有笔记** / **丢弃（已存在或不重要）**
   4. 把决策应用到 `kb/notes/`，并更新 frontmatter 中的 `sources[]` 与 `updated_at`
2. LLM 抽取过程 SHALL 在每条 claim 上记录引用，使笔记中每个事实在 HTML 渲染时可点击跳转回原始 source 文件。
3. 系统 SHALL 维护一个全局 `kb/index.md`（人读）和 `kb/index.json`（机读）作为 LLM 决策时的"已知笔记目录"，避免 LLM 重复创建近似笔记。
4. WHEN LLM 决定修改已有笔记 THEN 修改 SHALL 以 patch 形式应用，且系统在 commit message 中记录被修改的笔记 ID 和触发它的 source。
5. 系统 SHALL 提供 `--dry-run` 模式，仅输出 LLM 的决策清单到控制台/文件而不真正改动笔记，供人工预审。
6. 系统 SHALL 提供 `--limit-sources <N>` 与 `--limit-tokens <N>`，对单次 ingest 设置成本上限，防止单次任务跑飞。
7. WHEN 一次 ingest 运行结束 THEN 系统 SHALL 输出一份 `ingest-report.md`，包含：本次拉取的 source 数、新建/修改/丢弃的笔记数、token 消耗、估算费用、错误清单。

### Requirement 4: Runner 抽象层与 GitLab CI 集成（默认调度）

**User Story:** 作为企业知识库的管理员，我希望调度逻辑与核心 ingest/build 解耦，能在 GitLab CI Scheduled Pipelines 上以低运维成本周期性运行知识库更新，并把更新走 MR 流程接受人审。

#### Acceptance Criteria

1. 系统 SHALL 定义 `Runner` 接口，至少含 `runOnce(taskSpec)`、`registerSchedule(scheduleSpec)`、`memory: MemoryAdapter` 三个能力。
2. MVP 阶段 SHALL 实现以下 Runner adapter：
   - **local-runner**：直接进程内执行，可选用本地 cron 触发
   - **gitlab-ci-runner**：以 `.gitlab-ci.yml` 形式提供模板，注册的 schedule 通过 GitLab Scheduled Pipelines 触发
3. 系统 SHALL 在仓库中提供一份开箱即用的 `.gitlab-ci.yml.example`，覆盖三个 job：
   - `kb:ingest`（scheduled 触发，跑采集+抽取，产出对 `kb/notes/` 的变更）
   - `kb:build`（任意触发，跑 MD → HTML 构建）
   - `kb:pages`（仅 main 分支触发，部署 `dist/` 到 GitLab Pages）
4. WHEN `kb:ingest` 在 CI 中跑出非空变更 THEN job SHALL 自动创建一个 MR（标题如 `chore(kb): auto-update YYYY-MM-DD`），而不是直接 push 到主干。
5. CI 模板 SHALL 通过 GitLab CI variables 注入所有敏感凭据（`OPENAI_API_KEY`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 等），不允许凭据写入仓库。
6. **Hermes Runner（Phase 2）** SHALL 作为可选 adapter 保留扩展位，文档中说明"个人/小团队 VPS 自托管"场景下可启用，MVP 不强制实现。
7. Runner 抽象 SHALL 在 `kb-cli` 内部使用，使同一份 `kb-cli ingest` 命令既可在本地直接跑，也可在 GitLab CI runner 中跑，也可未来在 Hermes skill 中跑，行为一致。

### Requirement 5: CLI 命令集与本地独立运行

**User Story:** 作为开发者，我希望脱离 GitLab 也能在本地用一个 CLI 完成"拉取 → 抽取 → 构建 → 预览"全流程，使我能在没有 CI 的环境（笔记本、个人 VPS）下独立运行整套知识库。

#### Acceptance Criteria

1. 系统 SHALL 提供一个名为 `kb-cli` 的 Node 20+ TypeScript CLI（通过 `pnpm` 管理），并支持 `npx kb-cli <command>` 直接运行。
2. CLI SHALL 至少提供以下子命令：
   - `kb-cli init`：在当前目录创建 `kb.config.ts`、`kb/` 目录骨架、`.gitlab-ci.yml.example`、`.gitignore`
   - `kb-cli ingest`：执行采集 + LLM 抽取 + 笔记合并（支持 `--dry-run`、`--source <id>`、`--limit-sources`、`--limit-tokens`）
   - `kb-cli build`：MD → HTML 站点构建（支持 `--out <dir>`、`--base <path>`）
   - `kb-cli serve`：本地起一个静态 HTTP 服务（默认端口 4567）预览 `dist/`
   - `kb-cli check`：lint 笔记格式、校验链接、校验 frontmatter
   - `kb-cli publish`：根据配置 push 到目标（git remote / GitLab Pages / 本地目录拷贝）
   - `kb-cli search <query>`：全文搜索笔记，输出匹配结果（支持 `--json` 机读格式、`--limit <N>`）
   - `kb-cli read <note-id>`：输出指定笔记的完整 MD 内容到 stdout（供 agent 管道消费）
   - `kb-cli edit <note-id> --patch <instruction>`：以自然语言指令让 LLM 修改指定笔记，产出 commit 或 MR（支持 `--dry-run`、`--yes`）
3. CLI SHALL 把所有日志输出到 `kb/.logs/<run-id>/run.log`，并对 LLM 交互记录 prompt 与 response 摘要（敏感信息脱敏）。
4. CLI SHALL 在缺少 `kb.config.ts` 时给出清晰报错并提示运行 `kb-cli init`。
5. CLI SHALL 在不带 `--yes` flag 时，对会修改 `kb/notes/` 的命令打印将要发生的变更摘要并要求确认。
6. `kb-cli search` 与 `kb-cli read` SHALL 为纯只读命令，不需要确认即可执行，适合被 agent 在 shell 中无交互调用。
7. `kb-cli edit` 在 CI 或 agent 环境中 SHALL 支持 `--yes` 自动确认 + `--branch <name>` 指定分支，使 agent 可以自动提交修改并开 MR。

### Requirement 6: LLM Provider 兼容（OpenAI API 兼容 + 代理 + 国内 coding plan）

**User Story:** 作为企业用户，我希望能任意切换 LLM 后端（公网 OpenAI、Anthropic、国内代理网关、阿里百炼 / DeepSeek / Kimi 等 coding plan、自部署 vLLM），使我的方案不被单一供应商绑定。

#### Acceptance Criteria

1. 系统 SHALL 以 **OpenAI Chat Completions API 兼容协议** 为主 LLM 接口，并允许配置 `baseURL`、`apiKey`、`organization`、自定义 `headers`（用于代理网关认证）。
2. 系统 SHALL 支持在配置中声明多个 provider profile，并在不同任务（如 `extract`、`merge`、`summarize`、`review`）上分别指定 profile（例如抽取用便宜模型、合并审查用强模型）。
3. 系统 SHALL 内置以下 provider profile 模板：`openai`、`openai-compatible-proxy`、`anthropic`（原生 SDK，作为兜底）、`deepseek`、`alibaba-bailian`、`moonshot/kimi`、`local-vllm`。
4. 系统 SHALL 实现 token 计费记账：每次 LLM 调用记录 prompt/completion token、估算费用，并在 `kb/.logs/<run-id>/cost.json` 汇总。
5. 系统 SHALL 实现自动退避与重试（429 / 5xx 指数退避），并在配置中允许设置 `maxRetries`、`maxConcurrency`。
6. 系统 SHALL 支持模型不可用时的 fallback chain（如 `primary: deepseek` 失败 → `fallback: openai-compatible-proxy`）。

### Requirement 7: 合规、安全、可观测

**User Story:** 作为企业管理员，我希望知识库的采集与产出过程可审计、可配置脱敏、不会把敏感数据意外提交到 Git，使该工具能在企业合规要求下使用。

#### Acceptance Criteria

1. 系统 SHALL 内置 PII 脱敏规则集（手机号、邮箱、身份证号、银行卡号、IP 地址），并允许用户在配置中扩展自定义正则。
2. WHEN connector 拉取到原文 THEN 系统 SHALL 在写入 `kb/sources/` 之前应用脱敏规则，并把"哪些片段被脱敏"记录到 source 的元数据。
3. 系统 SHALL 提供 `kb.config.ts` 中的 `secrets.allowlist[]` 与 `secrets.denylist[]`，denylist 命中时 hard fail（拒绝写入），allowlist 用于显式放行已审过的源。
4. 仓库 `.gitignore` 模板 SHALL 默认排除 `kb/.logs/`、`kb/.cache/`、`.env*`、所有 `*.secret.*` 文件。
5. 系统 SHALL 在每次 `ingest` / `build` 运行前进行 pre-flight check：凭据可用性、磁盘空间、关键路径写权限、LLM 健康探活，任一失败时拒绝继续。
6. 系统 SHALL 输出结构化日志（JSON Lines），关键事件（connector_fetch、llm_call、note_write、merge_decision、cost_record）SHALL 含 `run_id`、`task_id`、`timestamp`、`level`、`event`、`payload`。
7. 系统 SHALL 提供一个最小的 web 仪表盘（在 `kb-cli serve` 时挂在 `/_admin` 路径）展示最近 N 次 run 的状态、cost 汇总、错误统计；不提供则需在 spec 中明确标注为"Phase 2"。

### Requirement 8: HTML 站点的呈现与交互

**User Story:** 作为知识库的读者（人或 agent），我希望站点视觉清晰、可交互、可在移动端打开，使我能像浏览精心整理的 wiki 那样消费内容。

#### Acceptance Criteria

1. 站点 SHALL 提供：响应式布局（桌面/移动端）、深色模式切换、全文搜索（基于 Lunr 或 MiniSearch 的客户端索引）。
2. 笔记页 SHALL 渲染：标题、tags、最后更新时间、正文（含代码高亮、表格、图片、Mermaid 图）、来源 source 列表、双向 backlinks、关联笔记。
3. 站点 SHALL 提供"原始 MD"按钮，点击可展示当前页对应的源 MD（来自 `<script type="application/markdown">`）并支持一键复制。
4. 站点 SHALL 提供"喂给 LLM"快捷区：每页底部含一个按钮，点击后把当前页 MD + 配置的 prompt 模板 复制到剪贴板。
5. 站点首页 SHALL 含：最近更新的笔记列表、按 tag 的聚合、整库统计（笔记数、source 数、最近 ingest 时间）。
6. 站点 SHALL 支持站内笔记之间的 wiki link 语法（`[[note-id]]` 或 `[[note-id|display]]`），并在构建期校验失效链接。
7. 站点产出物 SHALL 满足 WCAG AA 级别的基础可达性（语义化标签、对比度、键盘导航）；完整 WCAG 合规需依赖人工测试与辅助技术验证，不在自动化范围内。

### Requirement 9: 笔记互链与 Wiki Link 语法（MD 层面）

**User Story:** 作为知识库的维护者或 LLM，我希望在 Markdown 源文件中就能用简洁的语法引用其他笔记，使笔记之间的关联在源码层面即可表达，不依赖 Obsidian 等特定工具。

#### Acceptance Criteria

1. 系统 SHALL 在 MD 源文件中支持 wiki link 语法 `[[note-id]]` 和 `[[note-id|显示文本]]`，这是纯文本约定，不依赖任何特定编辑器（Obsidian、VS Code、Typora 等均可编辑）。
2. WHEN `kb-cli build` 构建 HTML 时 THEN `[[note-id]]` SHALL 被渲染为指向对应笔记 HTML 页面的超链接；`[[note-id|显示文本]]` SHALL 使用自定义显示文本。
3. WHEN `kb-cli check` 运行时 THEN 系统 SHALL 校验所有 `[[...]]` 引用的 note-id 是否存在于 `kb/notes/` 中，不存在的 SHALL 报告为 broken link warning。
4. 系统 SHALL 同时支持标准 Markdown 相对路径链接 `[显示文本](./other-note.md)` 作为互链的备选方式，两种语法并存。
5. WHEN LLM 在 ingest 流程中创建或修改笔记时 THEN prompt 模板 SHALL 指导 LLM 使用 `[[note-id]]` 语法引用已有笔记，并在 frontmatter `links[]` 中同步记录被引用的 note-id 列表。
6. 构建器 SHALL 从所有笔记的 `[[...]]` 引用中自动计算 backlinks，无需手动维护 `links[]`（`links[]` 作为 LLM 写入的"显式声明"，构建器额外扫描正文中的隐式引用作为补充）。

### Requirement 10: Agent Skill 集成（飞书机器人读写知识库）

**User Story:** 作为团队成员，我希望在飞书群里 @机器人 就能查询、阅读、甚至修改知识库内容，使知识库的消费和维护不局限于 Git 操作或 Web 浏览。

#### Acceptance Criteria

1. 系统 SHALL 提供一份 **OpenClaw Skill 模板**（`skills/kb-wiki/SKILL.md`），内容为 Markdown 格式的 agent 指令，教 OpenClaw agent 如何通过 shell 调用 `kb-cli search`、`kb-cli read`、`kb-cli edit`、`kb-cli ingest --source http-fetch --url <url>` 来操作知识库。
2. OpenClaw Skill 模板 SHALL 包含：
   - 能力描述（"你拥有一个团队知识库，可以搜索、阅读、修改笔记"）
   - 每个 CLI 命令的用法示例与输出格式说明
   - 决策指引（"当用户问知识相关问题时，先 `kb-cli search` 查找；找不到时告知用户并建议添加"）
   - 安全约束（"不要在群聊中输出超过 500 字的笔记全文，给摘要 + 链接"）
3. Skill 模板 SHALL 假设 `kb-cli` 已安装在 agent 运行环境的 PATH 中，且知识库仓库已 clone 到约定路径（通过环境变量 `KB_ROOT` 指定）。
4. WHEN agent 通过 `kb-cli edit` 修改笔记 THEN 系统 SHALL 自动在 Git 中创建 commit（message 含 `[bot]` 前缀），并根据配置决定是直接 push 还是开 MR。
5. **Hermes Skill 模板（Phase 2）** SHALL 作为扩展位保留，格式与 OpenClaw 类似但遵循 Hermes skill 规范（`skill.md` + 可选 `config.yaml`）。MVP 阶段仅提供文档说明如何适配。
6. 系统 SHALL 在 `kb-cli init` 时可选生成 `skills/kb-wiki/SKILL.md`（通过 `--with-skill openclaw` flag），方便用户一键初始化 skill 文件。
7. **Phase 3 可选**：如果未来需要高频调用或多 agent 并发场景，可将 `kb-cli` 包装为 MCP Server（`kb-mcp-server`），skill 改为引用 MCP tools 而非 shell 命令。MVP 不实现 MCP Server。

## Non-Goals (MVP 不做)

为了控制 MVP 范围，以下能力 **明确不在第一版交付**：

- 多租户 / 组织 / 角色 / 细粒度权限（依赖 GitLab 自身的项目权限即可）
- RAG 向量检索（Karpathy 模式刻意不要 vector DB；如果未来要加，作为 Phase 3 可选 plugin）
- 实时协同编辑（HTML 站点是只读交付物，编辑走 Git）
- 桌面 GUI 客户端（参考 nashsu/llm_wiki，但本项目 MVP 是 CLI + 静态站）
- 企业 SSO 接入（依赖 GitLab Pages 自身的访问控制）
- 自动化的 WCAG 合规审计（仅做基础可达性 lint，完整 WCAG 验证依赖人工测试 + 辅助技术）
- Phase 2 connector：RSS/Atom、Notion、Obsidian Vault、GitLab Issues、Confluence、邮件、Slack、企微、SQL DB
- Hermes Runner adapter（保留扩展位，Phase 2 实现）
- Hermes Skill 模板（保留扩展位，Phase 2 实现）
- MCP Server（`kb-mcp-server`）：Phase 3 可选，当 CLI + Skill 模式无法满足高频/并发场景时再实现
- 知识图谱可视化（参考 Lum1104/Understand-Anything，作为 Phase 3 可选 plugin）

## Open Questions（已确认）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 飞书 chat_id 与凭据 | 后续把飞书机器人拉到目标群时再配置 chat_id；凭据通过飞书自建应用获取，运行时注入环境变量 |
| 2 | 国内 coding plan 范围 | 阿里云百炼 / DeepSeek-Coder / Moonshot Kimi / 智谱 GLM / 字节豆包，均通过 OpenAI 兼容协议接入即可 |
| 3 | GitLab 类型 | **Self-Managed**（Scheduled Pipelines 最小间隔可调至 1 分钟，Pages 部署走内网） |
| 4 | 预期规模 | 前期百~千篇笔记，远期可能到万级。设计时需考虑：客户端搜索在千级以下用 MiniSearch 内存索引；万级时可选分卷或 server-side search（Phase 3） |
| 5 | 导出能力 | MVP 不需要，仅静态站点即可 |
| 6 | HTML 样式定制 | MVP 提供一套标准模板即可，不需要 theme 包机制 |

---

## 确认与下一步

所有 Open Questions 已确认，requirements 已定稿（10 个 requirement）。下一步进入 **Design** 阶段，输出 `design.md`（系统架构图、模块划分、数据流、关键接口签名、目录结构、`.gitlab-ci.yml` 模板草稿）。
