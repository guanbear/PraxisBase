# PraxisBase Multi-Agent Experience Layer Design

日期：2026-05-19

## AI Handoff Brief

把这份设计交给另一个 AI 实施时，先让它只读本节，再按链接顺序读完整文档。

当前要做的是把 PraxisBase 从 OpenClaw/K8s 场景扩展成 **个人与团队多 agent 的经验层**。第一版只做 CLI/file protocol、adapter profile、native memory bridge、capture/outbox、raw vault、distill proposal 和 context retrieval 的基础能力；不要做深插件、GUI、向量库、中心数据库或完整平台。

实施顺序：

1. 读本设计文档，理解产品边界和四维知识模型。
2. 读实施计划：`docs/superpowers/plans/2026-05-19-multi-agent-experience-layer-implementation-plan.md`。
3. 读 OpenSpec：`docs/openspec/changes/multi-agent-experience-layer/`。
4. 读 BDD：`docs/bdd/multi-agent-experience-layer.feature`。
5. 按 M0 到 M6 分批实现，每批必须跑对应测试和 `pnpm check`。

硬性禁区：

- 不把 raw logs、完整 transcripts、飞书原文、tokens、cookies 或密钥写入 Git。
- 不让 memory import、memory refresh、capture、watch、distill 直接修改 `kb/` 或 `skills/`。
- 不自动把 `personal` 经验提升到 `team` 或 `org`。
- 不把各 agent 的原生记忆做成无审核的双向实时同步。
- 不引入 vector DB、外部搜索服务、队列或长驻数据库作为 MVP 前置依赖。
- 不为每个 agent 写深插件；agent 差异只放在 adapter profile、安装片段和可选 watcher 中。

## 背景

PraxisBase 最早从 LLM Wiki 和 OpenClaw 沙箱修复场景出发，但项目边界不应该停留在“某类修复知识库”。更准确的定位是：

> PraxisBase 是面向个人与团队多 Agent 的经验提炼、共享与演进基座。

OpenClaw、K8s、飞书工单是团队落地场景；Codex、Claude Code、OpenCode、Hermes、OpenHuman 等个人或项目内 agent 是更广泛的使用入口。它们都可能产生可复用经验：修复路径、踩坑记录、架构决策、项目偏好、团队规范、可复用 skill。

因此，PraxisBase 应该从 “agent knowledge substrate” 进一步扩展为 **multi-agent experience layer**：不同 agent 可以通过统一 CLI 读取经验、提交经历、生成提炼候选；稳定知识仍然通过 review、promotion、maturity 和 decay 治理。

## 目标与非目标

本设计补齐的是“多 agent 经验层”的产品和协议边界，不替代 Phase 1 OpenClaw 修复闭环，也不替代 Phase 2 知识治理规则。

目标：

- 让 Codex、Claude Code、OpenCode、Hermes、OpenClaw 和 generic agent 使用同一套 CLI/file protocol。
- 让各 agent 已有的原生记忆、技能、session 和偏好成为可蒸馏的上游来源，而不是被 PraxisBase 替代。
- 让个人、项目、团队、组织四种范围的经验可以被捕获、提炼、审核、晋升和检索。
- 让 hook、watcher、scheduled distill 三种捕获方式有明确职责，避免每轮对话都上传或直接写稳定知识。
- 让 raw transcript、日志、飞书消息等敏感原文留在 raw vault 或外部系统，Git 只保存 refs、hash 和 redacted summary。
- 让后续实现可以按 OpenSpec 和 BDD 分批落地，不把所有 agent 适配做成一个大而全插件系统。

非目标：

- 不在第一版实现深度 GUI、IDE 插件或浏览器扩展。
- 不要求每种 agent 都有原生 hook；能运行 CLI 或写 JSON outbox 即可接入。
- 不引入向量库、外部搜索服务或中心化长驻数据库作为 MVP 前置依赖。
- 不让自动化直接把 personal 经验提升为 team/org 知识。
- 不做各 agent 记忆之间的无审核双向实时同步。
- 不直接信任 Hermes、OpenHuman 或其他 agent 自己生成的 skill/knowledge；它们进入 PraxisBase 后仍然走 proposal/review/promotion。
- 不把完整对话、完整日志、token、cookie、密钥或飞书原文写入 Git。

## 参考思想

腾讯技术工程公众号文章《Harness不是目的，知识才是护城河》提出了几个与 PraxisBase 高度相关的判断：

- Harness 和工作流是手段，团队知识沉淀才是长期护城河。
- 知识应该按存储层、知识类型、成熟度三个维度组织。
- 知识库应有独立 Git 仓库、贡献暂存、异步合并和冲突队列。
- 工作流启动时注入知识入口，执行中按需查询，结束时 archive/extract。
- 三级渐进式索引和查询预算能避免 agent 一次性读取过多上下文。
- 引用追踪、lint、自动衰减和冲突检测能让知识库长期保持健康。
- 人机协作也要异步化，只有关键风险点需要人介入。

PraxisBase 不照抄这套五层目录，但吸收其核心思想：**知识是资产，workflow 是知识流动的载体，agent 是可替换的执行体**。

## 产品入口

PraxisBase 应同时支持个人和团队两个入口，底层协议统一。

### 个人入口

个人用户有多个 agent：Codex、Claude Code、OpenCode、Hermes、OpenHuman、本地脚本。它们经常在不同项目、不同工具链里工作，但会重复遇到相同偏好和经验。

个人入口要解决：

- 多个 agent 共享“我的偏好”和“我的项目经验”。
- 一个 agent 修过的问题，另一个 agent 下次能复用。
- 初始接入时可以扫描现有 agent memory、skills、sessions 和 instruction files，蒸馏成 personal/project proposals。
- Codex/Claude/OpenCode 的 session 经验可以提炼成 memory、pitfall、guideline 或 skill proposal。
- 默认低摩擦，本地优先，个人经验可不推送到团队仓库。

### 团队入口

团队用户有 OpenClaw 沙箱、K8s 故障定位系统、飞书 workflow、CI job、Hermes curator、临时修复 agent。

团队入口要解决：

- 工单、日志、飞书群消息、修复 episode 自动沉淀。
- 团队规范、技术知识、业务知识、项目知识可分层治理。
- 低风险更新可由 AI review 自动合并，高风险和矛盾进入人工异常队列。
- 新工作流启动时自动站在已有经验上，而不是每次从零开始。

## 四维知识模型

PraxisBase 不只使用单一目录层级，而是把知识分为四个正交维度。

### Scope：谁能用

| Scope | 说明 | 默认治理 |
| --- | --- | --- |
| `personal` | 个人偏好、个人经验、本地 agent 记忆 | 可本地自动写入，默认不共享 |
| `project` | 当前 repo 或项目内有效的上下文 | 可由项目内 AI review 自动提案 |
| `team` | 团队跨项目可复用经验 | 需要 evidence 和 review |
| `org` | 组织级策略、安全红线、通用规范 | 默认高风险，人工或强审核 |

### Layer：知识边界

| Layer | 说明 | 示例 |
| --- | --- | --- |
| `preference` | 个人偏好 | “我喜欢中文解释，代码注释保持英文” |
| `convention` | 团队/组织约定 | commit 规范、review 标准、安全要求 |
| `technical` | 通用技术知识 | OpenClaw auth 修复、K8s OOM 诊断 |
| `domain` | 业务/领域知识 | 广告审核流程、结算规则 |
| `project` | 项目局部知识 | 本 repo 的目录结构、部署脚本、历史坑 |

### Type：知识是什么

| Type | 说明 |
| --- | --- |
| `model` | 实体、系统模型、数据结构、关系 |
| `decision` | 技术选型、架构决策和原因 |
| `guideline` | 推荐做法或检查清单 |
| `pitfall` | 已知坑、风险、反模式、失败诊断 |
| `process` | 流程、状态机、操作步骤 |
| `known_fix` | 已知问题的修复方案 |
| `procedure` | 可重复执行的操作流程 |
| `skill` | 可被 agent 加载的 `SKILL.md` 能力 |
| `policy` | 强约束、安全边界、审批规则 |
| `note` | 低结构化补充记录 |

### Maturity：多可信

| Maturity | 说明 |
| --- | --- |
| `draft` | 新提取、单一来源、未充分验证 |
| `verified` | 已在一个项目/环境/任务中成功引用 |
| `proven` | 跨环境、跨 agent、跨时间窗口验证 |
| `stale` | 曾有效，但近期引用不足或出现负反馈 |
| `archived` | 移出活跃索引，仅保留审计和追溯 |

这四维模型避免把“共享范围”“知识领域”“知识形态”“可信度”混在同一层目录里。目录可以按部署场景调整，但 frontmatter 必须保留这四个维度。

稳定知识对象的最小 frontmatter：

```yaml
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
layer: technical
maturity: draft
signatures:
  - openclaw:claude-auth-expired
source_refs:
  - log://openclaw/sandbox-123/run-456
source_hashes:
  - sha256:example
redacted_summary: "Claude auth expired; refresh fixed the session."
created_at: 2026-05-19T00:00:00Z
updated_at: 2026-05-19T00:00:00Z
```

其中 `scope`、`layer`、`knowledge_type` 和 `maturity` 是检索、治理和权限边界的输入；`source_refs`、`source_hashes` 和 `redacted_summary` 是审计输入；正文负责保存人和 agent 可读的稳定内容。

## 统一 CLI 适配方案

第一版不要为每个 agent 写深插件。所有 agent 统一通过 PraxisBase CLI 工作：

```text
praxisbase context get ...
praxisbase capture finish ...
praxisbase episode submit ...
praxisbase propose submit ...
praxisbase memory import ...
praxisbase memory refresh ...
praxisbase watch ...
praxisbase distill run ...
```

Agent 差异放在 adapter profile，不进入核心协议。

```text
adapters/
  codex.yaml
  claude-code.yaml
  opencode.yaml
  openclaw.yaml
  hermes.yaml
  generic.yaml
```

示例 profile：

```yaml
agent: codex
instruction_files:
  - AGENTS.md
transcript_paths:
  - ~/.codex/sessions
workspace_markers:
  - AGENTS.md
capture:
  default_triggers:
    - task_finish
    - tests_run
    - git_diff_changed
context:
  default_stages:
    - diagnosis
    - repair
    - verification
```

安装命令只负责写入指令片段、hook 脚本或 watcher 配置：

```text
praxisbase install codex
praxisbase install claude-code
praxisbase install opencode
praxisbase install openclaw
praxisbase install hermes
praxisbase install generic
```

不同 agent 的最终行为保持一致：

```text
任务开始 -> praxisbase context get --agent <agent> --workspace <path> --stage <stage>
任务结束 -> praxisbase capture finish --agent <agent> --workspace <path> --result <result>
后台治理 -> praxisbase distill run && praxisbase review --auto && praxisbase build
```

### CLI 命令契约

核心命令必须保持小而稳定：

| 命令 | 输入 | 输出 | 是否修改稳定知识 |
| --- | --- | --- | --- |
| `context get` | agent、workspace、stage、可选 signature/query | compact context JSON 或 Markdown | 否 |
| `capture finish` | agent、workspace、result、可选 test/build/git metadata | `.praxisbase/outbox/captures/*.json` | 否 |
| `capture submit` | capture JSON 或 raw artifact refs | outbox capture 或 inbox episode draft | 否 |
| `episode submit` | structured episode JSON | `.praxisbase/inbox/episodes/*.json` | 否 |
| `propose submit` | proposal JSON 或 patch draft | `.praxisbase/inbox/proposals/*.json` | 否 |
| `memory import` | agent profile、memory source、raw vault policy | capture records、import report、proposal candidates | 否 |
| `memory refresh` | promoted PraxisBase context、agent profile | install snippets、compact bundles、optional native-memory patch proposals | 不直接写稳定知识 |
| `watch` | agent profile、workspace、raw vault path | capture batches、episode drafts、run reports | 否 |
| `distill run` | captures、episodes、stable knowledge | proposals、reports、exceptions | 否 |
| `install <agent>` | adapter profile、workspace | instruction snippet、hook config、watcher config | 只写安装目标 |

所有命令默认支持 `--json`，并且在失败时返回结构化错误：

```json
{
  "ok": false,
  "code": "RAW_ARTIFACT_REJECTED",
  "message": "Raw transcript must be stored in the raw vault, not committed to Git.",
  "retryable": false,
  "details": {
    "path": "kb/session-transcript.md",
    "suggested_storage": ".praxisbase/raw-vault/"
  }
}
```

稳定知识仍然只通过 `review` 和 `promote` 进入 `kb/` 或 `skills/`。`memory import`、`memory refresh`、`capture`、`watch` 和 `distill` 只能写 outbox、inbox、reports、runs、exceptions 或 refresh plan。

## Native Memory Bridge / 原生记忆桥

各 agent 自有记忆不应该被 PraxisBase 替代。更好的边界是：

> Agent native memory is a source and cache; PraxisBase is the shared authority and governance lane.

也就是说，Codex、Claude Code、OpenCode、Hermes、OpenHuman、OpenClaw 等工具可以继续保留自己的记忆、skills、session history、persona 和 instruction files。PraxisBase 通过 memory bridge 读取这些材料，蒸馏成 capture、episode 或 proposal；稳定知识经过 review/promotion 后，再以 context bundle、skill、instruction snippet 或 adapter refresh 的方式回流给各 agent。

### 三种流向

| 流向 | 说明 | 默认安全边界 |
| --- | --- | --- |
| Initial backfill | 初始接入时扫描现有 agent memory、skills、sessions、notes | 只生成 captures/import reports/proposals |
| Continuous extraction | 后续定期或任务结束后从 native memory 增量提取 | 按 source hash 去重，不直接写稳定知识 |
| Downstream refresh | 把 PraxisBase 晋升后的知识回流给 agent runtime | 默认生成 context bundle 或 install snippet，不静默覆盖 native memory |

这个桥不是“所有记忆实时同步”。它是一个治理管道：读取、脱敏、蒸馏、审核、晋升、分发。

### Source Adapter

每种 agent 的原生记忆通过 source adapter 描述：

| Source | 可读取内容 | 默认 scope | 利用方式 |
| --- | --- | --- | --- |
| Codex | archived sessions、prompt history、AGENTS.md、skills | `personal` 或 `project` | 提取偏好、项目经验、procedure、pitfall |
| Claude Code | CLAUDE.md、session summaries、local memory | `personal` 或 `project` | 提取项目约定和用户纠正 |
| OpenCode | instruction files、session logs、tool output | `project` | 提取工程修复经验 |
| Hermes | memory、agent-created skills、curator patches | `personal` 或 `team` proposal | 复用 skill synthesis 和 curator 输出 |
| OpenHuman | persona、preference、human memory | `personal` | 提取个人偏好，默认不共享 |
| OpenClaw | repair episodes、sandbox logs、known fixes | `project` 或 `team` | 提取修复知识和验证经验 |
| Generic | JSONL、Markdown、outbox captures | profile 决定 | 作为最低接入协议 |

Source adapter 必须只描述读取位置、脱敏策略、默认 scope、可提取对象类型和回流方式。它不能定义知识晋升规则；治理规则仍然由 PraxisBase core policy 统一决定。

### Hermes 和 OpenHuman 的特殊价值

Hermes 已经有 agent-managed skills、persistent memory 和 curator 能力。PraxisBase 应该把 Hermes 当作高质量上游和下游，而不是硬依赖：

- Hermes 产出的 skill、memory summary、curator patch 进入 PraxisBase 时，默认是 proposal。
- PraxisBase 审核晋升后的 shared skill 可以回流给 Hermes，让 Hermes 的本地 skill registry 更强。
- Hermes 的自动总结能力可以作为 distill provider，但不能绕过 PraxisBase review/promotion。

OpenHuman 更偏 personal memory、persona 和 preference：

- 默认只进入 `scope=personal`。
- 只有用户明确标记可共享，或 reviewer 判断为项目事实，才生成 project/team proposal。
- persona、偏好和私人上下文不能自动提升为 team/org。

### 回流策略

PraxisBase 回流给 agent 的内容分三档：

1. **Runtime context**：`context get` 返回 compact context，最安全。
2. **Install snippet**：`install <agent>` 写入受 marker 管理的指令片段。
3. **Native memory patch proposal**：对支持本地 memory/skill 的 agent，生成可审阅 patch；默认不静默写入。

第一版只要求 runtime context 和 install snippet。Native memory patch proposal 可以作为后续增强，但文档和 schema 要预留 source refs、target agent、target path、review status。

## 三层捕获机制

自动上传不能等于每轮对话都 push。PraxisBase 采用三层机制：hook 捕获、watcher 兜底、scheduled distill 治理。

### Hook Capture

Hook 捕获是首选，但它只负责低成本捕获证据，不直接写稳定知识。

| Hook | 行为 | 是否默认开启 |
| --- | --- | --- |
| turn hook | 记录轻量事件到本地 ring buffer | 否 |
| task hook | 任务结束时生成 capture batch 或 episode draft | 是 |
| session hook | 会话压缩或结束时生成摘要 | 是 |

触发阈值：

- 任务耗时超过配置阈值。
- 产生 git diff。
- 跑过测试、构建或验证命令。
- 出现错误后修复成功。
- 引用了 PraxisBase 知识。
- 用户明确采纳、拒绝或纠正了 agent 方案。
- agent 产生了可复用 skill、procedure、pitfall 或 decision。

去抖规则：

- 同一 `workspace + agent + session` 在 5 到 10 分钟窗口内合并为一个 capture batch。
- capture 写入 `.praxisbase/outbox/captures/`，不直接 push。
- 大日志和完整 transcript 只进入 raw vault，Git 只保存 refs、hash、redacted summary。

### Watcher Capture

Watcher 是旁路兼容层，适合无法稳定安装 hook 的 agent。

```text
praxisbase watch --agent codex --workspace /repo
praxisbase watch --agent claude-code --workspace /repo
praxisbase watch --agent openclaw --sandbox /path
```

Watcher 监听：

- agent transcript 或日志目录，
- workspace git diff，
- test/build output，
- `.praxisbase/outbox/`，
- 特定 sandbox 或 CI artifact 路径。

Watcher 处理流程：

```text
file event
  -> debounce and batch
  -> detect task boundary
  -> snapshot metadata
  -> write raw artifact refs
  -> emit capture record or episode draft
```

Watcher 不推断稳定知识，不改 `kb/` 或 `skills/`。它只把“发生了什么”整理成可供 distill 使用的输入。

### Scheduled Distill

Scheduled distill 是独立治理任务，负责从 captures 和 episodes 中提炼知识候选。

触发方式：

- 个人：本地 `praxisbase daemon`、`launchd` 或手动命令。
- 团队：GitLab CI schedule、GitHub Actions schedule。
- OpenClaw 平台：平台侧定时扫各 sandbox outbox。

推荐节奏：

| 频率 | 动作 |
| --- | --- |
| 每小时 | 同步 outbox，生成 episode，更新引用报告 |
| 每天 | distill captures，生成 memory/skill/known_fix/pitfall proposal |
| 每周 | lint、duplicate/contradiction scan、maturity proposal、decay proposal |
| 每月 | 归档 stale raw artifacts，压缩索引，生成治理报告 |

Scheduled distill 输出：

```text
.praxisbase/inbox/episodes/
.praxisbase/inbox/proposals/
.praxisbase/reports/
.praxisbase/exceptions/
```

它不直接修改 `kb/` 或 `skills/`。稳定知识仍然经过 review、promotion、build。

### Capture Record

Capture record 是 hook 和 watcher 的共同输出。它描述“发生了什么”，不直接声明“应该沉淀成什么知识”。

```json
{
  "id": "capture_20260519_codex_001",
  "protocol_version": "0.1",
  "agent": "codex",
  "workspace": "/repo",
  "scope_hint": "project",
  "result": "success",
  "triggers": ["task_finish", "git_diff_changed", "tests_run"],
  "signals": {
    "has_git_diff": true,
    "tests_passed": true,
    "user_correction": false,
    "used_praxisbase_context": true
  },
  "artifacts": [
    {
      "kind": "transcript",
      "source_ref": "raw-vault://codex/session-abc",
      "source_hash": "sha256:abc",
      "redacted_summary": "Implemented a fix after consulting an OpenClaw auth repair note."
    }
  ],
  "created_at": "2026-05-19T00:00:00Z"
}
```

`scope_hint` 只是建议。真正写 proposal 时，distill 需要结合 workspace、agent profile、source sensitivity、用户标记和 reviewer 结果重新判断 scope。

## Raw Artifact 策略

原始材料不要直接进入 Git。

| 数据 | 存放位置 |
| --- | --- |
| 完整对话 transcript | local raw vault 或外部对象存储 |
| OpenClaw/K8s 大日志 | 日志平台、对象存储、CI artifact |
| 飞书群消息原文 | 飞书导出源、对象存储、受控 raw vault |
| Git diff、测试摘要 | capture record 可保存摘要和 hash |
| 稳定知识 | Git 中的 `kb/` 和 `skills/` |

Git 中只保存：

- `source_refs`
- `source_hash`
- `redacted_summary`
- episode/proposal/review/report
- 必要的短 excerpt

这样既能追溯，又不会把敏感日志、聊天记录、密钥或大文件永久写入 Git 历史。

## Agent 适配矩阵

| Agent | 统一入口 | 适配内容 | 深度插件是否必须 |
| --- | --- | --- | --- |
| Codex | CLI + AGENTS.md | skill、AGENTS.md 片段、capture finish 指令 | 否 |
| Claude Code | CLI + CLAUDE.md | CLAUDE.md 片段、可选 hook、watcher profile | 否 |
| OpenCode | CLI + instruction | instruction/plugin 配置、watcher profile | 否 |
| Hermes | CLI + curator bridge | skill synthesis、memory curator、proposal generator | 否 |
| OpenClaw | CLI + repair adapter | repair-context、episode submit、sandbox watcher | 否 |
| OpenHuman | CLI + generic adapter | session capture、persona/task context fetch | 否 |
| Generic agent | CLI + JSON outbox | 读 bundle、写 capture/episode/proposal JSON | 否 |

深度插件不属于本变更的交付要求。MVP 只要求 agent 能执行 CLI 或写 JSON 到 outbox。

Adapter profile 只描述“如何接入”，不描述“如何治理知识”。治理规则必须留在 core policy 中，避免每个 agent 形成自己的知识标准。

Profile 必须包含：

- `agent`：稳定 agent 类型 id。
- `instruction_files`：可安装指令片段的位置。
- `transcript_paths` 或 `raw_artifact_paths`：watcher 能读取的原始材料来源。
- `workspace_markers`：用于判断项目边界。
- `capture.default_triggers`：默认捕获信号。
- `context.default_stages`：该 agent 常用检索阶段。
- `privacy.redaction_profile`：默认脱敏策略。

## 查询与消费

Agent 不应该在启动时吞下整个知识库。默认流程是渐进式查询：

```text
context catalog
  -> stage-aware compact bundle
  -> selected full objects
  -> optional source refs
```

Stage-aware 预算沿用 Phase 2：

- `diagnosis`：优先 signature、pitfall、known_fix。
- `repair`：优先 skill、procedure、forbidden operations。
- `verification`：优先 verification、rollback、escalation。
- `proposal`：优先相似条目、evidence contract、prior reviews。

排序优先级：

1. exact signature 或 project match，
2. scope 贴近当前任务，
3. maturity 更高，
4. 风险更低，
5. 最近正向引用，
6. 引用次数更多。

## 经验提炼规则

不是所有 capture 都值得变成知识。Distill 只为满足信号的 capture 生成 proposal：

| 信号 | 候选类型 |
| --- | --- |
| 错误被成功修复，且有验证 | `known_fix` 或 `procedure` |
| 用户纠正 agent，且后续验证有效 | `guideline` 或 `pitfall` |
| 多次重复执行同一流程 | `skill` 或 `procedure` |
| 架构选择被明确采纳 | `decision` |
| 发现禁止操作或高风险路径 | `pitfall` 或 `policy` |
| 项目事实影响后续任务 | `model` 或 `project` note |

个人经验默认进入 `scope=personal`。只有满足以下条件之一才建议提升：

- 被多个 agent 或多个 session 正向引用。
- 同一项目中重复有效。
- 明确适用于团队场景。
- 与业务/技术通用知识有关。
- 用户或 reviewer 标记为可共享。

Scope 晋升规则：

| 晋升 | 必要条件 |
| --- | --- |
| `personal -> project` | 用户或 agent 明确绑定到当前 workspace，且不包含私人偏好或敏感原文 |
| `project -> team` | 至少两个 session 或两个 agent 在同一项目/相近项目正向引用，并且 reviewer 判断可复用 |
| `team -> org` | 涉及跨团队规范、安全策略或通用流程，必须进入 human-required 或强 AI review 队列 |

失败引用不会直接删除知识，但会影响提炼和晋升：

- 单次失败引用写入 reference report。
- 新失败引用阻止 maturity 晋升。
- 多次失败或 proven 知识失败进入 stale/exception proposal。
- 与已有 policy 或 forbidden action 冲突时进入 conflict exception。

## 治理边界

自动化默认只做三件事：

1. 捕获事实和证据。
2. 生成结构化 episode/proposal/report。
3. 提出 maturity、decay、merge、archive 建议。

自动化不做：

- 直接把 raw logs 写进 Git。
- 直接改稳定 `kb/` 或 `skills/`。
- 自动把 personal 经验提升到 team/org。
- 自动合并内容矛盾。
- 自动发布高风险 policy。

人工只处理：

- 高风险 proposal，
- org scope 变更，
- 内容矛盾，
- 隐私或安全不确定项，
- AI reviewer 无法判定的异常。

## 错误处理与降级

PraxisBase 不能成为 agent 执行任务的单点依赖。任何适配都必须遵守以下降级策略：

- `context get` 失败时，agent 可以继续执行任务，但要在 capture 中记录 `context_unavailable`。
- `capture finish` 失败时，agent 将 capture JSON 写到本地 outbox 或 stdout，不能阻塞用户任务完成。
- `watch` 崩溃时，不应修改 raw artifact；重启后按 source hash 去重。
- `distill run` 失败时，只写 run record 和 exception，不产生半截 proposal。
- `install <agent>` 必须支持 dry-run，展示会写入哪些文件和片段。

隐私和安全错误默认不可重试。网络、Git push、远端 CI 暂时失败可以重试，但重试必须保持 idempotency key 不变。

## MVP 切分

### M0: 通用 CLI 协议

- `context get`
- `capture finish`
- `capture submit`
- `watch`
- `distill run`
- JSON outbox schema
- shared structured error format

### M1: Adapter Profiles

- `install codex`
- `install claude-code`
- `install opencode`
- `install openclaw`
- `install hermes`
- `install generic`
- dry-run installation output

### M2: Native Memory Bridge

- native memory source adapter schema。
- `memory import` 初始 backfill。
- `memory refresh` 生成 context/snippet/patch proposal。
- source hash 去重。
- Hermes skill/memory proposal 输入。
- OpenHuman personal memory 默认 personal scope。

### M3: Capture And Raw Vault

- 本地 raw vault。
- source refs/hash/redacted summary。
- debounced capture batches。
- session/task boundary detection。
- raw artifact rejection under Git-tracked stable knowledge paths。

### M4: Distill Proposals

- capture -> episode。
- episode -> memory/skill/known_fix/pitfall proposal。
- personal/project/team/org scope suggestion。
- duplicate and contradiction precheck。
- scope escalation proposal boundary。

### M5: Governance Integration

- 引用追踪。
- maturity proposal。
- decay/stale proposal。
- lint reports。
- build compact bundles。
- context get budget enforcement。

### M6: Docs And Smoke Verification

- README 和 deployment docs。
- OpenSpec、BDD、implementation plan 对齐。
- init seed paths。
- full CLI smoke flow。

每个里程碑都必须有对应 BDD 场景、CLI smoke test 和 docs update。M0 到 M4 可以先只支持 Codex、OpenClaw、Hermes、OpenHuman 和 generic profile；Claude Code、OpenCode profile 可以在 M1/M2 补齐，但深度插件不进入 MVP。

## 成功标准

第一版 multi-agent experience layer 成功，不以支持多少深插件衡量，而以以下结果衡量：

- Codex、Claude Code、OpenCode、OpenClaw 至少都能通过 CLI 使用同一协议。
- Codex、Hermes、OpenHuman 或 generic source 的已有原生记忆能被初始 backfill 成 capture/proposal，而不是原样写入 Git。
- 一个 agent 的成功经验能在另一个 agent 的后续任务中被检索到。
- 原始日志不进 Git，但每条知识都能追溯到 source refs 和 hash。
- personal/project/team/org 的提升边界清晰。
- 自动化能生成 proposal，但稳定知识仍然可审计、可回滚。
- 定时治理能发现重复、矛盾、过期和低引用知识。

## 设计结论

PraxisBase 应把每种 agent 的差异压缩到 adapter profile 和安装片段里，把核心能力统一在 CLI 和 file protocol 上。

> Hook 负责捕获，Watcher 负责兼容，Schedule 负责提炼和治理。

这样项目可以同时服务个人多 agent 记忆共享、团队知识库共建、OpenClaw 修复经验沉淀、Hermes-like skill evolution，并保持 Git-backed、可审计、低依赖的工程形态。
